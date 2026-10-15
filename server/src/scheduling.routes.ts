import { Router } from 'express';
import { notifyClinicActivity } from './clinic-notifications.js';
import { z } from 'zod';
import { allowRoles, requireAuth, requireOtp } from './auth.js';
import { pool } from './db.js';
import { bookableSlotConditions, validClinicTime, schedulingConflict } from './workflow-policy.js';

const router = Router();
router.use(requireAuth, requireOtp);
const managers = allowRoles('admin', 'receptionist', 'doctor');

router.get('/doctors/:id/availability', async (req, res) => {
  const doctorId = z.string().uuid().safeParse(req.params.id);
  const date = z.string().date().safeParse(req.query.date);
  if (!doctorId.success || !date.success)
    return res.status(400).json({ error: 'Provide a valid doctor id and date (YYYY-MM-DD).' });
  try {
    const result = await pool.query(
      `SELECT s.id, s.doctor_id, s.starts_at, s.ends_at
       FROM doctor_availability_slots s JOIN clinic_doctors d ON d.id = s.doctor_id
       JOIN clinic_settings c ON c.id = true
       WHERE s.doctor_id = $1 AND ${bookableSlotConditions}
         AND (s.starts_at AT TIME ZONE c.timezone)::date = $2::date ORDER BY s.starts_at`,
      [doctorId.data, date.data]
    );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load available appointment times.' });
  }
});

router.get('/availability-slots', managers, async (req, res) => {
  const query = z.object({ doctorId: z.string().uuid().optional() }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Invalid doctor filter.' });
  try {
    const result = await pool.query(
      `SELECT s.id, s.doctor_id, s.starts_at, s.ends_at, s.status, d.full_name AS doctor_name
       FROM doctor_availability_slots s JOIN clinic_doctors d ON d.id = s.doctor_id
       WHERE ($1::uuid IS NULL OR s.doctor_id = $1)
         AND ($2::text <> 'doctor' OR d.user_id = $3) ORDER BY s.starts_at DESC LIMIT 2000`,
      [query.data.doctorId ?? null, req.auth!.role, req.auth!.userId]
    );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load the availability schedule.' });
  }
});

const slotSchema = z.object({
  doctorId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});
const editSlotSchema = slotSchema
  .omit({ doctorId: true })
  .partial()
  .extend({ status: z.enum(['available', 'blocked']).optional() });

async function validSlot(
  client: import('pg').PoolClient,
  doctorId: string,
  startsAt: Date,
  endsAt: Date
) {
  const duration = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (duration <= 0 || duration > 30) return false;
  const result = await client.query<{ allowed: boolean }>(
    `SELECT $2::timestamptz > now()
      AND ($2::timestamptz AT TIME ZONE c.timezone)::date = ($3::timestamptz AT TIME ZONE c.timezone)::date
      AND ($2::timestamptz AT TIME ZONE c.timezone)::time >= c.opens_at
      AND ($3::timestamptz AT TIME ZONE c.timezone)::time <= c.closes_at
      AND NOT EXISTS (SELECT 1 FROM clinic_holidays h WHERE h.holiday_date = ($2::timestamptz AT TIME ZONE c.timezone)::date)
      AND NOT EXISTS (SELECT 1 FROM doctor_leave_requests l JOIN clinic_doctors d ON d.user_id = l.doctor_user_id
        WHERE d.id = $1 AND l.status = 'approved' AND ($2::timestamptz AT TIME ZONE c.timezone)::date BETWEEN l.starts_on AND l.ends_on)
      AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.doctor_id = $1 AND a.status NOT IN ('cancelled','no_show')
        AND tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')) AS allowed
     FROM clinic_settings c WHERE c.id = true FOR SHARE OF c`,
    [doctorId, startsAt, endsAt]
  );
  return result.rows[0]?.allowed === true;
}

router.post('/availability-slots', managers, async (req, res) => {
  const parsed = slotSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid availability slot.', details: parsed.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doctor = await client.query<{ user_id: string; active: boolean }>(
      'SELECT user_id, active FROM clinic_doctors WHERE id = $1 FOR UPDATE',
      [parsed.data.doctorId]
    );
    if (!doctor.rowCount || !doctor.rows[0].active) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Doctor is not active.' });
    }
    if (req.auth!.role === 'doctor' && doctor.rows[0].user_id !== req.auth!.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Doctors can only set their own availability.' });
    }
    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    if (!(await validSlot(client, parsed.data.doctorId, startsAt, endsAt))) {
      await client.query('ROLLBACK');
      return res
        .status(422)
        .json({
          error:
            'Use a future slot of up to 30 minutes within clinic hours, outside holidays, approved leave and existing appointments.',
        });
    }
    const result = await client.query(
      'INSERT INTO doctor_availability_slots (doctor_id, starts_at, ends_at, created_by) VALUES ($1,$2,$3,$4) RETURNING id, doctor_id, starts_at, ends_at, status',
      [parsed.data.doctorId, startsAt, endsAt, req.auth!.userId]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1,'availability.created','availability_slot',$2)`,
      [req.auth!.userId, result.rows[0].id]
    );
    await client.query('COMMIT');
    return res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return res
      .status(schedulingConflict(error) ? 409 : 503)
      .json({ error: 'Unable to save availability. Check for overlapping slots.' });
  } finally {
    client.release();
  }
});

router.patch('/availability-slots/:id', managers, async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = editSlotSchema.safeParse(req.body);
  if (
    !id.success ||
    !parsed.success ||
    !Object.keys(parsed.data).length ||
    !!parsed.data.startsAt !== !!parsed.data.endsAt
  )
    return res.status(400).json({ error: 'Provide a status or both start and end times.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT s.*, d.user_id,d.active FROM doctor_availability_slots s JOIN clinic_doctors d ON d.id=s.doctor_id WHERE s.id=$1 FOR UPDATE OF s,d`,
      [id.data]
    );
    const slot = found.rows[0];
    if (!slot || (req.auth!.role === 'doctor' && slot.user_id !== req.auth!.userId)) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Availability slot not found for this account.' });
    }
    if (slot.status === 'booked') {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({ error: 'Cancel or reschedule its appointment before changing a booked slot.' });
    }
    if ((parsed.data.status ?? slot.status) === 'available' && !slot.active) {
      await client.query('ROLLBACK');
      return res
        .status(422)
        .json({ error: 'Reactivate this doctor before making availability bookable.' });
    }
    const references = await client.query(
      'SELECT 1 FROM appointments WHERE availability_slot_id=$1 UNION ALL SELECT 1 FROM appointment_reschedule_events WHERE old_slot_id=$1 OR new_slot_id=$1 LIMIT 1',
      [id.data]
    );
    if (parsed.data.startsAt && references.rowCount) {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({
          error:
            'This slot is part of appointment history. Block it and create a new slot instead.',
        });
    }
    const startsAt = new Date(parsed.data.startsAt ?? slot.starts_at);
    const endsAt = new Date(parsed.data.endsAt ?? slot.ends_at);
    if (
      (parsed.data.status ?? slot.status) === 'available' &&
      !(await validSlot(client, slot.doctor_id, startsAt, endsAt))
    ) {
      await client.query('ROLLBACK');
      return res
        .status(422)
        .json({
          error:
            'Availability conflicts with clinic hours, past time, leave, holidays or an appointment.',
        });
    }
    const updated = await client.query(
      'UPDATE doctor_availability_slots SET starts_at=$2, ends_at=$3, status=$4 WHERE id=$1 RETURNING id,doctor_id,starts_at,ends_at,status',
      [id.data, startsAt, endsAt, parsed.data.status ?? slot.status]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'availability.updated','availability_slot',$2)`,
      [req.auth!.userId, id.data]
    );
    await client.query('COMMIT');
    return res.json({ data: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return res
      .status(schedulingConflict(error) ? 409 : 503)
      .json({ error: 'Unable to update availability. Check for overlapping slots.' });
  } finally {
    client.release();
  }
});

router.delete('/availability-slots/:id', managers, async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid availability slot.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT s.id,s.status,d.user_id FROM doctor_availability_slots s JOIN clinic_doctors d ON d.id=s.doctor_id WHERE s.id=$1 FOR UPDATE OF s`,
      [id.data]
    );
    if (
      !found.rowCount ||
      (req.auth!.role === 'doctor' && found.rows[0].user_id !== req.auth!.userId)
    ) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Availability slot not found.' });
    }
    if (found.rows[0].status === 'booked') {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({ error: 'Cancel or reschedule the appointment before removing a booked slot.' });
    }
    await client.query('DELETE FROM doctor_availability_slots WHERE id=$1', [id.data]);
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'availability.deleted','availability_slot',$2)`,
      [req.auth!.userId, id.data]
    );
    await client.query('COMMIT');
    return res.json({ data: { id: id.data } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return res
      .status(
        typeof error === 'object' && error !== null && 'code' in error && error.code === '23503'
          ? 409
          : 503
      )
      .json({
        error: 'This slot belongs to appointment history. Block it instead of deleting it.',
      });
  } finally {
    client.release();
  }
});

router.get('/clinic/settings', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT timezone, opens_at, closes_at, default_appointment_minutes, minimum_reschedule_notice_hours FROM clinic_settings WHERE id=true'
    );
    if (!result.rowCount)
      return res.status(503).json({ error: 'Clinic settings are not configured.' });
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to load clinic settings.' });
  }
});

router.put('/clinic/settings', allowRoles('admin'), async (req, res) => {
  const parsed = z
    .object({
      timezone: z.string().trim().min(1).max(100),
      opensAt: z.string().refine(validClinicTime),
      closesAt: z.string().refine(validClinicTime),
      defaultAppointmentMinutes: z.number().int().min(10).max(30),
      minimumRescheduleNoticeHours: z.number().int().min(0).max(168),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid clinic settings.', details: parsed.error.flatten() });
  if (parsed.data.closesAt <= parsed.data.opensAt)
    return res.status(422).json({ error: 'Closing time must be after opening time.' });
  try {
    new Intl.DateTimeFormat('en', { timeZone: parsed.data.timezone }).format();
  } catch {
    return res
      .status(422)
      .json({ error: 'Use a valid IANA timezone, for example Africa/Johannesburg.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM clinic_settings WHERE id=true FOR UPDATE');
    const affected = await client.query(
      `SELECT 1 FROM appointments WHERE status IN ('pending','confirmed','in_progress') AND ends_at>now() AND (
      (starts_at AT TIME ZONE $1)::time<$2::time OR (ends_at AT TIME ZONE $1)::time>$3::time
      OR (starts_at AT TIME ZONE $1)::date<>(ends_at AT TIME ZONE $1)::date) LIMIT 1`,
      [parsed.data.timezone, parsed.data.opensAt, parsed.data.closesAt]
    );
    if (affected.rowCount) {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({
          error:
            'These hours or timezone would put existing appointments outside clinic hours. Reschedule those appointments first.',
        });
    }
    const result = await client.query(
      `UPDATE clinic_settings SET timezone=$1, opens_at=$2::time, closes_at=$3::time, default_appointment_minutes=$4, minimum_reschedule_notice_hours=$5, updated_at=now() WHERE id=true RETURNING timezone,opens_at,closes_at,default_appointment_minutes,minimum_reschedule_notice_hours`,
      [
        parsed.data.timezone,
        parsed.data.opensAt,
        parsed.data.closesAt,
        parsed.data.defaultAppointmentMinutes,
        parsed.data.minimumRescheduleNoticeHours,
      ]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type) VALUES ($1,'clinic.settings.updated','clinic_settings')`,
      [req.auth!.userId]
    );
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to update clinic settings.' });
  } finally {
    client.release();
  }
});

router.get('/clinic/holidays', async (_req, res) => {
  try {
    const result = await pool.query('SELECT holiday_date::text,title FROM clinic_holidays ORDER BY holiday_date');
    return res.json({ data: result.rows });
  } catch { return res.status(503).json({ error: 'Unable to load clinic closures.' }); }
});

router.post('/clinic/holidays', allowRoles('admin'), async (req, res) => {
  const body = z.object({ date: z.string().date(), title: z.string().trim().min(2).max(160) }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Provide a date and closure reason.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const settings = await client.query('SELECT timezone FROM clinic_settings WHERE id=true FOR UPDATE');
    const conflict = await client.query(
      `SELECT 1 FROM appointments WHERE status IN ('pending','confirmed','in_progress') AND ends_at>now()
       AND (starts_at AT TIME ZONE $1)::date=$2::date LIMIT 1`, [settings.rows[0].timezone, body.data.date]);
    if (conflict.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Reschedule or cancel appointments on this date before closing the clinic.' });
    }
    const result = await client.query(
      'INSERT INTO clinic_holidays(holiday_date,title,created_by) VALUES ($1,$2,$3) ON CONFLICT(holiday_date) DO UPDATE SET title=EXCLUDED.title RETURNING holiday_date::text,title',
      [body.data.date,body.data.title,req.auth!.userId]);
    await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type) VALUES ($1,'clinic.closure.saved','clinic_holiday')", [req.auth!.userId]);
    await client.query('COMMIT');
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to save clinic closure.' });
  } finally { client.release(); }
});

router.delete('/clinic/holidays/:date', allowRoles('admin'), async (req, res) => {
  const date = z.string().date().safeParse(req.params.date);
  if (!date.success) return res.status(400).json({ error: 'Invalid closure date.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM clinic_settings WHERE id=true FOR UPDATE');
    const result = await client.query('DELETE FROM clinic_holidays WHERE holiday_date=$1 RETURNING holiday_date::text', [date.data]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Closure not found.' }); }
    await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type) VALUES ($1,'clinic.closure.removed','clinic_holiday')", [req.auth!.userId]);
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch { await client.query('ROLLBACK').catch(() => undefined); return res.status(503).json({ error: 'Unable to remove clinic closure.' }); }
  finally { client.release(); }
});

router.post('/appointments/:id/reschedule', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const body = z.object({ slotId: z.string().uuid() }).safeParse(req.body);
  if (!id.success || !body.success)
    return res.status(400).json({ error: 'Provide a valid appointment and availability slot.' });
  const { userId, role } = req.auth!;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT a.*,d.user_id AS doctor_user_id FROM appointments a JOIN clinic_doctors d ON d.id=a.doctor_id WHERE a.id=$1 FOR UPDATE OF a`,
      [id.data]
    );
    const appointment = existing.rows[0];
    if (!appointment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Appointment not found.' });
    }
    if (
      (['patient', 'student', 'lecturer', 'staff'].includes(role) &&
        appointment.patient_user_id !== userId) ||
      (role === 'doctor' && appointment.doctor_user_id !== userId)
    ) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You cannot reschedule this appointment.' });
    }
    if (
      !['pending', 'confirmed'].includes(appointment.status) ||
      appointment.reschedule_count >= 10
    ) {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({
          error:
            'Only pending or confirmed appointments with fewer than 10 reschedules can be rescheduled.',
        });
    }
    await client.query('INSERT INTO account_status(user_id) VALUES ($1) ON CONFLICT(user_id) DO NOTHING', [appointment.patient_user_id]);
    const patientAccount = await client.query('SELECT active FROM account_status WHERE user_id=$1 FOR UPDATE', [appointment.patient_user_id]);
    if (patientAccount.rows[0]?.active === false) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This patient account is inactive.' });
    }
    const policy = await client.query<{ minimum_reschedule_notice_hours: number }>(
      'SELECT minimum_reschedule_notice_hours FROM clinic_settings WHERE id=true FOR SHARE'
    );
    const hours = policy.rows[0]?.minimum_reschedule_notice_hours ?? 24;
    const notice = await client.query<{ allowed: boolean }>(
      `SELECT $1::timestamptz >= now()+($2::int*interval '1 hour') AS allowed`,
      [appointment.starts_at, hours]
    );
    if (!notice.rows[0]?.allowed) {
      await client.query('ROLLBACK');
      return res
        .status(422)
        .json({ error: `Reschedule at least ${hours} hours before the existing appointment.` });
    }
    const available = await client.query(
      `SELECT s.id,s.doctor_id,s.starts_at,s.ends_at,d.user_id AS doctor_user_id,d.full_name AS doctor_name FROM doctor_availability_slots s JOIN clinic_doctors d ON d.id=s.doctor_id JOIN clinic_settings c ON c.id=true WHERE s.id=$1 AND ${bookableSlotConditions} FOR UPDATE OF s,d FOR SHARE OF c`,
      [body.data.slotId]
    );
    const slot = available.rows[0];
    if (!slot) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The selected time is no longer available.' });
    }
    if (role === 'doctor' && slot.doctor_user_id !== userId) {
      await client.query('ROLLBACK');
      return res
        .status(403)
        .json({ error: 'Doctors may only reschedule within their own schedule.' });
    }
    const conflict = await client.query(
      `SELECT 1 FROM appointments WHERE patient_user_id=$1 AND id<>$2 AND status NOT IN ('cancelled','no_show') AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)')`,
      [appointment.patient_user_id, id.data, slot.starts_at, slot.ends_at]
    );
    if (conflict.rowCount) {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({ error: 'The patient already has an appointment at this time.' });
    }
    const updated = await client.query(
      `UPDATE appointments SET doctor_id=$2,availability_slot_id=$3,starts_at=$4,ends_at=$5,status='pending',reschedule_count=reschedule_count+1,updated_by=$6,updated_at=now() WHERE id=$1 RETURNING *`,
      [id.data, slot.doctor_id, slot.id, slot.starts_at, slot.ends_at, userId]
    );
    await client.query(`UPDATE doctor_availability_slots SET status='booked' WHERE id=$1`, [
      slot.id,
    ]);
    if (appointment.availability_slot_id)
      await client.query(`UPDATE doctor_availability_slots SET status='available' WHERE id=$1`, [
        appointment.availability_slot_id,
      ]);
    await client.query(
      'INSERT INTO appointment_reschedule_events (appointment_id,actor_user_id,old_slot_id,new_slot_id) VALUES ($1,$2,$3,$4)',
      [id.data, userId, appointment.availability_slot_id, slot.id]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'appointment.rescheduled','appointment',$2)`,
      [userId, id.data]
    );
    await client.query(
      `INSERT INTO notifications (user_id,title,message,category) SELECT DISTINCT recipient,'Appointment rescheduled',$2,'appointment' FROM unnest($1::uuid[]) recipient`,
      [
        [appointment.patient_user_id, appointment.doctor_user_id, slot.doctor_user_id],
        `Appointment moved to ${new Date(slot.starts_at).toISOString()} with ${slot.doctor_name}; awaiting confirmation.`,
      ]
    );
    await notifyClinicActivity(client, { title: 'Appointment rescheduled', category: 'appointment', message: `An appointment was moved to ${new Date(slot.starts_at).toISOString()} with ${slot.doctor_name}; awaiting confirmation.` });
    await client.query('COMMIT');
    return res.json({ data: { ...updated.rows[0], doctor_name: slot.doctor_name } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return res
      .status(schedulingConflict(error) ? 409 : 503)
      .json({ error: 'Unable to reschedule. The time may conflict with another appointment.' });
  } finally {
    client.release();
  }
});

export default router;
