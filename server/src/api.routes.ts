import { Router } from 'express';
import { z } from 'zod';
import { allowRoles, requireAuth, requireOtp } from './auth.js';
import { pool } from './db.js';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { allowedPreviousAppointmentStatuses } from './appointment-policy.js';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const patientRoles = ['patient', 'student', 'lecturer', 'staff'] as const;
const patientOnly = allowRoles(...patientRoles);

router.use(requireAuth, requireOtp);

router.get('/profile', (req, res) => res.json({ data: req.auth!.profile }));

const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(160).nullable().optional(),
  address_line1: z.string().trim().max(200).nullable().optional(),
  address_line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  province: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
}).strict();

router.patch('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) {
    return res.status(400).json({ error: 'Provide valid profile fields to update.', details: parsed.success ? undefined : parsed.error.flatten() });
  }
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(parsed.data)
    .eq('id', req.auth!.userId)
    .select('*')
    .single();
  if (error) return res.status(503).json({ error: 'Unable to update your profile.' });
  return res.json({ data });
});

router.get('/patients', allowRoles('admin', 'receptionist'), async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, phone, user_type, student_number, staff_number, department, program, created_at')
    .eq('role', 'patient')
    .order('created_at', { ascending: false });
  if (error) return res.status(503).json({ error: 'Unable to load patient records.' });
  return res.json({ data });
});

const patientSchema = z.object({
  email: z.string().trim().email().max(254),
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use a phone number in international format, for example +27123456789.'),
  userType: z.enum(['Student', 'Lecturer', 'SPU Staff']),
  studentNumber: z.string().trim().max(40).nullable().optional(),
  staffNumber: z.string().trim().max(40).nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
  program: z.string().trim().max(160).nullable().optional(),
});

router.post('/patients', allowRoles('admin', 'receptionist'), async (req, res) => {
  const parsed = patientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid patient account details.', details: parsed.error.flatten() });
  const { email, fullName, phone, userType, studentNumber, staffNumber, department, program } = parsed.data;
  const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, phone, user_type: userType },
    redirectTo: config.FRONTEND_ORIGIN,
  });
  if (inviteError || !invited.user) {
    return res.status(422).json({ error: inviteError?.message ?? 'Unable to send the account invitation.' });
  }

  try {
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: invited.user.id,
      role: 'patient',
      email,
      full_name: fullName,
      phone,
      user_type: userType,
      student_number: studentNumber ?? null,
      staff_number: staffNumber ?? null,
      department: department ?? null,
      program: program ?? null,
    }, { onConflict: 'id' });
    if (profileError) throw profileError;
    await pool.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'patient.invited', 'profile', $2)`,
      [req.auth!.userId, invited.user.id],
    );
    return res.status(201).json({ data: { id: invited.user.id, email, fullName, invitationSent: true } });
  } catch {
    await supabaseAdmin.auth.admin.deleteUser(invited.user.id);
    return res.status(503).json({ error: 'The patient account could not be fully created.' });
  }
});

router.get('/audit-events', allowRoles('admin'), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, actor_user_id, action, entity_type, entity_id, created_at
       FROM audit_events ORDER BY created_at DESC LIMIT 250`,
    );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load the audit log.' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, message, category, read_at, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [req.auth!.userId],
    );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load notifications.' });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  const notificationId = z.string().uuid().safeParse(req.params.id);
  if (!notificationId.success) return res.status(400).json({ error: 'Invalid notification id.' });
  try {
    const result = await pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING id, read_at`,
      [notificationId.data, req.auth!.userId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Notification not found.' });
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to update this notification.' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.auth!.userId]);
    return res.json({ message: 'Notifications marked as read.' });
  } catch {
    return res.status(503).json({ error: 'Unable to update notifications.' });
  }
});

router.get('/doctors', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, full_name, specialty, department
       FROM clinic_doctors WHERE active = true ORDER BY full_name`,
    );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load the doctor directory.' });
  }
});

const doctorSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(160),
  specialty: z.string().trim().min(2).max(120),
  department: z.string().trim().max(120).nullable().optional(),
});

router.post('/doctors', allowRoles('admin'), async (req, res) => {
  const parsed = doctorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid doctor details.', details: parsed.error.flatten() });
  try {
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', parsed.data.userId).maybeSingle();
    if (profile?.role !== 'doctor') return res.status(422).json({ error: 'The linked account must have the doctor role.' });
    const result = await pool.query(
      `INSERT INTO clinic_doctors (user_id, full_name, specialty, department)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
       SET full_name = EXCLUDED.full_name, specialty = EXCLUDED.specialty,
           department = EXCLUDED.department, active = true, updated_at = now()
       RETURNING id, user_id, full_name, specialty, department`,
      [parsed.data.userId, parsed.data.fullName, parsed.data.specialty, parsed.data.department ?? null],
    );
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to save this doctor.' });
  }
});

const staffSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(['doctor', 'receptionist']),
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  department: z.string().trim().max(120).nullable().optional(),
  specialty: z.string().trim().max(120).nullable().optional(),
});

router.post('/staff', allowRoles('admin'), async (req, res) => {
  const parsed = staffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid staff account details.', details: parsed.error.flatten() });
  if (parsed.data.role === 'doctor' && !parsed.data.specialty) {
    return res.status(422).json({ error: 'A specialty is required for doctor accounts.' });
  }

  const { email, role, fullName, phone, department, specialty } = parsed.data;
  const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, phone },
    redirectTo: config.FRONTEND_ORIGIN,
  });
  if (inviteError || !invited.user) {
    return res.status(422).json({ error: inviteError?.message ?? 'Unable to send the staff invitation.' });
  }

  try {
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: invited.user.id,
      role,
      email,
      full_name: fullName,
      phone,
      department: department ?? null,
      program: role === 'doctor' ? specialty : null,
      user_type: null,
    }, { onConflict: 'id' });
    if (profileError) throw profileError;

    if (role === 'doctor') {
      await pool.query(
        `INSERT INTO clinic_doctors (user_id, full_name, specialty, department, active)
         VALUES ($1, $2, $3, $4, false)`,
        [invited.user.id, fullName, specialty, department ?? null],
      );
    }

    await pool.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, $2, 'profile', $3)`,
      [req.auth!.userId, `${role}.invited`, invited.user.id],
    );
    return res.status(201).json({ data: { id: invited.user.id, email, role, fullName, invitationSent: true } });
  } catch {
    await pool.query('DELETE FROM clinic_doctors WHERE user_id = $1', [invited.user.id]).catch(() => undefined);
    await supabaseAdmin.auth.admin.deleteUser(invited.user.id);
    return res.status(503).json({ error: 'The account could not be fully provisioned. No partial account was kept.' });
  }
});

router.get('/appointments', async (req, res) => {
  const { userId, role } = req.auth!;
  try {
    const result = role === 'admin' || role === 'receptionist'
      ? await pool.query(
        `SELECT a.id, a.patient_user_id, a.doctor_id, a.starts_at, a.ends_at,
                a.consultation_type, a.mode, a.status, a.created_at, a.updated_at,
                d.full_name AS doctor_name, d.specialty
         FROM appointments a JOIN clinic_doctors d ON d.id = a.doctor_id
         ORDER BY a.starts_at DESC LIMIT 500`,
      )
      : role === 'doctor'
        ? await pool.query(
          `SELECT a.id, a.patient_user_id, a.doctor_id, a.starts_at, a.ends_at,
                  a.consultation_type, a.mode, a.status, a.created_at, a.updated_at,
                  d.full_name AS doctor_name, d.specialty
           FROM appointments a JOIN clinic_doctors d ON d.id = a.doctor_id
           WHERE d.user_id = $1 ORDER BY a.starts_at DESC LIMIT 500`,
          [userId],
        )
        : await pool.query(
          `SELECT a.id, a.patient_user_id, a.doctor_id, a.starts_at, a.ends_at,
                  a.consultation_type, a.mode, a.status, a.created_at, a.updated_at,
                  d.full_name AS doctor_name, d.specialty
           FROM appointments a JOIN clinic_doctors d ON d.id = a.doctor_id
           WHERE a.patient_user_id = $1 ORDER BY a.starts_at DESC LIMIT 500`,
          [userId],
        );
    const patientIds = [...new Set(result.rows.map((appointment) => appointment.patient_user_id as string))];
    const { data: profiles, error: profileError } = patientIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', patientIds)
      : { data: [], error: null };
    if (profileError) return res.status(503).json({ error: 'Unable to load appointment patient details.' });
    const patientNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
    return res.json({ data: result.rows.map((appointment) => ({
      ...appointment,
      patient_name: patientNames.get(appointment.patient_user_id) ?? 'Patient',
    })) });
  } catch {
    return res.status(503).json({ error: 'Unable to load appointments.' });
  }
});

const appointmentSchema = z.object({
  slotId: z.string().uuid(),
  consultationType: z.string().trim().min(2).max(120),
  mode: z.enum(['in_person', 'telehealth']),
  reason: z.string().trim().max(2000).nullable().optional(),
});

router.post('/appointments', patientOnly, async (req, res) => {
  const parsed = appointmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid appointment details.', details: parsed.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
      [parsed.data.slotId],
    );
    const slot = slotResult.rows[0];
    if (!slot) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The selected appointment time is no longer available.' });
    }
    const result = await client.query(
      `INSERT INTO appointments
       (patient_user_id, doctor_id, availability_slot_id, starts_at, ends_at, consultation_type, mode, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.auth!.userId, slot.doctor_id, slot.id, slot.starts_at, slot.ends_at, parsed.data.consultationType, parsed.data.mode, parsed.data.reason ?? null],
    );
    const appointment = result.rows[0];
    const doctor = await client.query<{ user_id: string; full_name: string; specialty: string }>(
      'SELECT user_id, full_name, specialty FROM clinic_doctors WHERE id = $1',
      [appointment.doctor_id],
    );
    await client.query(
      `INSERT INTO notifications (user_id, title, message, category)
       VALUES ($1, $2, $3, 'appointment'), ($4, $2, $5, 'appointment')`,
      [req.auth!.userId, 'Appointment request received', `${doctor.rows[0].full_name} · ${appointment.starts_at.toISOString()}`, doctor.rows[0].user_id, 'A new appointment request is awaiting review.'],
    );
    await client.query(`UPDATE doctor_availability_slots SET status = 'booked' WHERE id = $1`, [slot.id]);
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'appointment.created', 'appointment', $2)`,
      [req.auth!.userId, appointment.id],
    );
    await client.query('COMMIT');
    return res.status(201).json({ data: { ...appointment, doctor_name: doctor.rows[0].full_name, specialty: doctor.rows[0].specialty } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23P01') {
      return res.status(409).json({ error: 'That appointment time is no longer available.' });
    }
    return res.status(503).json({ error: 'Unable to book this appointment.' });
  } finally {
    client.release();
  }
});

const statusSchema = z.object({ status: z.enum(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']) });

router.patch('/appointments/:id/status', async (req, res) => {
  const appointmentId = z.string().uuid().safeParse(req.params.id);
  const parsed = statusSchema.safeParse(req.body);
  if (!appointmentId.success || !parsed.success) return res.status(400).json({ error: 'Invalid appointment update.' });

  const { userId, role } = req.auth!;
  const nextStatus = parsed.data.status;
  const patient = patientRoles.includes(role as typeof patientRoles[number]);
  const allowedPrevious = allowedPreviousAppointmentStatuses(role, nextStatus);
  if (!allowedPrevious.length) return res.status(403).json({ error: 'This role cannot perform that appointment status change.' });

  try {
    const scope = patient
      ? 'a.patient_user_id = $2'
      : role === 'doctor'
        ? 'd.user_id = $2'
        : 'true';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
      `UPDATE appointments a SET status = $3, updated_at = now()
       FROM clinic_doctors d
       WHERE a.doctor_id = d.id AND a.id = $1 AND ${scope} AND a.status = ANY($4::text[])
       RETURNING a.*`,
        [appointmentId.data, userId, nextStatus, allowedPrevious],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Appointment not found for this account or status change not allowed.' });
      }
      const appointment = result.rows[0];
      const doctor = await client.query<{ user_id: string; full_name: string }>(
      'SELECT user_id, full_name FROM clinic_doctors WHERE id = $1',
      [appointment.doctor_id],
      );
      const recipient = patient ? doctor.rows[0]?.user_id : appointment.patient_user_id;
      if (recipient) {
        await client.query(
        `INSERT INTO notifications (user_id, title, message, category)
         VALUES ($1, 'Appointment updated', $2, 'appointment')`,
        [recipient, `Appointment with ${doctor.rows[0]?.full_name ?? 'the clinic'} is now ${nextStatus.replaceAll('_', ' ')}.`],
        );
      }
      await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, $2, 'appointment', $3)`,
      [userId, `appointment.${nextStatus}`, appointment.id],
      );
      if (nextStatus === 'cancelled' && appointment.availability_slot_id) {
        await client.query(`UPDATE doctor_availability_slots SET status = 'available' WHERE id = $1`, [appointment.availability_slot_id]);
      }
      await client.query('COMMIT');
      return res.json({ data: appointment });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return res.status(503).json({ error: 'Unable to update this appointment.' });
  }
});

export default router;