import { Router } from 'express';
import { z } from 'zod';
import { allowRoles, requireAuth, requireOtp } from './auth.js';
import { pool } from './db.js';

const router = Router();
router.use(requireAuth, requireOtp);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

router.get('/doctors/:id/availability', async (req, res) => {
  const doctorId = z.string().uuid().safeParse(req.params.id);
  const date = dateSchema.safeParse(req.query.date);
  if (!doctorId.success || !date.success) return res.status(400).json({ error: 'Provide a valid doctor id and date (YYYY-MM-DD).' });
  try {
    const result = await pool.query(
      `SELECT s.id, s.doctor_id, s.starts_at, s.ends_at
       FROM doctor_availability_slots s
       JOIN clinic_settings c ON c.id = true
       WHERE s.doctor_id = $1 AND s.status = 'available'
         AND (s.starts_at AT TIME ZONE c.timezone)::date = $2::date
         AND NOT EXISTS (SELECT 1 FROM clinic_holidays h WHERE h.holiday_date = $2::date)
       ORDER BY s.starts_at`,
      [doctorId.data, date.data],
    );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load available appointment times.' });
  }
});

const slotSchema = z.object({
  doctorId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

router.post('/availability-slots', allowRoles('admin', 'receptionist', 'doctor'), async (req, res) => {
  const parsed = slotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid availability slot.', details: parsed.error.flatten() });
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  const duration = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (duration <= 0 || duration > 30) return res.status(422).json({ error: 'Availability slots must be no longer than 30 minutes.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doctor = await client.query<{ user_id: string; active: boolean }>(
      'SELECT user_id, active FROM clinic_doctors WHERE id = $1 FOR UPDATE',
      [parsed.data.doctorId],
    );
    const clinic = await client.query<{ timezone: string; opens_at: string; closes_at: string }>(
      'SELECT timezone, opens_at::text, closes_at::text FROM clinic_settings WHERE id = true',
    );
    if (!doctor.rowCount || !doctor.rows[0].active) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Doctor is not active.' });
    }
    if (req.auth!.role === 'doctor' && doctor.rows[0].user_id !== req.auth!.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Doctors can only set their own availability.' });
    }
    if (!clinic.rowCount) {
      await client.query('ROLLBACK');
      return res.status(503).json({ error: 'Clinic hours are not configured.' });
    }

    const validation = await client.query<{ allowed: boolean }>(
      `SELECT
         $1::timestamptz > now()
         AND ($1::timestamptz AT TIME ZONE $3)::date = ($2::timestamptz AT TIME ZONE $3)::date
         AND ($1::timestamptz AT TIME ZONE $3)::time >= $4::time
         AND ($2::timestamptz AT TIME ZONE $3)::time <= $5::time
         AND NOT EXISTS (
           SELECT 1 FROM clinic_holidays h
           WHERE h.holiday_date = ($1::timestamptz AT TIME ZONE $3)::date
         ) AS allowed`,
      [startsAt, endsAt, clinic.rows[0].timezone, clinic.rows[0].opens_at, clinic.rows[0].closes_at],
    );
    if (!validation.rows[0].allowed) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Slot must be a future time within clinic hours and not on a holiday.' });
    }

    const result = await client.query(
      `INSERT INTO doctor_availability_slots (doctor_id, starts_at, ends_at, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, doctor_id, starts_at, ends_at, status`,
      [parsed.data.doctorId, startsAt, endsAt, req.auth!.userId],
    );
    await client.query('COMMIT');
    return res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23P01') {
      return res.status(409).json({ error: 'That doctor already has overlapping availability.' });
    }
    return res.status(503).json({ error: 'Unable to save doctor availability.' });
  } finally {
    client.release();
  }
});

router.get('/clinic/settings', allowRoles('admin', 'receptionist', 'doctor'), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT timezone, opens_at, closes_at, default_appointment_minutes, minimum_reschedule_notice_hours
       FROM clinic_settings WHERE id = true`,
    );
    if (!result.rowCount) return res.status(503).json({ error: 'Clinic settings are not configured.' });
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to load clinic settings.' });
  }
});

router.put('/clinic/settings', allowRoles('admin'), async (req, res) => {
  const schema = z.object({
    timezone: z.string().trim().min(1).max(100),
    opensAt: z.string().regex(/^\d{2}:\d{2}$/),
    closesAt: z.string().regex(/^\d{2}:\d{2}$/),
    defaultAppointmentMinutes: z.number().int().min(10).max(30),
    minimumRescheduleNoticeHours: z.number().int().min(0).max(168),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid clinic settings.', details: parsed.error.flatten() });
  if (parsed.data.closesAt <= parsed.data.opensAt) return res.status(422).json({ error: 'Closing time must be after opening time.' });
  try {
    const result = await pool.query(
      `UPDATE clinic_settings SET timezone = $1, opens_at = $2::time, closes_at = $3::time,
       default_appointment_minutes = $4, minimum_reschedule_notice_hours = $5, updated_at = now()
       WHERE id = true RETURNING timezone, opens_at, closes_at, default_appointment_minutes, minimum_reschedule_notice_hours`,
      [parsed.data.timezone, parsed.data.opensAt, parsed.data.closesAt, parsed.data.defaultAppointmentMinutes, parsed.data.minimumRescheduleNoticeHours],
    );
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to update clinic settings.' });
  }
});

router.post('/appointments/:id/reschedule', async (req, res) => {
  const appointmentId = z.string().uuid().safeParse(req.params.id);
  const body = z.object({ slotId: z.string().uuid() }).safeParse(req.body);
  if (!appointmentId.success || !body.success) return res.status(400).json({ error: 'Provide a valid appointment and availability slot.' });
  const { userId, role } = req.auth!;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appointmentResult = await client.query<{ patient_user_id: string; doctor_id: string; availability_slot_id: string | null; status: string; reschedule_count: number }>(
      `SELECT patient_user_id, doctor_id, availability_slot_id, status, reschedule_count
       FROM appointments WHERE id = $1 FOR UPDATE`,
      [appointmentId.data],
    );
    const appointment = appointmentResult.rows[0];
    if (!appointment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Appointment not found.' });
    }
    if (!['patient', 'student', 'lecturer', 'staff', 'doctor', 'admin', 'receptionist'].includes(role)
      || (['patient', 'student', 'lecturer', 'staff'].includes(role) && appointment.patient_user_id !== userId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You cannot reschedule this appointment.' });
    }
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only pending or confirmed appointments can be rescheduled.' });
    }

    const policy = await client.query<{ minimum_reschedule_notice_hours: number }>(
      'SELECT minimum_reschedule_notice_hours FROM clinic_settings WHERE id = true',
    );
    const notice = await client.query<{ allowed: boolean }>(
      `SELECT s.starts_at >= now() + ($2::int * interval '1 hour') AS allowed
       FROM doctor_availability_slots s WHERE s.id = $1`,
      [body.data.slotId, policy.rows[0]?.minimum_reschedule_notice_hours ?? 24],
    );
    if (!notice.rows[0]?.allowed) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Reschedules must be made at least 24 hours before the appointment.' });
    }

    const slotResult = await client.query<{ id: string; doctor_id: string; starts_at: Date; ends_at: Date }>(
      `SELECT s.id, s.doctor_id, s.starts_at, s.ends_at
       FROM doctor_availability_slots s JOIN clinic_doctors d ON d.id = s.doctor_id
       JOIN clinic_settings c ON c.id = true
       WHERE s.id = $1 AND s.status = 'available' AND d.active = true
         AND s.starts_at > now()
         AND (s.starts_at AT TIME ZONE c.timezone)::time >= c.opens_at
         AND (s.ends_at AT TIME ZONE c.timezone)::time <= c.closes_at
         AND (s.starts_at AT TIME ZONE c.timezone)::date = (s.ends_at AT TIME ZONE c.timezone)::date
         AND NOT EXISTS (SELECT 1 FROM clinic_holidays h WHERE h.holiday_date = (s.starts_at AT TIME ZONE c.timezone)::date)
       FOR UPDATE OF s`,
      [body.data.slotId],
    );
    const slot = slotResult.rows[0];
    if (!slot) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The selected availability is no longer available.' });
    }

    const previousSlotId = appointment.availability_slot_id;
    await client.query(`UPDATE doctor_availability_slots SET status = 'booked' WHERE id = $1`, [slot.id]);
    if (previousSlotId && previousSlotId !== slot.id) {
      await client.query(`UPDATE doctor_availability_slots SET status = 'available' WHERE id = $1`, [previousSlotId]);
    }
    const updated = await client.query(
      `UPDATE appointments SET doctor_id = $2, availability_slot_id = $3,
       starts_at = $4, ends_at = $5, reschedule_count = reschedule_count + 1,
       updated_by = $6, updated_at = now()
       WHERE id = $1 RETURNING id, patient_user_id, doctor_id, starts_at, ends_at, status, reschedule_count`,
      [appointmentId.data, slot.doctor_id, slot.id, slot.starts_at, slot.ends_at, userId],
    );
    await client.query(
      `INSERT INTO appointment_reschedule_events (appointment_id, actor_user_id, old_slot_id, new_slot_id)
       VALUES ($1, $2, $3, $4)`,
      [appointmentId.data, userId, previousSlotId, slot.id],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'appointment.rescheduled', 'appointment', $2)`,
      [userId, appointmentId.data],
    );
    await client.query('COMMIT');
    return res.json({ data: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23P01') {
      return res.status(409).json({ error: 'The selected time conflicts with another appointment.' });
    }
    return res.status(503).json({ error: 'Unable to reschedule this appointment.' });
  } finally {
    client.release();
  }
});

export default router;