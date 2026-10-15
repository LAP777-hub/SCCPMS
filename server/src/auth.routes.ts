import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from './config.js';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { refinePatientIdentity, accountEmailSchema } from './university-policy.js';
import { phoneSchema } from './phone.js';
import academicCatalogue from './academic-catalogue.json' with { type: 'json' };
import { authCallbackUrl } from './auth-callback.js';
import { notifyClinicActivity } from './clinic-notifications.js';

const router = Router();
const authClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

router.get('/profile', requireAuth, (req, res) => res.json({ data: req.auth!.profile }));
router.post('/invitation/complete', requireAuth, async (req, res) => {
  const body = z.object({ password: z.string().min(8).max(128) }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Use a password containing 8 to 128 characters.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invitation = await client.query('SELECT role,accepted_at FROM account_invitations WHERE user_id=$1 FOR UPDATE', [req.auth!.userId]);
    if (!invitation.rows[0]) {
      const age = Date.now() - Date.parse(req.auth!.invitedAt ?? '');
      await client.query('ROLLBACK');
      if (Number.isFinite(age) && age >= 0 && age <= 120000) return res.status(503).json({ error: 'Your invitation is still being prepared. Retry shortly.', code: 'ACCOUNT_SETUP_PENDING', retryAfterSeconds: 1 });
      return res.status(403).json({ error: 'A pending invitation for this account is required.' });
    }
    if (invitation.rows[0].role !== req.auth!.role) {
      await client.query('ROLLBACK'); return res.status(403).json({ error: 'A pending invitation for this account is required.' });
    }
    const response = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, { method: 'PUT',
      headers: { apikey: config.SUPABASE_ANON_KEY, Authorization: req.headers.authorization!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: body.data.password }), signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); await client.query('ROLLBACK'); return res.status(422).json({ error: 'The account service could not save this password. Check its password requirements and try again.' }); }
    const user = await response.json() as { id?: string };
    if (user.id !== req.auth!.userId) throw new Error('Unexpected password update identity');
    // Recheck the status under the same lock used by account suspension.
    const status = await client.query('SELECT active,deletion_requested_at,deleted_at FROM account_status WHERE user_id=$1 FOR UPDATE', [req.auth!.userId]);
    if (status.rows[0]?.active === false || status.rows[0]?.deleted_at || status.rows[0]?.deletion_requested_at) {
      await client.query('ROLLBACK'); return res.status(403).json({ error: 'This account is no longer active.', code: 'ACCOUNT_DISABLED' });
    }
    if (invitation.rows[0].accepted_at) { await client.query('COMMIT'); return res.headersSent || res.writableEnded || res.destroyed ? res : res.json({ message: 'Password updated. Invitation already accepted.' }); }
    await client.query('UPDATE account_invitations SET accepted_at=now() WHERE user_id=$1 AND accepted_at IS NULL', [req.auth!.userId]);
    await client.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'profile',$1)`, [req.auth!.userId,`${req.auth!.role}.invitation_accepted`]);
    await notifyClinicActivity(client, { targetUserId: req.auth!.userId, title: 'Invitation accepted', message: `${req.auth!.profile.full_name || req.auth!.email} accepted the ${req.auth!.role} invitation and created a password.` });
    await client.query('COMMIT');
    if (res.headersSent || res.writableEnded || res.destroyed) return res;
    return res.json({ message: 'Password created and invitation accepted.' });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to finish invitation acceptance. Retry with the password you chose.' });
  } finally { client.release(); }
});
router.post('/logout', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM otp_verified_sessions WHERE user_id = $1 AND session_id = $2', [req.auth!.userId, req.auth!.sessionId]);
  await pool.query('UPDATE otp_challenges SET consumed_at = now() WHERE user_id = $1 AND session_id = $2 AND consumed_at IS NULL', [req.auth!.userId, req.auth!.sessionId]);
  await pool.query("INSERT INTO audit_events(actor_user_id,action,entity_type) VALUES ($1,'auth.signed_out','session')", [req.auth!.userId]);
  return res.json({ message: 'Verification session ended.' });
});

export const registrationSchema = z.object({
  email: accountEmailSchema,
  password: z.string().min(10).max(128),
  fullName: z.string().trim().min(2).max(160),
  phone: phoneSchema,
  userType: z.enum(['Student', 'Lecturer', 'SPU Staff']),
  studentNumber: z.string().trim().max(40).optional(),
  staffNumber: z.string().trim().max(40).optional(),
  department: z.string().trim().max(120).optional(),
  program: z.string().trim().max(160).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  province: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  addressLatitude: z.number().finite().min(-90).max(90).optional(),
  addressLongitude: z.number().finite().min(-180).max(180).optional(),
  addressSource: z.enum(['manual', 'photon']).optional(),
}).strict().superRefine((value, context) => {
  refinePatientIdentity(value, context);
  const faculty = academicCatalogue.faculties.find((item) => item.code === value.department);
  if (value.userType === 'Student' && !value.department) {
    context.addIssue({ code: 'custom', path: ['department'], message: 'Select your faculty.' });
  } else if (value.department && !faculty) {
    context.addIssue({ code: 'custom', path: ['department'], message: 'Select a listed university faculty.' });
  }
  if (value.userType === 'Student' && !value.program) {
    context.addIssue({ code: 'custom', path: ['program'], message: 'Select your programme.' });
  } else if (value.program && (!faculty || !faculty.programmes.includes(value.program))) {
    context.addIssue({ code: 'custom', path: ['program'], message: 'Select a programme offered by your faculty.' });
  }
  if (value.userType === 'Student' && !value.addressLine1) {
    context.addIssue({ code: 'custom', path: ['addressLine1'], message: 'Enter your residential address.' });
  }
  const hasLatitude = value.addressLatitude !== undefined;
  const hasLongitude = value.addressLongitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    context.addIssue({ code: 'custom', path: [hasLatitude ? 'addressLongitude' : 'addressLatitude'], message: 'Provide both address coordinates together.' });
  }
  if ((hasLatitude || hasLongitude) && !value.addressLine1) {
    context.addIssue({ code: 'custom', path: ['addressLine1'], message: 'Coordinates must accompany a residential address.' });
  }
  if (value.addressSource === 'photon' && !(hasLatitude && hasLongitude)) {
    context.addIssue({ code: 'custom', path: ['addressSource'], message: 'A selected map address must include both coordinates.' });
  }
  if (value.addressSource === 'manual' && (hasLatitude || hasLongitude)) {
    context.addIssue({ code: 'custom', path: ['addressSource'], message: 'Manual address entry must not include coordinates from an earlier map selection.' });
  }
});

router.post('/register', async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check your registration details.', details: parsed.error.flatten() });
  const p = parsed.data;
  // Public registration always creates patients. Roles never come from client metadata.
  const registrationDetails = {
    department: p.department || null,
    program: p.program || null, address_line1: p.addressLine1 || null,
    address_line2: p.addressLine2 || null, city: p.city || null,
    province: p.province || null, postal_code: p.postalCode || null,
    address_latitude: p.addressLatitude ?? null,
    address_longitude: p.addressLongitude ?? null,
    address_source: p.addressLatitude !== undefined ? 'photon' : p.addressLine1 ? 'manual' : null,
  };
  const profile = {
    role: 'patient', email: p.email, full_name: p.fullName, phone: p.phone,
    user_type: p.userType, student_number: p.studentNumber || null,
    staff_number: p.staffNumber || null, ...registrationDetails,
  };
  const { data, error } = await authClient.auth.signUp({
    email: p.email, password: p.password,
    options: { emailRedirectTo: authCallbackUrl('signup'), data: profile },
  });
  if (error || !data.user) return res.status(422).json({ error: error?.message || 'Unable to create your account.' });
  // Supabase obscures existing accounts. Do not overwrite their profile/role.
  if (!data.user.identities?.length) return res.status(202).json({ confirmationRequired: true, message: 'Check your email to confirm your account, or sign in if you already registered.' });
  const { error: profileError } = await admin.from('profiles').upsert({ id: data.user.id, ...profile }, { onConflict: 'id', ignoreDuplicates: true });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return res.status(503).json({ error: 'Your account could not be saved. Please retry registration.' });
  }
  // Signup triggers can insert the profile before this upsert. Preserve role and
  // identity fields while saving the validated new account's registration details.
  const { error: detailsError } = await admin.from('profiles').update(registrationDetails).eq('id', data.user.id).eq('role', 'patient');
  if (detailsError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return res.status(503).json({ error: 'Your registration details could not be saved. Please retry registration.' });
  }
  const { error: claimsError } = await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { clinic_role: 'patient', clinic_phone: p.phone } });
  if (claimsError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return res.status(503).json({ error: 'Access setup failed. Please retry registration.' });
  }
  await pool.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES ($1,'patient.registered','profile',$1)", [data.user.id]);
  return res.status(201).json({ confirmationRequired: !data.session, message: data.session ? 'Account created. Sign in and enter your email verification code to continue.' : 'Check your email to confirm your account before signing in.' });
});

export default router;
