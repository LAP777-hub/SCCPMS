import { Router } from 'express';
import { z } from 'zod';
import { allowRoles, requireAuth, requireOtp } from './auth.js';
import { pool } from './db.js';
import { previousLabStatuses } from './workflow-policy.js';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { schedulingConflict } from './workflow-policy.js';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
router.use(requireAuth, requireOtp);

async function registeredPatient(id: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
  if (error) throw error;
  return (
    data.user &&
    ['patient', 'student', 'lecturer', 'staff'].includes(data.user.app_metadata.clinic_role)
  );
}

async function lockActivePatient(client: import('pg').PoolClient, patientId: string) {
  // Account updates use this same row lock so intake cannot race deactivation.
  await client.query(
    'INSERT INTO account_status(user_id) VALUES ($1) ON CONFLICT(user_id) DO NOTHING',
    [patientId]
  );
  const account = await client.query<{ active: boolean }>(
    'SELECT active FROM account_status WHERE user_id=$1 FOR UPDATE',
    [patientId]
  );
  return account.rows[0]?.active === true;
}

async function auditClinicalRead(actorUserId: string, entityType: string, entityIds: string[]) {
  if (!entityIds.length) return;
  await pool.query(
    `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
    SELECT $1, $2, $3, ids.id FROM unnest($4::uuid[]) AS ids(id)`,
    [actorUserId, `clinical.${entityType}.read`, entityType, entityIds]
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
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid visit record.', details: parsed.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appointment = await client.query<{ patient_user_id: string }>(
      `SELECT a.patient_user_id FROM appointments a JOIN clinic_doctors d ON d.id = a.doctor_id
       WHERE a.id = $1 AND d.user_id = $2 AND a.status IN ('in_progress', 'completed') FOR UPDATE OF a`,
      [parsed.data.appointmentId, req.auth!.userId]
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
      [
        parsed.data.appointmentId,
        appointment.rows[0].patient_user_id,
        req.auth!.userId,
        parsed.data.chiefComplaint,
        parsed.data.history ?? null,
        parsed.data.examination ?? null,
        parsed.data.assessment ?? null,
        parsed.data.plan ?? null,
        parsed.data.temperatureC ?? null,
        parsed.data.bloodPressureSystolic ?? null,
        parsed.data.bloodPressureDiastolic ?? null,
        parsed.data.heartRate ?? null,
        parsed.data.respiratoryRate ?? null,
        parsed.data.oxygenSaturation ?? null,
        parsed.data.weightKg ?? null,
      ]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'clinical.visit.created', 'patient_visit', $2)`,
      [req.auth!.userId, visit.rows[0].id]
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

router.patch('/patient-visits/:id', allowRoles('doctor'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = visitSchema.omit({ appointmentId: true }).partial().strict().safeParse(req.body);
  if (!id.success || !parsed.success || !Object.keys(parsed.data).length)
    return res.status(400).json({ error: 'Provide valid visit fields.' });
  const columnMap = {
    chiefComplaint: 'chief_complaint',
    history: 'history',
    examination: 'examination',
    assessment: 'assessment',
    plan: 'plan',
    temperatureC: 'temperature_c',
    bloodPressureSystolic: 'blood_pressure_systolic',
    bloodPressureDiastolic: 'blood_pressure_diastolic',
    heartRate: 'heart_rate',
    respiratoryRate: 'respiratory_rate',
    oxygenSaturation: 'oxygen_saturation',
    weightKg: 'weight_kg',
  } as const;
  const entries = Object.entries(parsed.data);
  const set = entries
    .map(([key], index) => `${columnMap[key as keyof typeof columnMap]}=$${index + 3}`)
    .join(',');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE patient_visits SET ${set},updated_at=now() WHERE id=$1 AND doctor_user_id=$2 RETURNING *`,
      [id.data, req.auth!.userId, ...entries.map(([, value]) => value)]
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Visit not found for this clinician.' });
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'clinical.visit.updated','patient_visit',$2)`,
      [req.auth!.userId, id.data]
    );
    await client.query('COMMIT');
    return res.json({ data: updated.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to update clinical visit.' });
  } finally {
    client.release();
  }
});

router.get('/patient-visits/:id/revisions', allowRoles('doctor'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid visit ID.' });
  try {
    const visit = await pool.query('SELECT id FROM patient_visits WHERE id=$1 AND doctor_user_id=$2', [id.data, req.auth!.userId]);
    if (!visit.rowCount) return res.status(404).json({ error: 'Visit not found for this clinician.' });
    const revisions = await pool.query('SELECT id,previous_record,revised_record,created_at FROM clinical_visit_revisions WHERE visit_id=$1 ORDER BY created_at DESC', [id.data]);
    await auditClinicalRead(req.auth!.userId, 'visit_revision', [id.data]);
    return res.json({ data: revisions.rows });
  } catch { return res.status(503).json({ error: 'Unable to load visit correction history.' }); }
});

router.get('/patient-visits', async (req, res) => {
  if (!['doctor', 'patient', 'student', 'lecturer', 'staff'].includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Your role cannot access clinical visit records.' });
  }
  try {
    const result =
      req.auth!.role === 'doctor'
        ? await pool.query(
            `SELECT v.* FROM patient_visits v
         WHERE v.doctor_user_id = $1 ORDER BY v.visit_date DESC LIMIT 500`,
            [req.auth!.userId]
          )
        : await pool.query(
            `SELECT v.id, v.appointment_id, v.visit_date, v.chief_complaint, v.assessment, v.plan,
                v.temperature_c, v.blood_pressure_systolic, v.blood_pressure_diastolic,
                v.heart_rate, v.respiratory_rate, v.oxygen_saturation, v.weight_kg
         FROM patient_visits v WHERE v.patient_user_id = $1 ORDER BY v.visit_date DESC LIMIT 500`,
            [req.auth!.userId]
          );
    await auditClinicalRead(
      req.auth!.userId,
      'patient_visit',
      result.rows.map((row) => row.id as string)
    );
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
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid prescription.', details: parsed.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO prescriptions (visit_id, patient_user_id, prescribed_by, medication, dosage, route, frequency, duration, quantity, instructions)
       SELECT v.id, v.patient_user_id, $2, $3, $4, $5, $6, $7, $8, $9
       FROM patient_visits v WHERE v.id = $1 AND v.doctor_user_id = $2
       RETURNING *`,
      [
        parsed.data.visitId,
        req.auth!.userId,
        parsed.data.medication,
        parsed.data.dosage,
        parsed.data.route ?? null,
        parsed.data.frequency,
        parsed.data.duration,
        parsed.data.quantity ?? null,
        parsed.data.instructions ?? null,
      ]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Visit not found for this clinician.' });
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'clinical.prescription.created', 'prescription', $2)`,
      [req.auth!.userId, result.rows[0].id]
    );
    await client.query(
      `INSERT INTO notifications (user_id,title,message,category) VALUES ($1,'Prescription added',$2,'system')`,
      [
        result.rows[0].patient_user_id,
        `${result.rows[0].medication} is available in your prescriptions.`,
      ]
    );
    await client.query('COMMIT');
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to save prescription.' });
  } finally {
    client.release();
  }
});

router.patch('/prescriptions/:id', allowRoles('doctor'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = z
    .object({ status: z.enum(['discontinued', 'completed']) })
    .strict()
    .safeParse(req.body);
  if (!id.success || !parsed.success)
    return res.status(400).json({ error: 'Provide a valid prescription status.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE prescriptions SET status=$3 WHERE id=$1 AND prescribed_by=$2 AND status='active' RETURNING *`,
      [id.data, req.auth!.userId, parsed.data.status]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active prescription not found for this clinician.' });
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,'prescription',$3)`,
      [req.auth!.userId, `clinical.prescription.${parsed.data.status}`, id.data]
    );
    await client.query(
      `INSERT INTO notifications (user_id,title,message,category) VALUES ($1,'Prescription updated',$2,'system')`,
      [result.rows[0].patient_user_id, `${result.rows[0].medication} is now ${parsed.data.status}.`]
    );
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to update prescription.' });
  } finally {
    client.release();
  }
});

router.get('/prescriptions', async (req, res) => {
  if (!['doctor', 'patient', 'student', 'lecturer', 'staff'].includes(req.auth!.role))
    return res.status(403).json({ error: 'Your role cannot access prescription records.' });
  const query =
    req.auth!.role === 'doctor'
      ? pool.query(
          'SELECT * FROM prescriptions WHERE prescribed_by = $1 ORDER BY created_at DESC LIMIT 500',
          [req.auth!.userId]
        )
      : pool.query(
          'SELECT id, visit_id, medication, dosage, route, frequency, duration, quantity, instructions, status, created_at FROM prescriptions WHERE patient_user_id = $1 ORDER BY created_at DESC LIMIT 500',
          [req.auth!.userId]
        );
  try {
    const result = await query;
    await auditClinicalRead(
      req.auth!.userId,
      'prescription',
      result.rows.map((row) => row.id as string)
    );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load prescriptions.' });
  }
});

const labSchema = z.object({
  visitId: z.string().uuid(),
  testName: z.string().trim().min(1).max(200),
  clinicalIndication: z.string().trim().max(4000).nullable().optional(),
});

router.post('/lab-orders', allowRoles('doctor'), async (req, res) => {
  const parsed = labSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid laboratory order.', details: parsed.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO lab_orders (visit_id, patient_user_id, ordered_by, test_name, clinical_indication)
       SELECT v.id, v.patient_user_id, $2, $3, $4 FROM patient_visits v
       WHERE v.id = $1 AND v.doctor_user_id = $2 RETURNING *`,
      [
        parsed.data.visitId,
        req.auth!.userId,
        parsed.data.testName,
        parsed.data.clinicalIndication ?? null,
      ]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Visit not found for this clinician.' });
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'clinical.lab_order.created', 'lab_order', $2)`,
      [req.auth!.userId, result.rows[0].id]
    );
    await client.query(
      `INSERT INTO notifications (user_id,title,message,category) VALUES ($1,'Laboratory test ordered',$2,'system')`,
      [
        result.rows[0].patient_user_id,
        `${result.rows[0].test_name} has been ordered. Track its status in your health records.`,
      ]
    );
    await client.query('COMMIT');
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to save laboratory order.' });
  } finally {
    client.release();
  }
});

router.get('/lab-orders', async (req, res) => {
  if (!['doctor', 'patient', 'student', 'lecturer', 'staff'].includes(req.auth!.role))
    return res.status(403).json({ error: 'Your role cannot access laboratory orders.' });
  try {
    const result =
      req.auth!.role === 'doctor'
        ? await pool.query(
            'SELECT * FROM lab_orders WHERE ordered_by = $1 ORDER BY created_at DESC LIMIT 500',
            [req.auth!.userId]
          )
        : await pool.query(
            'SELECT id, visit_id, test_name, status, result_summary, resulted_at, created_at FROM lab_orders WHERE patient_user_id = $1 ORDER BY created_at DESC LIMIT 500',
            [req.auth!.userId]
          );
    await auditClinicalRead(
      req.auth!.userId,
      'lab_order',
      result.rows.map((row) => row.id as string)
    );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load laboratory orders.' });
  }
});

const labResultSchema = z.object({
  status: z.enum(['collected', 'processing', 'resulted', 'cancelled']),
  resultSummary: z.string().trim().max(10000).nullable().optional(),
});

router.patch('/lab-orders/:id', allowRoles('doctor'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = labResultSchema.safeParse(req.body);
  if (!id.success || !parsed.success)
    return res.status(400).json({ error: 'Invalid laboratory order update.' });
  if (parsed.data.status === 'resulted' && !parsed.data.resultSummary?.trim())
    return res
      .status(422)
      .json({ error: 'Enter the laboratory result before marking the order resulted.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE lab_orders SET status = $3, result_summary = CASE WHEN $3 = 'resulted' THEN $4 ELSE result_summary END,
       resulted_by = CASE WHEN $3 = 'resulted' THEN $2 ELSE resulted_by END,
       resulted_at = CASE WHEN $3 = 'resulted' THEN now() ELSE resulted_at END
       WHERE id = $1 AND ordered_by = $2 AND status = ANY($5::text[]) RETURNING *`,
      [
        id.data,
        req.auth!.userId,
        parsed.data.status,
        parsed.data.resultSummary ?? null,
        previousLabStatuses(parsed.data.status),
      ]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res
        .status(404)
        .json({ error: 'Order not found or this status change is no longer allowed.' });
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'clinical.lab_order.updated', 'lab_order', $2)`,
      [req.auth!.userId, result.rows[0].id]
    );
    if (parsed.data.status === 'resulted')
      await client.query(
        `INSERT INTO notifications (user_id,title,message,category) VALUES ($1,'Laboratory result available',$2,'system')`,
        [
          result.rows[0].patient_user_id,
          `${result.rows[0].test_name} results are available in your health records.`,
        ]
      );
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to update laboratory order.' });
  } finally {
    client.release();
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
    const result =
      req.auth!.role === 'doctor'
        ? await pool.query(
            `SELECT w.*,d.full_name AS doctor_name FROM walk_ins w JOIN clinic_doctors d ON d.id = w.assigned_doctor_id WHERE d.user_id = $1 AND w.status NOT IN ('completed', 'cancelled') ORDER BY w.arrived_at`,
            [req.auth!.userId]
          )
        : await pool.query(
            `SELECT w.*,d.full_name AS doctor_name FROM walk_ins w LEFT JOIN clinic_doctors d ON d.id=w.assigned_doctor_id WHERE w.status NOT IN ('completed', 'cancelled') ORDER BY CASE w.urgency WHEN 'emergency' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, w.arrived_at`
          );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load the walk-in queue.' });
  }
});

router.post('/walk-ins', allowRoles('admin', 'receptionist'), async (req, res) => {
  const parsed = walkInSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid walk-in details.', details: parsed.error.flatten() });
  try {
    if (parsed.data.patientUserId && !(await registeredPatient(parsed.data.patientUserId)))
      return res
        .status(422)
        .json({ error: 'Select a registered patient account for this walk-in.' });
  } catch {
    return res.status(503).json({ error: 'Unable to verify the patient account.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (parsed.data.patientUserId) {
      if (!(await lockActivePatient(client, parsed.data.patientUserId))) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'The patient account is inactive.' });
      }
      const duplicate = await client.query(
        `SELECT 1 FROM walk_ins WHERE patient_user_id=$1 AND status NOT IN ('completed','cancelled')`,
        [parsed.data.patientUserId]
      );
      if (duplicate.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This patient is already in the walk-in queue.' });
      }
    }
    const result = await client.query(
      `INSERT INTO walk_ins (patient_user_id, patient_name, contact_phone, reason, urgency, checked_in_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        parsed.data.patientUserId ?? null,
        parsed.data.patientName,
        parsed.data.contactPhone ?? null,
        parsed.data.reason,
        parsed.data.urgency,
        req.auth!.userId,
      ]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'walk_in.checked_in', 'walk_in', $2)`,
      [req.auth!.userId, result.rows[0].id]
    );
    await client.query('COMMIT');
    return res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return res
        .status(409)
        .json({ error: 'This patient is already in the active walk-in queue.' });
    }
    return res.status(503).json({ error: 'Unable to check in walk-in patient.' });
  } finally {
    client.release();
  }
});

router.patch('/walk-ins/:id', allowRoles('admin', 'receptionist', 'doctor'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = z
    .object({
      status: z.enum(['waiting', 'triaged', 'assigned', 'in_progress', 'completed', 'cancelled']),
      urgency: z.enum(['low', 'medium', 'high', 'emergency']).optional(),
      doctorId: z.string().uuid().nullable().optional(),
      patientUserId: z.string().uuid().optional(),
    })
    .strict()
    .safeParse(req.body);
  if (!id.success || !parsed.success)
    return res.status(400).json({ error: 'Invalid walk-in update.' });
  const isDoctor = req.auth!.role === 'doctor';
  if (
    isDoctor &&
    (!['in_progress', 'completed'].includes(parsed.data.status) ||
      parsed.data.doctorId !== undefined ||
      parsed.data.urgency !== undefined ||
      parsed.data.patientUserId !== undefined)
  )
    return res
      .status(403)
      .json({ error: 'Doctors may only begin or complete their assigned walk-ins.' });
  try {
    if (parsed.data.patientUserId && !(await registeredPatient(parsed.data.patientUserId)))
      return res.status(422).json({ error: 'Select a registered patient account.' });
  } catch {
    return res.status(503).json({ error: 'Unable to verify the patient account.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM walk_ins WHERE id=$1 FOR UPDATE', [id.data]);
    const walkIn = found.rows[0];
    if (!walkIn) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Walk-in not found.' });
    }
    if (['completed', 'cancelled'].includes(walkIn.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This walk-in is already closed.' });
    }
    if ((walkIn.patient_user_id || parsed.data.patientUserId) && ['in_progress','completed'].includes(parsed.data.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Start a linked consultation and document the visit before completing registered patient care.' });
    }
    if (
      walkIn.appointment_id &&
      (parsed.data.status !== walkIn.status ||
        parsed.data.doctorId !== undefined ||
        parsed.data.patientUserId !== undefined)
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Update the linked consultation appointment to complete or cancel this walk-in.',
      });
    }
    if (parsed.data.patientUserId && !(await lockActivePatient(client, parsed.data.patientUserId))) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'The patient account is inactive.' });
    }
    const assignedDoctor =
      parsed.data.doctorId !== undefined ? parsed.data.doctorId : walkIn.assigned_doctor_id;
    if (['assigned', 'in_progress', 'completed'].includes(parsed.data.status) && !assignedDoctor) {
      await client.query('ROLLBACK');
      return res
        .status(422)
        .json({ error: 'Assign an active doctor before starting or completing care.' });
    }
    if (assignedDoctor && parsed.data.status !== 'cancelled') {
      const doctor = await client.query(
        `SELECT d.user_id,d.active,NOT EXISTS (SELECT 1 FROM doctor_leave_requests l,clinic_settings c WHERE l.doctor_user_id=d.user_id AND l.status='approved' AND (now() AT TIME ZONE c.timezone)::date BETWEEN l.starts_on AND l.ends_on) AS available FROM clinic_doctors d WHERE d.id=$1 FOR UPDATE`,
        [assignedDoctor]
      );
      if (!doctor.rowCount || !doctor.rows[0].active || !doctor.rows[0].available) {
        await client.query('ROLLBACK');
        return res
          .status(422)
          .json({ error: 'The assigned doctor is inactive or on approved leave.' });
      }
      if (
        isDoctor &&
        (doctor.rows[0].user_id !== req.auth!.userId ||
          (parsed.data.status === 'completed' && walkIn.status !== 'in_progress') ||
          (parsed.data.status === 'in_progress' && walkIn.status !== 'assigned'))
      ) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'You may only begin assigned walk-ins and complete visits already in progress.',
        });
      }
    }
    const result = await client.query(
      `UPDATE walk_ins SET status = $2, urgency = COALESCE($3, urgency),
       assigned_doctor_id = $4::uuid,
       patient_user_id=COALESCE($5::uuid,patient_user_id),
       completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END
       WHERE id = $1 RETURNING *`,
      [
        id.data,
        parsed.data.status,
        parsed.data.urgency ?? null,
        assignedDoctor,
        parsed.data.patientUserId ?? null,
      ]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, $2, 'walk_in', $3)`,
      [req.auth!.userId, `walk_in.${parsed.data.status}`, id.data]
    );
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return res.status(409).json({ error: 'This patient is already in the active walk-in queue.' });
    }
    return res.status(503).json({ error: 'Unable to update walk-in.' });
  } finally {
    client.release();
  }
});

router.post('/walk-ins/:id/consultation', allowRoles('doctor'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid walk-in id.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT w.*,d.user_id,d.active FROM walk_ins w JOIN clinic_doctors d ON d.id=w.assigned_doctor_id WHERE w.id=$1 AND d.user_id=$2 FOR UPDATE OF w,d`,
      [id.data, req.auth!.userId]
    );
    const walkIn = found.rows[0];
    if (!walkIn) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Walk-in not found for this assigned doctor.' });
    }
    if (walkIn.appointment_id) {
      await client.query('COMMIT');
      return res.json({ data: { appointmentId: walkIn.appointment_id } });
    }
    if (!walkIn.active || !['assigned', 'in_progress'].includes(walkIn.status)) {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({ error: 'An active doctor must be assigned before starting this consultation.' });
    }
    if (!walkIn.patient_user_id || !(await registeredPatient(walkIn.patient_user_id))) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error:
          'Reception must register and link a patient account before a clinical consultation can begin.',
      });
    }
    const account = await client.query('SELECT active FROM account_status WHERE user_id=$1', [
      walkIn.patient_user_id,
    ]);
    if (account.rows[0]?.active === false) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'The linked patient account is inactive.' });
    }
    const clinic = await client.query(
      `SELECT now() AS starts_at,now()+default_appointment_minutes*interval '1 minute' AS ends_at,
      (now() AT TIME ZONE timezone)::time>=opens_at
      AND ((now()+default_appointment_minutes*interval '1 minute') AT TIME ZONE timezone)::time<=closes_at
      AND (now() AT TIME ZONE timezone)::date=((now()+default_appointment_minutes*interval '1 minute') AT TIME ZONE timezone)::date
      AND NOT EXISTS (SELECT 1 FROM clinic_holidays h WHERE h.holiday_date=(now() AT TIME ZONE timezone)::date)
      AND NOT EXISTS (SELECT 1 FROM doctor_leave_requests l WHERE l.doctor_user_id=$1 AND l.status='approved' AND (now() AT TIME ZONE timezone)::date BETWEEN l.starts_on AND l.ends_on) AS allowed
      FROM clinic_settings WHERE id=true FOR SHARE`,
      [req.auth!.userId]
    );
    if (!clinic.rows[0]?.allowed) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error:
          'The clinic must be open for the consultation duration and the doctor must not be on approved leave.',
      });
    }
    const { starts_at, ends_at } = clinic.rows[0];
    const conflict = await client.query(
      `SELECT 1 FROM appointments WHERE (doctor_id=$1 OR patient_user_id=$2) AND status NOT IN ('cancelled','no_show') AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`,
      [walkIn.assigned_doctor_id, walkIn.patient_user_id, starts_at, ends_at]
    );
    if (conflict.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error:
          'The doctor or patient already has a consultation during this time. Reschedule the booking or assign another doctor.',
      });
    }
    const appointment = await client.query(
      `INSERT INTO appointments (patient_user_id,doctor_id,starts_at,ends_at,consultation_type,mode,reason,status,updated_by) VALUES ($1,$2,$3,$4,'Walk-in consultation','in_person',$5,'in_progress',$6) RETURNING *`,
      [
        walkIn.patient_user_id,
        walkIn.assigned_doctor_id,
        starts_at,
        ends_at,
        walkIn.reason,
        req.auth!.userId,
      ]
    );
    const appointmentId = appointment.rows[0].id;
    await client.query(`UPDATE walk_ins SET appointment_id=$2,status='in_progress' WHERE id=$1`, [
      id.data,
      appointmentId,
    ]);
    await client.query(
      `UPDATE doctor_availability_slots SET status='blocked' WHERE doctor_id=$1 AND status='available' AND tstzrange(starts_at,ends_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')`,
      [walkIn.assigned_doctor_id, starts_at, ends_at]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'walk_in.consultation.started','walk_in',$2),($1,'appointment.walk_in.created','appointment',$3)`,
      [req.auth!.userId, id.data, appointmentId]
    );
    await client.query(
      `INSERT INTO notifications (user_id,title,message,category) VALUES ($1,'Walk-in consultation started','Your walk-in is linked to a clinical visit. Records will appear in your health records.','appointment')`,
      [walkIn.patient_user_id]
    );
    await client.query('COMMIT');
    return res.status(201).json({ data: { appointmentId, ...appointment.rows[0] } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(schedulingConflict(error) ? 409 : 503).json({
      error: 'Unable to begin this consultation. Check the doctor and patient schedules.',
    });
  } finally {
    client.release();
  }
});

router.delete('/walk-ins/:id', allowRoles('admin', 'receptionist'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid walk-in id.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE walk_ins SET status='cancelled' WHERE id=$1 AND status NOT IN ('completed','cancelled') AND appointment_id IS NULL RETURNING *`,
      [id.data]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active walk-in not found.' });
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'walk_in.cancelled','walk_in',$2)`,
      [req.auth!.userId, id.data]
    );
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to remove this walk-in from the queue.' });
  } finally {
    client.release();
  }
});

const leaveSchema = z.object({
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  leaveType: z.enum(['annual', 'sick', 'emergency', 'personal']),
  reason: z.string().trim().min(1).max(4000),
});

router.get('/leave-requests', allowRoles('doctor', 'admin', 'receptionist'), async (req, res) => {
  try {
    const result =
      req.auth!.role === 'doctor'
        ? await pool.query(
            `SELECT l.*,l.starts_on::text AS starts_on,l.ends_on::text AS ends_on,d.full_name AS doctor_name FROM doctor_leave_requests l LEFT JOIN clinic_doctors d ON d.user_id=l.doctor_user_id WHERE l.doctor_user_id = $1 ORDER BY l.starts_on DESC`,
            [req.auth!.userId]
          )
        : await pool.query(
            `SELECT l.*,l.starts_on::text AS starts_on,l.ends_on::text AS ends_on,d.full_name AS doctor_name FROM doctor_leave_requests l LEFT JOIN clinic_doctors d ON d.user_id=l.doctor_user_id ORDER BY l.created_at DESC LIMIT 500`
          );
    return res.json({ data: result.rows });
  } catch {
    return res.status(503).json({ error: 'Unable to load leave requests.' });
  }
});

router.post('/leave-requests', allowRoles('doctor'), async (req, res) => {
  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Invalid leave request.', details: parsed.error.flatten() });
  if (parsed.data.endsOn < parsed.data.startsOn)
    return res.status(422).json({ error: 'Leave end date must be on or after the start date.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doctor = await client.query(
      'SELECT id FROM clinic_doctors WHERE user_id=$1 AND active=true FOR UPDATE',
      [req.auth!.userId]
    );
    if (!doctor.rowCount) {
      await client.query('ROLLBACK');
      return res
        .status(422)
        .json({ error: 'An active doctor directory entry is required before requesting leave.' });
    }
    const dates = await client.query(
      `SELECT $1::date >= (now() AT TIME ZONE timezone)::date AS valid FROM clinic_settings WHERE id=true`,
      [parsed.data.startsOn]
    );
    if (!dates.rows[0]?.valid) {
      await client.query('ROLLBACK');
      return res
        .status(422)
        .json({ error: 'Leave cannot start before today in the clinic timezone.' });
    }
    const overlap = await client.query(
      `SELECT 1 FROM doctor_leave_requests WHERE doctor_user_id=$1 AND status IN ('pending','approved') AND daterange(starts_on,ends_on,'[]') && daterange($2::date,$3::date,'[]')`,
      [req.auth!.userId, parsed.data.startsOn, parsed.data.endsOn]
    );
    if (overlap.rowCount) {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({ error: 'You already have pending or approved leave during these dates.' });
    }
    const result = await client.query(
      `INSERT INTO doctor_leave_requests (doctor_user_id, starts_on, ends_on, leave_type, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *,starts_on::text AS starts_on,ends_on::text AS ends_on`,
      [
        req.auth!.userId,
        parsed.data.startsOn,
        parsed.data.endsOn,
        parsed.data.leaveType,
        parsed.data.reason,
      ]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'leave.requested','leave_request',$2)`,
      [req.auth!.userId, result.rows[0].id]
    );
    await client.query('COMMIT');
    return res.status(201).json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to submit leave request.' });
  } finally {
    client.release();
  }
});

router.patch('/leave-requests/:id', allowRoles('admin'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = z
    .object({
      status: z.enum(['approved', 'rejected']),
      reviewNote: z.string().trim().max(2000).nullable().optional(),
    })
    .safeParse(req.body);
  if (!id.success || !parsed.success)
    return res.status(400).json({ error: 'Invalid leave decision.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      "SELECT *,starts_on::text AS starts_on,ends_on::text AS ends_on FROM doctor_leave_requests WHERE id=$1 AND status='pending' FOR UPDATE",
      [id.data]
    );
    const leave = found.rows[0];
    if (!leave) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending leave request not found.' });
    }
    const doctor = await client.query('SELECT id FROM clinic_doctors WHERE user_id=$1 FOR UPDATE', [
      leave.doctor_user_id,
    ]);
    if (!doctor.rowCount) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'The doctor account is not in the clinic directory.' });
    }
    if (parsed.data.status === 'approved') {
      const conflicts = await client.query(
        `SELECT 1 FROM appointments a,clinic_settings c WHERE a.doctor_id=$1 AND a.status IN ('pending','confirmed','in_progress') AND (a.starts_at AT TIME ZONE c.timezone)::date BETWEEN $2::date AND $3::date UNION ALL SELECT 1 FROM walk_ins w,clinic_settings c WHERE w.assigned_doctor_id=$1 AND w.status NOT IN ('completed','cancelled') AND (now() AT TIME ZONE c.timezone)::date BETWEEN $2::date AND $3::date LIMIT 1`,
        [doctor.rows[0].id, leave.starts_on, leave.ends_on]
      );
      if (conflicts.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error:
            'Cancel or reschedule appointments and reassign active walk-ins during these dates before approving leave.',
        });
      }
      const overlap = await client.query(
        `SELECT 1 FROM doctor_leave_requests WHERE doctor_user_id=$1 AND id<>$2 AND status='approved' AND daterange(starts_on,ends_on,'[]') && daterange($3::date,$4::date,'[]')`,
        [leave.doctor_user_id, id.data, leave.starts_on, leave.ends_on]
      );
      if (overlap.rowCount) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json({ error: 'This doctor already has approved leave during these dates.' });
      }
    }
    const result = await client.query(
      `UPDATE doctor_leave_requests SET status = $2, reviewed_by = $3, review_note = $4, updated_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *,starts_on::text AS starts_on,ends_on::text AS ends_on`,
      [id.data, parsed.data.status, req.auth!.userId, parsed.data.reviewNote ?? null]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, $2, 'leave_request', $3)`,
      [req.auth!.userId, `leave.${parsed.data.status}`, id.data]
    );
    await client.query(
      `INSERT INTO notifications (user_id,title,message,category) VALUES ($1,'Leave request reviewed',$2,'system')`,
      [
        leave.doctor_user_id,
        `Your leave request was ${parsed.data.status}.${parsed.data.reviewNote ? ` ${parsed.data.reviewNote}` : ''}`,
      ]
    );
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to decide leave request.' });
  } finally {
    client.release();
  }
});

router.delete('/leave-requests/:id', allowRoles('doctor', 'admin'), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid leave request id.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE doctor_leave_requests l SET status='cancelled',updated_at=now() FROM clinic_settings c WHERE l.id=$1 AND ($2::text='admin' OR l.doctor_user_id=$3) AND (l.status='pending' OR (l.status='approved' AND l.starts_on>(now() AT TIME ZONE c.timezone)::date)) RETURNING l.*,l.starts_on::text AS starts_on,l.ends_on::text AS ends_on`,
      [id.data, req.auth!.role, req.auth!.userId]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res
        .status(404)
        .json({ error: 'Only your pending or future approved leave can be withdrawn.' });
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'leave.cancelled','leave_request',$2)`,
      [req.auth!.userId, id.data]
    );
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to withdraw this leave request.' });
  } finally {
    client.release();
  }
});

router.get('/reports/summary', allowRoles('admin'), async (req, res) => {
  const query = z
    .object({ from: z.string().date().optional(), to: z.string().date().optional() })
    .safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Use valid from/to dates.' });
  if (query.data.from && query.data.to && query.data.from > query.data.to)
    return res
      .status(422)
      .json({ error: 'The report end date must be on or after the start date.' });
  try {
    const result = await pool.query(
      `WITH bounds AS (
         SELECT timezone,COALESCE($1::date,(now() AT TIME ZONE timezone)::date-30) AS from_date,
           COALESCE($2::date,(now() AT TIME ZONE timezone)::date) AS to_date FROM clinic_settings WHERE id=true
       ), selected AS (
         SELECT a.* FROM appointments a,bounds b
         WHERE (a.starts_at AT TIME ZONE b.timezone)::date BETWEEN b.from_date AND b.to_date
       ) SELECT count(*)::int AS appointments,
         count(*) FILTER (WHERE status='completed')::int AS completed,
         count(*) FILTER (WHERE status='cancelled')::int AS cancelled,
         count(*) FILTER (WHERE status='no_show')::int AS no_show,
         count(*) FILTER (WHERE status='pending')::int AS pending,
         count(*) FILTER (WHERE status='confirmed')::int AS confirmed,
         count(*) FILTER (WHERE status='in_progress')::int AS in_progress,
         count(DISTINCT patient_user_id) FILTER (WHERE status='completed')::int AS patients_seen,
         (SELECT count(*)::int FROM clinic_doctors WHERE active=true) AS active_doctors,
         (SELECT count(*)::int FROM doctor_leave_requests WHERE status='pending') AS pending_leave,
         (SELECT count(*)::int FROM walk_ins w,bounds b WHERE (w.arrived_at AT TIME ZONE b.timezone)::date BETWEEN b.from_date AND b.to_date) AS walk_ins
       FROM selected`,
      [query.data.from ?? null, query.data.to ?? null]
    );
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(503).json({ error: 'Unable to generate operations report.' });
  }
});

export default router;
