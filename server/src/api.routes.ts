import { Router } from 'express';
import { z } from 'zod';
import { allowRoles, requireAuth, requireOtp } from './auth.js';
import { pool } from './db.js';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { allowedPreviousAppointmentStatuses } from './appointment-policy.js';
import { bookableSlotConditions, schedulingConflict } from './workflow-policy.js';
import { refinePatientIdentity, accountEmailSchema } from './university-policy.js';
import { phoneSchema } from './phone.js';
import { authCallbackUrl } from './auth-callback.js';
import { deletePatientLoginAccount, PatientDeletionError } from './account-deletion.js';
import { notifyClinicActivity } from './clinic-notifications.js';
import { RECEPTION_DEPARTMENT, receptionDepartmentAllowed } from './staff-policy.js';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const patientRoles = ['patient', 'student', 'lecturer', 'staff'] as const;

router.use(requireAuth, requireOtp);

async function withAccountStatus<T extends { id: string }>(profiles: T[]) {
  if (!profiles.length) return [];
  const statuses = await pool.query<{ user_id: string; active: boolean; deletion_requested_at: Date | null; deleted_at: Date | null }>(
    'SELECT user_id,active,deletion_requested_at,deleted_at FROM account_status WHERE user_id = ANY($1::uuid[])',
    [profiles.map((p) => p.id)]
  );
  const byUser = new Map(statuses.rows.map((row) => [row.user_id, row]));
  return profiles.map((profile) => ({
    ...profile,
    active: byUser.get(profile.id)?.active ?? true,
    deletion_requested_at: byUser.get(profile.id)?.deletion_requested_at ?? null,
    deleted_at: byUser.get(profile.id)?.deleted_at ?? null,
  })).filter((profile) => !profile.deleted_at);
}

router.get('/profile', (req, res) => res.json({ data: req.auth!.profile }));

const profileSchema = z
  .object({
    full_name: z.string().trim().min(2).max(160).nullable().optional(),
    address_line1: z.string().trim().max(200).nullable().optional(),
    address_line2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    province: z.string().trim().max(120).nullable().optional(),
    postal_code: z.string().trim().max(20).nullable().optional(),
  })
  .strict();

router.patch('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) {
    return res.status(400).json({
      error: 'Provide valid profile fields to update.',
      details: parsed.success ? undefined : parsed.error.flatten(),
    });
  }
  const update = {
    ...parsed.data,
    ...('address_line1' in parsed.data || 'address_line2' in parsed.data ? {
      address_latitude: null, address_longitude: null,
      address_source: (parsed.data.address_line1 === undefined ? req.auth!.profile.address_line1 : parsed.data.address_line1) ? 'manual' : null,
    } : {}),
  };
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .eq('id', req.auth!.userId)
    .select('*')
    .single();
  if (error) return res.status(503).json({ error: 'Unable to update your profile.' });
  return res.json({ data });
});

router.get('/patients', allowRoles('admin', 'receptionist'), async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, email, full_name, phone, user_type, student_number, staff_number, department, program, created_at'
    )
    .in('role', [...patientRoles])
    .order('created_at', { ascending: false });
  if (error) return res.status(503).json({ error: 'Unable to load patient records.' });
  try {
    return res.json({ data: await withAccountStatus(data ?? []) });
  } catch {
    return res.status(503).json({ error: 'Unable to load patient account status.' });
  }
});

export const patientSchema = z.object({
  email: accountEmailSchema,
  fullName: z.string().trim().min(2).max(160),
  phone: phoneSchema,
  userType: z.enum(['Student', 'Lecturer', 'SPU Staff']),
  studentNumber: z.string().trim().max(40).nullable().optional(),
  staffNumber: z.string().trim().max(40).nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
  program: z.string().trim().max(160).nullable().optional(),
}).strict().superRefine(refinePatientIdentity);

router.post('/patients', allowRoles('admin', 'receptionist'), async (req, res) => {
  const parsed = patientSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid patient account details.', details: parsed.error.flatten() });
  const { email, fullName, phone, userType, studentNumber, staffNumber, department, program } =
    parsed.data;
  let createdId: string | undefined;
  try {
    // Inviting alone can reuse an unconfirmed account. Only an atomic CREATE
    // establishes that this request owns the identity it may provision/delete.
    const created = await supabaseAdmin.auth.admin.createUser({
      email, email_confirm: false,
      app_metadata: { clinic_role: 'patient', clinic_phone: phone },
      user_metadata: { full_name: fullName, phone, user_type: userType },
    });
    if (created.error) {
      if (['email_exists', 'user_already_exists'].includes(created.error.code ?? '')) {
        return res.status(409).json({ error: 'This email already has an account. Manage that account in its directory.', code: 'ACCOUNT_EMAIL_IN_USE' });
      }
      return res.status(503).json({ error: 'Unable to create the patient account. Check the account service and try again.' });
    }
    const newId = z.string().uuid().safeParse(created.data.user?.id);
    if (!newId.success || newId.data === req.auth!.userId) throw new Error('Unexpected created patient identity');
    createdId = newId.data;
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: createdId,
        role: 'patient',
        email,
        full_name: fullName,
        phone,
        user_type: userType,
        student_number: studentNumber ?? null,
        staff_number: staffNumber ?? null,
        department: department ?? null,
        program: program ?? null,
      },
      { onConflict: 'id' }
    );
    if (profileError) throw profileError;
    const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, phone, user_type: userType },
      redirectTo: authCallbackUrl('invite'),
    });
    if (invited.error || invited.data.user?.id !== createdId) throw new Error('Patient invitation identity was not acknowledged');
    await pool.query('INSERT INTO account_invitations(user_id,invited_by,role) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING', [createdId,req.auth!.userId,'patient']);
    await pool.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'patient.invited', 'profile', $2)`,
      [req.auth!.userId, createdId]
    );
    if (res.headersSent || res.writableEnded || res.destroyed) return res;
    return res
      .status(201)
      .json({ data: { id: createdId, email, fullName, invitationSent: true } });
  } catch {
    if (createdId) await supabaseAdmin.auth.admin.deleteUser(createdId).catch(() => undefined);
    return res.status(503).json({ error: 'The patient account could not be fully created.' });
  }
});

router.get('/audit-events', allowRoles('admin'), async (req, res) => {
  const query = z.object({ before: z.string().datetime({ offset:true }).optional(), beforeId:z.string().uuid().optional(), limit:z.coerce.number().int().min(1).max(250).default(100), kind:z.enum(['operations','access','all']).default('operations') }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Invalid audit log filters.' });
  try {
    const result = await pool.query(
      `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM (
         SELECT id, actor_user_id, action, entity_type, entity_id, created_at FROM audit_events
         UNION ALL
         SELECT id, actor_user_id, method || ' ' || path || ' (' || status_code || ')' AS action,
                'api_access' AS entity_type, NULL::uuid AS entity_id, created_at FROM request_audit_logs
         UNION ALL
         SELECT id, CASE WHEN payload->>'actor_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   THEN (payload->>'actor_id')::uuid ELSE NULL::uuid END AS actor_user_id,
                'auth.' || COALESCE(payload->>'action','event') AS action,
                'auth_session' AS entity_type, NULL::uuid AS entity_id, created_at
         FROM auth.audit_log_entries WHERE created_at IS NOT NULL
       ) events WHERE ($1::timestamptz IS NULL OR created_at<$1 OR (created_at=$1 AND id<$4::uuid))
         AND ($2='all' OR ($2='operations' AND entity_type<>'api_access') OR ($2='access' AND entity_type='api_access'))
       ORDER BY created_at DESC,id DESC LIMIT $3`,
      [query.data.before ?? null, query.data.kind, query.data.limit, query.data.beforeId ?? null],
    );
    const last = result.rows.at(-1);
    const more = result.rows.length === query.data.limit;
    return res.json({ data: result.rows, before: more ? last.cursor_time : null, beforeId: more ? last.id : null });
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
      [req.auth!.userId]
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
      [notificationId.data, req.auth!.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Notification not found.' });
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to update this notification.' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
      [req.auth!.userId]
    );
    return res.json({ message: 'Notifications marked as read.' });
  } catch {
    return res.status(503).json({ error: 'Unable to update notifications.' });
  }
});

router.delete('/notifications/:id', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid notification id.' });
  try {
    const result = await pool.query(
      'DELETE FROM notifications WHERE id=$1 AND user_id=$2 RETURNING id',
      [id.data, req.auth!.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Notification not found.' });
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to delete this notification.' });
  }
});

router.get('/doctors', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, full_name, specialty, department
       FROM clinic_doctors WHERE active = true ORDER BY full_name`
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
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid doctor details.', details: parsed.error.flatten() });
  try {
    const { data: account, error: accountError } = await supabaseAdmin.auth.admin.getUserById(
      parsed.data.userId
    );
    if (accountError)
      return res.status(503).json({ error: 'Unable to verify this doctor account.' });
    if (account.user?.app_metadata.clinic_role !== 'doctor')
      return res.status(422).json({ error: 'The linked account must have the doctor role.' });
    const status = await pool.query('SELECT active FROM account_status WHERE user_id=$1', [
      parsed.data.userId,
    ]);
    if (status.rows[0]?.active === false)
      return res
        .status(409)
        .json({ error: 'Reactivate the staff account before publishing this doctor.' });
    const result = await pool.query(
      `INSERT INTO clinic_doctors (user_id, full_name, specialty, department)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
       SET full_name = EXCLUDED.full_name, specialty = EXCLUDED.specialty,
           department = EXCLUDED.department, active = true, updated_at = now()
       RETURNING id, user_id, full_name, specialty, department`,
      [
        parsed.data.userId,
        parsed.data.fullName,
        parsed.data.specialty,
        parsed.data.department ?? null,
      ]
    );
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to save this doctor.' });
  }
});

export const staffSchema = z.object({
  email: accountEmailSchema,
  role: z.enum(['doctor', 'receptionist']),
  fullName: z.string().trim().min(2).max(160),
  phone: phoneSchema,
  department: z.string().trim().max(120).nullable().optional(),
  specialty: z.string().trim().max(120).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.role === 'receptionist' && !receptionDepartmentAllowed(value.department)) context.addIssue({ code: 'custom', path: ['department'], message: 'Receptionist department must be Reception / Front desk.' });
  if (value.role === 'receptionist' && value.specialty) context.addIssue({ code: 'custom', path: ['specialty'], message: 'Specialty applies only to doctors.' });
}).transform(value => ({ ...value, department: value.role === 'receptionist' ? RECEPTION_DEPARTMENT : value.department }));

router.post('/staff', allowRoles('admin'), async (req, res) => {
  const parsed = staffSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid staff account details.', details: parsed.error.flatten() });
  if (parsed.data.role === 'doctor' && !parsed.data.specialty) {
    return res.status(422).json({ error: 'A specialty is required for doctor accounts.' });
  }

  const { email, role, fullName, phone, department, specialty } = parsed.data;
  let createdId: string | undefined;
  try {
    const created = await supabaseAdmin.auth.admin.createUser({
      email, email_confirm: false,
      app_metadata: { clinic_role: role, clinic_phone: phone },
      user_metadata: { full_name: fullName, phone },
    });
    if (created.error) {
      if (['email_exists', 'user_already_exists'].includes(created.error.code ?? '')) {
        return res.status(409).json({ error: 'This email already has an account. Manage that account in its directory.', code: 'ACCOUNT_EMAIL_IN_USE' });
      }
      return res.status(503).json({ error: 'Unable to create the staff account. Check the account service and try again.' });
    }
    const newId = z.string().uuid().safeParse(created.data.user?.id);
    if (!newId.success || newId.data === req.auth!.userId) throw new Error('Unexpected created staff identity');
    createdId = newId.data;
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: createdId,
        role,
        email,
        full_name: fullName,
        phone,
        department: department ?? null,
        program: role === 'doctor' ? specialty : null,
        user_type: null,
      },
      { onConflict: 'id' }
    );
    if (profileError) throw profileError;

    if (role === 'doctor') {
      await pool.query(
        `INSERT INTO clinic_doctors (user_id, full_name, specialty, department, active)
         VALUES ($1, $2, $3, $4, false)`,
        [createdId, fullName, specialty, department ?? null]
      );
    }

    const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, phone },
      redirectTo: authCallbackUrl('invite'),
    });
    if (invited.error || invited.data.user?.id !== createdId) throw new Error('Staff invitation identity was not acknowledged');
    await pool.query('INSERT INTO account_invitations(user_id,invited_by,role) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING', [createdId,req.auth!.userId,role]);
    await pool.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, $2, 'profile', $3)`,
      [req.auth!.userId, `${role}.invited`, createdId]
    );
    if (role === 'doctor') {
      const published = await pool.query('UPDATE clinic_doctors SET active=true,updated_at=now() WHERE user_id=$1', [createdId]);
      if (published.rowCount !== 1) throw new Error('Doctor publication did not complete');
    }
    if (res.headersSent || res.writableEnded || res.destroyed) return res;
    return res
      .status(201)
      .json({ data: { id: createdId, email, role, fullName, invitationSent: true } });
  } catch {
    if (createdId) {
      await pool.query('DELETE FROM clinic_doctors WHERE user_id = $1', [createdId]).catch(() => undefined);
      await supabaseAdmin.auth.admin.deleteUser(createdId).catch(() => undefined);
    }
    return res
      .status(503)
      .json({ error: 'The account could not be fully provisioned. Retry or contact the administrator.' });
  }
});

router.get('/appointments', async (req, res) => {
  const { userId, role } = req.auth!;
  try {
    const result =
      role === 'admin' || role === 'receptionist'
        ? await pool.query(
            `SELECT a.id, a.patient_user_id, a.doctor_id, a.starts_at, a.ends_at,
                a.consultation_type, a.mode, a.status, a.created_at, a.updated_at,
                a.reason, a.availability_slot_id, a.reschedule_count,
                d.full_name AS doctor_name, d.specialty
         FROM appointments a JOIN clinic_doctors d ON d.id = a.doctor_id
         ORDER BY a.starts_at DESC LIMIT 500`
          )
        : role === 'doctor'
          ? await pool.query(
              `SELECT a.id, a.patient_user_id, a.doctor_id, a.starts_at, a.ends_at,
                  a.consultation_type, a.mode, a.status, a.created_at, a.updated_at,
                  a.reason, a.availability_slot_id, a.reschedule_count,
                  d.full_name AS doctor_name, d.specialty
           FROM appointments a JOIN clinic_doctors d ON d.id = a.doctor_id
           WHERE d.user_id = $1 ORDER BY a.starts_at DESC LIMIT 500`,
              [userId]
            )
          : await pool.query(
              `SELECT a.id, a.patient_user_id, a.doctor_id, a.starts_at, a.ends_at,
                  a.consultation_type, a.mode, a.status, a.created_at, a.updated_at,
                  a.reason, a.availability_slot_id, a.reschedule_count,
                  d.full_name AS doctor_name, d.specialty
           FROM appointments a JOIN clinic_doctors d ON d.id = a.doctor_id
           WHERE a.patient_user_id = $1 ORDER BY a.starts_at DESC LIMIT 500`,
              [userId]
            );
    const patientIds = [
      ...new Set(result.rows.map((appointment) => appointment.patient_user_id as string)),
    ];
    const { data: profiles, error: profileError } = patientIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', patientIds)
      : { data: [], error: null };
    if (profileError)
      return res.status(503).json({ error: 'Unable to load appointment patient details.' });
    const patientNames = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.full_name])
    );
    return res.json({
      data: result.rows.map((appointment) => ({
        ...appointment,
        patient_name: patientNames.get(appointment.patient_user_id) ?? 'Patient',
      })),
    });
  } catch {
    return res.status(503).json({ error: 'Unable to load appointments.' });
  }
});

const appointmentSchema = z.object({
  patientUserId: z.string().uuid().optional(),
  slotId: z.string().uuid(),
  consultationType: z.string().trim().min(2).max(120),
  mode: z.enum(['in_person', 'telehealth']),
  reason: z.string().trim().max(2000).nullable().optional(),
});

router.post(
  '/appointments',
  allowRoles(...patientRoles, 'admin', 'receptionist'),
  async (req, res) => {
    const parsed = appointmentSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: 'Invalid appointment details.', details: parsed.error.flatten() });
    const staffBooking = ['admin', 'receptionist'].includes(req.auth!.role);
    if (staffBooking && !parsed.data.patientUserId)
      return res.status(400).json({ error: 'Select a registered patient for this booking.' });
    if (
      !staffBooking &&
      parsed.data.patientUserId &&
      parsed.data.patientUserId !== req.auth!.userId
    )
      return res.status(403).json({ error: 'You can only book for your own patient account.' });
    const patientUserId = staffBooking ? parsed.data.patientUserId! : req.auth!.userId;
    const { data: patientProfile, error: patientError } = await supabaseAdmin
      .from('profiles')
      .select('id,role')
      .eq('id', patientUserId)
      .maybeSingle();
    if (patientError)
      return res.status(503).json({ error: 'Unable to verify the patient account.' });
    if (!patientProfile || !patientRoles.includes(patientProfile.role))
      return res.status(422).json({ error: 'Select an existing patient account.' });
    if (staffBooking) {
      const { data: account, error: accountError } =
        await supabaseAdmin.auth.admin.getUserById(patientUserId);
      if (accountError)
        return res.status(503).json({ error: 'Unable to verify this patient account.' });
      if (!account.user || !patientRoles.includes(account.user.app_metadata.clinic_role))
        return res.status(422).json({ error: 'Select an existing patient account.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO account_status (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [patientUserId]
      );
      const account = await client.query(
        'SELECT active FROM account_status WHERE user_id=$1 FOR UPDATE',
        [patientUserId]
      );
      if (account.rows[0]?.active === false) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'This patient account is inactive.' });
      }
      const slotResult = await client.query<{
        id: string;
        doctor_id: string;
        starts_at: Date;
        ends_at: Date;
      }>(
        `SELECT s.id, s.doctor_id, s.starts_at, s.ends_at
       FROM doctor_availability_slots s JOIN clinic_doctors d ON d.id = s.doctor_id
       JOIN clinic_settings c ON c.id = true
       WHERE s.id = $1 AND ${bookableSlotConditions}
       FOR UPDATE OF s, d FOR SHARE OF c`,
        [parsed.data.slotId]
      );
      const slot = slotResult.rows[0];
      if (!slot) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json({ error: 'The selected appointment time is no longer available.' });
      }
      const conflicts = await client.query(
        `SELECT 1 FROM appointments WHERE patient_user_id=$1 AND status NOT IN ('cancelled','no_show') AND tstzrange(starts_at,ends_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')`,
        [patientUserId, slot.starts_at, slot.ends_at]
      );
      if (conflicts.rowCount) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json({ error: 'The patient already has an appointment at this time.' });
      }
      const result = await client.query(
        `INSERT INTO appointments
       (patient_user_id, doctor_id, availability_slot_id, starts_at, ends_at, consultation_type, mode, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
        [
          patientUserId,
          slot.doctor_id,
          slot.id,
          slot.starts_at,
          slot.ends_at,
          parsed.data.consultationType,
          parsed.data.mode,
          parsed.data.reason ?? null,
        ]
      );
      const appointment = result.rows[0];
      const doctor = await client.query<{ user_id: string; full_name: string; specialty: string }>(
        'SELECT user_id, full_name, specialty FROM clinic_doctors WHERE id = $1',
        [appointment.doctor_id]
      );
      await client.query(
        `INSERT INTO notifications (user_id, title, message, category)
       VALUES ($1, $2, $3, 'appointment'), ($4, $2, $5, 'appointment')`,
        [
          patientUserId,
          'Appointment request received',
          `${doctor.rows[0].full_name} · ${appointment.starts_at.toISOString()}`,
          doctor.rows[0].user_id,
          'A new appointment request is awaiting review.',
        ]
      );
      await client.query(`UPDATE doctor_availability_slots SET status = 'booked' WHERE id = $1`, [
        slot.id,
      ]);
      await client.query(
        `INSERT INTO notifications(user_id,title,message,category)
         SELECT p.id,'New appointment request','A registered patient requested a clinic appointment.','appointment'
         FROM profiles p LEFT JOIN account_status s ON s.user_id=p.id
         WHERE p.role IN ('admin','receptionist') AND COALESCE(s.active,true) AND p.id<>$1`,
        [req.auth!.userId],
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'appointment.created', 'appointment', $2)`,
        [req.auth!.userId, appointment.id]
      );
      await client.query('COMMIT');
      return res.status(201).json({
        data: {
          ...appointment,
          doctor_name: doctor.rows[0].full_name,
          specialty: doctor.rows[0].specialty,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (schedulingConflict(error)) {
        return res.status(409).json({ error: 'That appointment time is no longer available.' });
      }
      return res.status(503).json({ error: 'Unable to book this appointment.' });
    } finally {
      client.release();
    }
  }
);

const statusSchema = z.object({
  status: z.enum(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
});

router.patch('/appointments/:id/status', async (req, res) => {
  const appointmentId = z.string().uuid().safeParse(req.params.id);
  const parsed = statusSchema.safeParse(req.body);
  if (!appointmentId.success || !parsed.success)
    return res.status(400).json({ error: 'Invalid appointment update.' });

  const { userId, role } = req.auth!;
  const nextStatus = parsed.data.status;
  const patient = patientRoles.includes(role as (typeof patientRoles)[number]);
  const allowedPrevious = allowedPreviousAppointmentStatuses(role, nextStatus);
  if (!allowedPrevious.length)
    return res
      .status(403)
      .json({ error: 'This role cannot perform that appointment status change.' });

  try {
    const scope = patient
      ? 'a.patient_user_id = $2'
      : role === 'doctor'
        ? 'd.user_id = $2'
        : '$2::uuid IS NOT NULL';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE appointments a SET status = $3, updated_at = now(), updated_by = $2
       FROM clinic_doctors d
       WHERE a.doctor_id = d.id AND a.id = $1 AND ${scope} AND a.status = ANY($4::text[])
         AND ($3 <> 'confirmed' OR a.ends_at > now())
         AND ($3 <> 'in_progress' OR (a.starts_at <= now() + interval '15 minutes' AND a.ends_at > now()))
         AND ($3 <> 'no_show' OR a.starts_at <= now())
         AND ($3 <> 'completed' OR EXISTS (SELECT 1 FROM patient_visits v WHERE v.appointment_id=a.id))
       RETURNING a.*`,
        [appointmentId.data, userId, nextStatus, allowedPrevious]
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res
          .status(404)
          .json({ error: 'Appointment not found for this account or status change not allowed.' });
      }
      const appointment = result.rows[0];
      const doctor = await client.query<{ user_id: string; full_name: string }>(
        'SELECT user_id, full_name FROM clinic_doctors WHERE id = $1',
        [appointment.doctor_id]
      );
      const recipients = [...new Set([appointment.patient_user_id, doctor.rows[0]?.user_id])].filter(id => id && id !== userId);
      if (recipients.length) {
        await client.query(
          `INSERT INTO notifications (user_id, title, message, category)
         SELECT recipient, 'Appointment updated', $2, 'appointment' FROM unnest($1::uuid[]) recipient`,
          [
            recipients,
            `Appointment with ${doctor.rows[0]?.full_name ?? 'the clinic'} is now ${nextStatus.replaceAll('_', ' ')}.`,
          ]
        );
      }
      await notifyClinicActivity(client, { title: 'Appointment updated', category: 'appointment', message: `Appointment with ${doctor.rows[0]?.full_name ?? 'the clinic'} is now ${nextStatus.replaceAll('_', ' ')}.` });
      await client.query(
        `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, $2, 'appointment', $3)`,
        [userId, `appointment.${nextStatus}`, appointment.id]
      );
      if (nextStatus === 'cancelled' && appointment.availability_slot_id) {
        await client.query(
          `UPDATE doctor_availability_slots SET status = 'available' WHERE id = $1`,
          [appointment.availability_slot_id]
        );
      }
      if (['completed', 'cancelled', 'no_show'].includes(nextStatus)) {
        await client.query(
          `UPDATE walk_ins SET status=$2,completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END WHERE appointment_id=$1`,
          [appointment.id, nextStatus === 'completed' ? 'completed' : 'cancelled']
        );
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

router.get('/staff', allowRoles('admin'), async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id,email,full_name,phone,role,department,program,created_at')
      .in('role', ['doctor', 'receptionist'])
      .order('created_at', { ascending: false });
    if (error) throw error;
    const doctors = await pool.query('SELECT id,user_id,specialty,active FROM clinic_doctors');
    const byUser = new Map(doctors.rows.map((row) => [row.user_id, row]));
    return res.json({
      data: (await withAccountStatus(data ?? [])).map((row) => ({
        ...row,
        doctor_id: byUser.get(row.id)?.id ?? null,
        specialty: byUser.get(row.id)?.specialty ?? null,
        doctor_active: byUser.get(row.id)?.active ?? null,
      })),
    });
  } catch {
    return res.status(503).json({ error: 'Unable to load staff accounts.' });
  }
});

const updateAccountSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160).optional(),
    phone: phoneSchema.optional(),
    department: z.string().trim().max(120).nullable().optional(),
    program: z.string().trim().max(160).nullable().optional(),
    specialty: z.string().trim().min(2).max(120).optional(),
    userType: z.enum(['Student', 'Lecturer', 'SPU Staff']).optional(),
    studentNumber: z.string().trim().max(40).nullable().optional(),
    staffNumber: z.string().trim().max(40).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

async function updateAccount(
  req: import('express').Request,
  res: import('express').Response,
  family: 'staff' | 'patient',
  archive: boolean
) {
  const id = z.string().uuid().safeParse(req.params.id);
  const body = updateAccountSchema.safeParse(archive ? { active: false } : req.body);
  if (!id.success || !body.success || !Object.keys(body.data).length)
    return res.status(400).json({ error: 'Provide valid account details.' });
  if ((archive || body.data.active !== undefined) && req.auth!.role !== 'admin')
    return res
      .status(403)
      .json({ error: 'Only administrators can deactivate or reactivate accounts.' });
  if (id.data === req.auth!.userId)
    return res.status(422).json({ error: 'You cannot deactivate your own account.' });
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', id.data)
    .maybeSingle();
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(id.data);
  if (error || authError) return res.status(503).json({ error: 'Unable to verify this account.' });
  const targetRole = authUser.user?.app_metadata.clinic_role ?? profile?.role;
  if (targetRole === 'receptionist') {
    if (!receptionDepartmentAllowed(body.data.department) || body.data.specialty !== undefined) return res.status(400).json({ error: 'Receptionist department must be Reception / Front desk; specialty applies only to doctors.' });
    if ('department' in body.data) body.data.department = RECEPTION_DEPARTMENT;
  }
  if (
    !profile ||
    !(family === 'staff' ? ['doctor', 'receptionist'] : patientRoles).includes(targetRole)
  )
    return res.status(404).json({ error: 'Account not found in this directory.' });
  if (
    family === 'staff' &&
    ['userType', 'studentNumber', 'staffNumber'].some((key) => key in body.data)
  )
    return res
      .status(400)
      .json({ error: 'University patient identity fields do not apply to staff accounts.' });
  if (family === 'patient' && body.data.specialty !== undefined)
    return res.status(400).json({ error: 'Specialty applies only to doctors.' });
  if (family === 'patient' && ['userType','studentNumber','staffNumber'].some(key => key in body.data)) {
    const identity = patientSchema.safeParse({
      email: profile.email, fullName: profile.full_name, phone: profile.phone,
      userType: body.data.userType ?? profile.user_type,
      studentNumber: 'studentNumber' in body.data ? body.data.studentNumber : profile.student_number,
      staffNumber: 'staffNumber' in body.data ? body.data.staffNumber : profile.staff_number,
    });
    if (!identity.success) return res.status(400).json({ error: 'University identity details must remain valid.', details: identity.error.flatten() });
  }
  const updates: Record<string, unknown> = {};
  let authUpdateAttempted = false;
  let profileUpdateAttempted = false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doctor = await client.query('SELECT id FROM clinic_doctors WHERE user_id=$1 FOR UPDATE', [
      id.data,
    ]);
    await client.query(
      'INSERT INTO account_status (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [id.data]
    );
    const account = await client.query('SELECT active,deletion_requested_at,deleted_at FROM account_status WHERE user_id=$1 FOR UPDATE', [id.data]);
    if (account.rows[0]?.deletion_requested_at || account.rows[0]?.deleted_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This account is being deleted or has been deleted and cannot be changed or reactivated.' });
    }
    if (body.data.active === false) {
      const conflict = await client.query(
        `SELECT 1 FROM appointments a LEFT JOIN clinic_doctors d ON d.id=a.doctor_id WHERE (a.patient_user_id=$1 OR d.user_id=$1) AND (a.status='in_progress' OR (a.status IN ('pending','confirmed') AND a.ends_at>now())) LIMIT 1`,
        [id.data]
      );
      if (conflict.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Cancel or reschedule active appointments before deactivating this account.',
        });
      }
      const walkIns = await client.query(
        `SELECT 1 FROM walk_ins w LEFT JOIN clinic_doctors d ON d.id=w.assigned_doctor_id WHERE (w.patient_user_id=$1 OR d.user_id=$1) AND w.status NOT IN ('completed','cancelled') LIMIT 1`,
        [id.data]
      );
      if (walkIns.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Complete, cancel or reassign active walk-ins before deactivating this account.',
        });
      }
    }
    const mapping = {
      fullName: 'full_name',
      phone: 'phone',
      department: 'department',
      program: 'program',
      userType: 'user_type',
      studentNumber: 'student_number',
      staffNumber: 'staff_number',
    } as const;
    for (const [key, column] of Object.entries(mapping))
      if (key in body.data) updates[column] = body.data[key as keyof typeof body.data];
    if (body.data.specialty) updates.program = body.data.specialty;
    if (body.data.active !== undefined)
      await client.query(
        `INSERT INTO account_status (user_id,active) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET active=EXCLUDED.active,updated_at=now()`,
        [id.data, body.data.active]
      );
    if (doctor.rowCount)
      await client.query(
        `UPDATE clinic_doctors SET full_name=COALESCE($2,full_name),department=CASE WHEN $3::boolean THEN $4::text ELSE department END,specialty=COALESCE($5,specialty),active=COALESCE($6,active),updated_at=now() WHERE user_id=$1`,
        [
          id.data,
          body.data.fullName ?? null,
          'department' in body.data,
          body.data.department ?? null,
          body.data.specialty ?? null,
          body.data.active ?? null,
        ]
      );
    authUpdateAttempted = true;
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(id.data, {
      app_metadata: {
        clinic_role: targetRole,
        clinic_phone: body.data.phone ?? authUser.user?.app_metadata.clinic_phone ?? profile.phone,
      },
      ...(body.data.active !== undefined
        ? { ban_duration: body.data.active ? 'none' : '876000h' }
        : {}),
    });
    if (updateAuthError) throw updateAuthError;
    if (Object.keys(updates).length) {
      profileUpdateAttempted = true;
      const updated = await supabaseAdmin.from('profiles').update(updates).eq('id', id.data);
      if (updated.error) throw updated.error;
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,'profile',$3)`,
      [
        req.auth!.userId,
        `${family}.${body.data.active === false ? 'deactivated' : body.data.active === true ? 'reactivated' : 'updated'}`,
        id.data,
      ]
    );
    if (body.data.active !== undefined && account.rows[0]?.active !== body.data.active) await notifyClinicActivity(client, {
      targetUserId: id.data, title: body.data.active ? 'Account activated' : 'Account deactivated',
      message: `${profile.full_name || profile.email}'s ${targetRole} account was ${body.data.active ? 'activated' : 'deactivated'} by an administrator.`,
    });
    await client.query('COMMIT');
    if (res.headersSent || res.writableEnded || res.destroyed) return res;
    return res.json({
      data: {
        id: id.data,
        ...updates,
        ...(body.data.active !== undefined ? { active: body.data.active } : {}),
      },
    });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    // Restore provider changes if a later database step failed. Retrying must
    // not leave the account banned or its contact phone changed after a failed save.
    if (profileUpdateAttempted) {
      await supabaseAdmin
        .from('profiles')
        .update(
          Object.fromEntries(
            Object.keys(updates).map((column) => [column, profile[column] ?? null])
          )
        )
        .eq('id', id.data)
        .then(
          () => undefined,
          () => undefined
        );
    }
    if (authUpdateAttempted) {
      const bannedUntil = authUser.user?.banned_until
        ? new Date(authUser.user.banned_until).getTime()
        : 0;
      await supabaseAdmin.auth.admin
        .updateUserById(id.data, {
          app_metadata: {
            ...authUser.user?.app_metadata,
            clinic_phone: authUser.user?.app_metadata.clinic_phone ?? null,
          },
          ...(body.data.active !== undefined
            ? {
                ban_duration:
                  bannedUntil > Date.now()
                    ? `${Math.ceil((bannedUntil - Date.now()) / 60_000)}m`
                    : 'none',
              }
            : {}),
        })
        .catch(() => undefined);
    }
    return res.status(503).json({ error: 'Unable to update this account.' });
  } finally {
    client.release();
  }
}

router.patch('/staff/:id', allowRoles('admin'), (req, res) =>
  updateAccount(req, res, 'staff', false)
);
router.delete('/staff/:id', allowRoles('admin'), async (req, res) => {
  if (req.auth!.role !== 'admin') return res.status(403).json({ error: 'Only administrators can delete staff accounts.' });
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid staff account id.' });
  try {
    const data = await deletePatientLoginAccount(pool, supabaseAdmin, id.data, req.auth!.userId, 'staff');
    return res.json({ data });
  } catch (error) {
    if (error instanceof PatientDeletionError) return res.status(error.status).json({ error: error.message.replace(/patient/gi, 'staff'), code: error.code === 'PATIENT_DELETION_PENDING' ? 'STAFF_DELETION_PENDING' : error.code });
    return res.status(503).json({ error: 'Unable to delete this staff login. It remains disabled; retry deletion.' });
  }
});
router.patch('/patients/:id', allowRoles('admin', 'receptionist'), (req, res) =>
  updateAccount(req, res, 'patient', false)
);
router.delete('/patients/:id', allowRoles('admin'), async (req, res) => {
  if (req.auth?.role !== 'admin') return res.status(403).json({ error: 'Only administrators can delete patient accounts.' });
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Provide a valid patient account ID.' });
  try {
    const data = await deletePatientLoginAccount(pool, supabaseAdmin, id.data, req.auth!.userId);
    return res.json({ data, message: 'Patient login account deleted. Medical and appointment records are retained.' });
  } catch (error) {
    if (error instanceof PatientDeletionError) return res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
    return res.status(503).json({ error: 'Unable to delete this patient account. Refresh its status and try again.' });
  }
});

const doctorUpdateSchema = doctorSchema
  .omit({ userId: true })
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict();
async function updateDoctor(
  req: import('express').Request,
  res: import('express').Response,
  deactivate: boolean
) {
  const id = z.string().uuid().safeParse(req.params.id);
  const body = doctorUpdateSchema.safeParse(deactivate ? { active: false } : req.body);
  if (!id.success || !body.success || !Object.keys(body.data).length)
    return res.status(400).json({ error: 'Provide valid doctor details.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doctor = await client.query('SELECT user_id FROM clinic_doctors WHERE id=$1 FOR UPDATE', [
      id.data,
    ]);
    if (!doctor.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Doctor not found.' });
    }
    if (body.data.active === false) {
      const conflict = await client.query(
        `SELECT 1 FROM appointments WHERE doctor_id=$1 AND (status='in_progress' OR (status IN ('pending','confirmed') AND ends_at>now())) UNION ALL SELECT 1 FROM walk_ins WHERE assigned_doctor_id=$1 AND status NOT IN ('completed','cancelled') LIMIT 1`,
        [id.data]
      );
      if (conflict.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error:
            'Cancel or reassign active appointments and walk-ins before deactivating this doctor.',
        });
      }
    }
    if (body.data.active === true) {
      const account = await client.query('SELECT active FROM account_status WHERE user_id=$1', [
        doctor.rows[0].user_id,
      ]);
      if (account.rows[0]?.active === false) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json({ error: 'Reactivate the staff account before publishing this doctor.' });
      }
    }
    const result = await client.query(
      `UPDATE clinic_doctors SET full_name=COALESCE($2,full_name),specialty=COALESCE($3,specialty),department=CASE WHEN $4::boolean THEN $5::text ELSE department END,active=COALESCE($6,active),updated_at=now() WHERE id=$1 RETURNING id,user_id,full_name,specialty,department,active`,
      [
        id.data,
        body.data.fullName ?? null,
        body.data.specialty ?? null,
        'department' in body.data,
        body.data.department ?? null,
        body.data.active ?? null,
      ]
    );
    const profileUpdates: Record<string, unknown> = {};
    if (body.data.fullName !== undefined) profileUpdates.full_name = body.data.fullName;
    if (body.data.department !== undefined) profileUpdates.department = body.data.department;
    if (body.data.specialty !== undefined) profileUpdates.program = body.data.specialty;
    if (Object.keys(profileUpdates).length) {
      const updated = await supabaseAdmin
        .from('profiles')
        .update(profileUpdates)
        .eq('id', doctor.rows[0].user_id);
      if (updated.error) throw updated.error;
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,'doctor',$3)`,
      [
        req.auth!.userId,
        body.data.active === false ? 'doctor.deactivated' : 'doctor.updated',
        id.data,
      ]
    );
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to update this doctor.' });
  } finally {
    client.release();
  }
}
router.patch('/doctors/:id', allowRoles('admin'), (req, res) => updateDoctor(req, res, false));
router.delete('/doctors/:id', allowRoles('admin'), (req, res) => updateDoctor(req, res, true));

export default router;
