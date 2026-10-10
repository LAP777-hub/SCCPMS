import { Router } from 'express';
import { z } from 'zod';
import { allowRoles, requireAuth, requireOtp } from './auth.js';
import { pool } from './db.js';

const router = Router();
router.use(requireAuth, requireOtp);

async function auditClinicalRead(actorUserId: string, entityType: string, entityIds: string[]) {
  if (!entityIds.length) return;
  await pool.query(
    `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
    SELECT $1, $2, $3, ids.id FROM unnest($4::uuid[]) AS ids(id)`,
    [actorUserId, `clinical.${entityType}.read`, entityType, entityIds],
  );
}

const visitSchema = z.object({
  appointmentId: z.string().uuid(),
  chiefComplaint: z.string().trim().min(1).max(4000),
  history: z.string().trim().max(10000).nullable().optional(),
  examination: z.string().trim().max(10000).nullable().optional(),
  assessment: z.string().trim().max(10000).nullable().optional(),
  plan: z.string().trim().max(10000).nullable().optional(),
  temperatureC: z.number().min(25).max(45).nullable().optional(),
  bloodPressureSystolic: z.number().int().min(40).max(300).nullable().optional(),
  bloodPressureDiastolic: z.number().int().min(20).max(200).nullable().optional(),
  heartRate: z.number().int().min(20).max(250).nullable().optional(),
  respiratoryRate: z.number().int().min(5).max(80).nullable().optional(),
  oxygenSaturation: z.number().min(0).max(100).nullable().optional(),
  weightKg: z.number().min(0).max(1000).nullable().optional(),
});

router.post('/patient-visits', allowRoles('doctor'), async (req, res) => {
  const parsed = visitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid visit record.', details: parsed.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appointment = await client.query<{ patient_user_id: string }>(
      `SELECT a.patient_user_id FROM appointments a JOIN clinic_doctors d ON d.id = a.doctor_id
       WHERE a.id = $1 AND d.user_id = $2 AND a.status IN ('in_progress', 'completed') FOR UPDATE OF a`,
      [parsed.data.appointmentId, req.auth!.userId],
    );
    if (!appointment.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No active visit for this assigned appointment.' });
    }
    const visit = await client.query(
      `INSERT INTO patient_visits (
         appointment_id, patient_user_id, doctor_user_id, recorded_by, chief_complaint,
         history, examination, assessment, plan, temperature_c, blood_pressure_systolic,
         blood_pressure_diastolic, heart_rate, respiratory_rate, oxygen_saturation, weight_kg
       ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [parsed.data.appointmentId, appointment.rows[0].patient_user_id, req.auth!.userId,
        parsed.data.chiefComplaint, parsed.data.history ?? null, parsed.data.examination ?? null,
        parsed.data.assessment ?? null, parsed.data.plan ?? null, parsed.data.temperatureC ?? null,
        parsed.data.bloodPressureSystolic ?? null, parsed.data.bloodPressureDiastolic ?? null,
        parsed.data.heartRate ?? null, parsed.data.respiratoryRate ?? null,
        parsed.data.oxygenSaturation ?? null, parsed.data.weightKg ?? null],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'clinical.visit.created', 'patient_visit', $2)`,
      [req.auth!.userId, visit.rows[0].id],
    );
    await client.query('COMMIT');
    return res.status(201).json({ data: visit.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(409).json({ error: 'A visit could not be saved for this appointment.' });
  } finally {
    client.release();
  }
});

router.get('/patient-visits', async (req, res) => {
  if (!['doctor', 'patient', 'student', 'lecturer', 'staff'].includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Your role cannot access clinical visit records.' });
  }
  try {
    const result = req.auth!.role === 'doctor'
      ? await pool.query(
        `SELECT v.* FROM patient_visits v
         WHERE v.doctor_user_id = $1 ORDER BY v.visit_date DESC LIMIT 500`,
        [req.auth!.userId],
      )
      : await pool.query(
        `SELECT v.id, v.appointment_id, v.visit_date, v.chief_complaint, v.assessment, v.plan,
                v.temperature_c, v.blood_pressure_systolic, v.blood_pressure_diastolic,
                v.heart_rate, v.respiratory_rate, v.oxygen_saturation, v.weight_kg
         FROM patient_visits v WHERE v.patient_user_id = $1 ORDER BY v.visit_date DESC LIMIT 500`,
        [req.auth!.userId],
      );
    await auditClinicalRead(req.auth!.userId, 'patient_visit', result.rows.map((row) => row.id as string));
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load clinical records.' });
  }
});

const prescriptionSchema = z.object({
  visitId: z.string().uuid(),
  medication: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(200),
  route: z.string().trim().max(80).nullable().optional(),
  frequency: z.string().trim().min(1).max(200),
  duration: z.string().trim().min(1).max(200),
  quantity: z.string().trim().max(100).nullable().optional(),
  instructions: z.string().trim().max(4000).nullable().optional(),
});

router.post('/prescriptions', allowRoles('doctor'), async (req, res) => {
  const parsed = prescriptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid prescription.', details: parsed.error.flatten() });
  try {
    const result = await pool.query(
      `INSERT INTO prescriptions (visit_id, patient_user_id, prescribed_by, medication, dosage, route, frequency, duration, quantity, instructions)
       SELECT v.id, v.patient_user_id, $2, $3, $4, $5, $6, $7, $8, $9
       FROM patient_visits v WHERE v.id = $1 AND v.doctor_user_id = $2
       RETURNING id, visit_id, medication, dosage, route, frequency, duration, quantity, instructions, status, created_at`,
      [parsed.data.visitId, req.auth!.userId, parsed.data.medication, parsed.data.dosage,
        parsed.data.route ?? null, parsed.data.frequency, parsed.data.duration,
        parsed.data.quantity ?? null, parsed.data.instructions ?? null],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Visit not found for this clinician.' });
    await pool.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'clinical.prescription.created', 'prescription', $2)`,
      [req.auth!.userId, result.rows[0].id],
    );
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to save prescription.' });
  }
});

router.get('/prescriptions', async (req, res) => {
  if (!['doctor', 'patient', 'student', 'lecturer', 'staff'].includes(req.auth!.role)) return res.status(403).json({ error: 'Your role cannot access prescription records.' });
  const query = req.auth!.role === 'doctor'
    ? pool.query('SELECT * FROM prescriptions WHERE prescribed_by = $1 ORDER BY created_at DESC LIMIT 500', [req.auth!.userId])
    : pool.query('SELECT id, visit_id, medication, dosage, route, frequency, duration, quantity, instructions, status, created_at FROM prescriptions WHERE patient_user_id = $1 ORDER BY created_at DESC LIMIT 500', [req.auth!.userId]);
  try {
    const result = await query;
    await auditClinicalRead(req.auth!.userId, 'prescription', result.rows.map((row) => row.id as string));
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load prescriptions.' });
  }
});

const labSchema = z.object({ visitId: z.string().uuid(), testName: z.string().trim().min(1).max(200), clinicalIndication: z.string().trim().max(4000).nullable().optional() });

router.post('/lab-orders', allowRoles('doctor'), async (req, res) => {
  const parsed = labSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid laboratory order.', details: parsed.error.flatten() });
  try {
    const result = await pool.query(
      `INSERT INTO lab_orders (visit_id, patient_user_id, ordered_by, test_name, clinical_indication)
       SELECT v.id, v.patient_user_id, $2, $3, $4 FROM patient_visits v
       WHERE v.id = $1 AND v.doctor_user_id = $2 RETURNING *`,
      [parsed.data.visitId, req.auth!.userId, parsed.data.testName, parsed.data.clinicalIndication ?? null],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Visit not found for this clinician.' });
    await pool.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'clinical.lab_order.created', 'lab_order', $2)`, [req.auth!.userId, result.rows[0].id]);
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to save laboratory order.' });
  }
});

router.get('/lab-orders', async (req, res) => {
  if (!['doctor', 'patient', 'student', 'lecturer', 'staff'].includes(req.auth!.role)) return res.status(403).json({ error: 'Your role cannot access laboratory orders.' });
  try {
    const result = req.auth!.role === 'doctor'
      ? await pool.query('SELECT * FROM lab_orders WHERE ordered_by = $1 ORDER BY created_at DESC LIMIT 500', [req.auth!.userId])
      : await pool.query('SELECT id, visit_id, test_name, status, result_summary, resulted_at, created_at FROM lab_orders WHERE patient_user_id = $1 ORDER BY created_at DESC LIMIT 500', [req.auth!.userId]);
    await auditClinicalRead(req.auth!.userId, 'lab_order', result.rows.map((row) => row.id as string));
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load laboratory orders.' });
  }
});

const labResultSchema = z.object({ status: z.enum(['collected', 'processing', 'resulted', 'cancelled']), resultSummary: z.string().trim().max(10000).nullable().optional() });

router.patch('/lab-orders/:id', allowRoles('doctor'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = labResultSchema.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Invalid laboratory order update.' });
  try {
    const result = await pool.query(
      `UPDATE lab_orders SET status = $3, result_summary = CASE WHEN $3 = 'resulted' THEN $4 ELSE result_summary END,
       resulted_by = CASE WHEN $3 = 'resulted' THEN $2 ELSE resulted_by END,
       resulted_at = CASE WHEN $3 = 'resulted' THEN now() ELSE resulted_at END
       WHERE id = $1 AND ordered_by = $2 RETURNING id, visit_id, test_name, status, result_summary, resulted_at`,
      [id.data, req.auth!.userId, parsed.data.status, parsed.data.resultSummary ?? null],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Order not found for this clinician.' });
    await pool.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'clinical.lab_order.updated', 'lab_order', $2)`, [req.auth!.userId, result.rows[0].id]);
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to update laboratory order.' });
  }
});

const walkInSchema = z.object({
  patientUserId: z.string().uuid().nullable().optional(),
  patientName: z.string().trim().min(2).max(160),
  contactPhone: z.string().trim().max(24).nullable().optional(),
  reason: z.string().trim().min(1).max(4000),
  urgency: z.enum(['low', 'medium', 'high', 'emergency']),
});

router.get('/walk-ins', allowRoles('admin', 'receptionist', 'doctor'), async (req, res) => {
  try {
    const result = req.auth!.role === 'doctor'
      ? await pool.query(`SELECT w.* FROM walk_ins w JOIN clinic_doctors d ON d.id = w.assigned_doctor_id WHERE d.user_id = $1 AND w.status NOT IN ('completed', 'cancelled') ORDER BY w.arrived_at`, [req.auth!.userId])
      : await pool.query(`SELECT * FROM walk_ins WHERE status NOT IN ('completed', 'cancelled') ORDER BY CASE urgency WHEN 'emergency' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, arrived_at`);
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load the walk-in queue.' });
  }
});

router.post('/walk-ins', allowRoles('admin', 'receptionist'), async (req, res) => {
  const parsed = walkInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid walk-in details.', details: parsed.error.flatten() });
  try {
    const result = await pool.query(
      `INSERT INTO walk_ins (patient_user_id, patient_name, contact_phone, reason, urgency, checked_in_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [parsed.data.patientUserId ?? null, parsed.data.patientName, parsed.data.contactPhone ?? null, parsed.data.reason, parsed.data.urgency, req.auth!.userId],
    );
    await pool.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'walk_in.checked_in', 'walk_in', $2)`, [req.auth!.userId, result.rows[0].id]);
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to check in walk-in patient.' });
  }
});

router.patch('/walk-ins/:id', allowRoles('admin', 'receptionist', 'doctor'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = z.object({ status: z.enum(['triaged', 'assigned', 'in_progress', 'completed', 'cancelled']), urgency: z.enum(['low', 'medium', 'high', 'emergency']).optional(), doctorId: z.string().uuid().nullable().optional() }).safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Invalid walk-in update.' });
  if (req.auth!.role === 'doctor' && !['in_progress', 'completed'].includes(parsed.data.status)) return res.status(403).json({ error: 'Doctors may only begin or complete their assigned walk-ins.' });
  try {
    const doctorFilter = req.auth!.role === 'doctor' ? `AND assigned_doctor_id IN (SELECT id FROM clinic_doctors WHERE user_id = $5)` : '';
    const result = await pool.query(
      `UPDATE walk_ins SET status = $2, urgency = COALESCE($3, urgency),
       assigned_doctor_id = CASE WHEN $4::uuid IS NULL THEN assigned_doctor_id ELSE $4 END,
       completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END
       WHERE id = $1 ${doctorFilter} RETURNING *`,
      [id.data, parsed.data.status, parsed.data.urgency ?? null, parsed.data.doctorId ?? null, req.auth!.userId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Walk-in not found for this account.' });
    await pool.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, $2, 'walk_in', $3)`, [req.auth!.userId, `walk_in.${parsed.data.status}`, id.data]);
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to update walk-in.' });
  }
});

const leaveSchema = z.object({ startsOn: z.string().date(), endsOn: z.string().date(), leaveType: z.enum(['annual', 'sick', 'emergency', 'personal']), reason: z.string().trim().min(1).max(4000) });

router.get('/leave-requests', allowRoles('doctor', 'admin', 'receptionist'), async (req, res) => {
  try {
    const result = req.auth!.role === 'doctor'
      ? await pool.query(`SELECT * FROM doctor_leave_requests WHERE doctor_user_id = $1 ORDER BY starts_on DESC`, [req.auth!.userId])
      : await pool.query(`SELECT * FROM doctor_leave_requests ORDER BY created_at DESC LIMIT 500`);
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load leave requests.' });
  }
});

router.post('/leave-requests', allowRoles('doctor'), async (req, res) => {
  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid leave request.', details: parsed.error.flatten() });
  if (parsed.data.endsOn < parsed.data.startsOn) return res.status(422).json({ error: 'Leave end date must be on or after the start date.' });
  try {
    const result = await pool.query(
      `INSERT INTO doctor_leave_requests (doctor_user_id, starts_on, ends_on, leave_type, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.auth!.userId, parsed.data.startsOn, parsed.data.endsOn, parsed.data.leaveType, parsed.data.reason],
    );
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to submit leave request.' });
  }
});

router.patch('/leave-requests/:id', allowRoles('admin'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = z.object({ status: z.enum(['approved', 'rejected']), reviewNote: z.string().trim().max(2000).nullable().optional() }).safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Invalid leave decision.' });
  try {
    const result = await pool.query(
      `UPDATE doctor_leave_requests SET status = $2, reviewed_by = $3, review_note = $4, updated_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id.data, parsed.data.status, req.auth!.userId, parsed.data.reviewNote ?? null],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Pending leave request not found.' });
    await pool.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, $2, 'leave_request', $3)`, [req.auth!.userId, `leave.${parsed.data.status}`, id.data]);
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to decide leave request.' });
  }
});

router.get('/reports/summary', allowRoles('admin'), async (req, res) => {
  const query = z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Use valid from/to dates.' });
  try {
    const result = await pool.query(
      `SELECT
         count(*) FILTER (WHERE starts_at::date BETWEEN COALESCE($1::date, current_date - 30) AND COALESCE($2::date, current_date))::int AS appointments,
         count(*) FILTER (WHERE status = 'completed' AND starts_at::date BETWEEN COALESCE($1::date, current_date - 30) AND COALESCE($2::date, current_date))::int AS completed,
         count(*) FILTER (WHERE status = 'cancelled' AND starts_at::date BETWEEN COALESCE($1::date, current_date - 30) AND COALESCE($2::date, current_date))::int AS cancelled,
         count(*) FILTER (WHERE status = 'no_show' AND starts_at::date BETWEEN COALESCE($1::date, current_date - 30) AND COALESCE($2::date, current_date))::int AS no_show
       FROM appointments`,
      [query.data.from ?? null, query.data.to ?? null],
    );
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to generate operations report.' });
  }
});

export default router;