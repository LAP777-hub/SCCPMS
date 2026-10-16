import { Router } from 'express';
import { RECEPTION_DEPARTMENT } from './staff-policy.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { allowRoles } from './auth.js';
import { config } from './config.js';
import { pool } from './db.js';
import { authCallbackUrl } from './auth-callback.js';
import { normalizeEmailAddress } from './email-address.js';
import { notifyClinicActivity } from './clinic-notifications.js';

const router = Router();
router.use('/account-records', allowRoles('admin'));
const provider = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

router.get('/account-records', async (req, res) => {
  const filters = z.object({ q: z.string().trim().max(160).default(''), role: z.enum(['all','doctor','receptionist','patient']).default('all'), limit: z.coerce.number().int().min(1).max(500).default(250) }).safeParse(req.query);
  if (!filters.success) return res.status(400).json({ error: 'Invalid account record filters.' });
  try {
    const result = await pool.query(`SELECT p.id,p.full_name,COALESCE(p.deleted_email,p.email) AS email,p.phone,p.role,
      p.department,p.program,p.student_number,p.staff_number,a.deleted_at,a.deleted_by,r.new_user_id AS reinvited_user_id,r.invited_at AS reinvited_at
      FROM profiles p JOIN account_status a ON a.user_id=p.id
      LEFT JOIN account_reinvitations r ON r.old_user_id=p.id WHERE a.deleted_at IS NOT NULL
      AND p.role IN ('patient','student','lecturer','staff','doctor','receptionist')
      AND ($2='all' OR p.role=$2 OR ($2='patient' AND p.role IN ('student','lecturer','staff')))
      AND ($1='' OR concat_ws(' ',p.id::text,p.full_name,p.deleted_email,p.phone,p.student_number,p.staff_number) ILIKE '%' || $1 || '%')
      ORDER BY a.deleted_at DESC,p.id LIMIT $3`, [filters.data.q,filters.data.role,filters.data.limit]);
    return res.json({ data: result.rows, limit: filters.data.limit });
  } catch { return res.status(503).json({ error: 'Unable to load deleted account records.' }); }
});

router.post('/account-records/:id/reinvite', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success || Object.keys(req.body ?? {}).length) return res.status(400).json({ error: 'Choose a valid deleted account. Contact details and role come from its retained record.' });
  const client = await pool.connect();
  let createdId: string | undefined;
  try {
    await client.query('BEGIN');
    const record = await client.query(`SELECT p.*,a.deleted_at FROM profiles p JOIN account_status a ON a.user_id=p.id WHERE p.id=$1 FOR UPDATE OF a`, [id.data]);
    const profile = record.rows[0];
    if (!profile?.deleted_at || !['patient','student','lecturer','staff','doctor','receptionist'].includes(profile.role)) {
      await client.query('ROLLBACK'); return res.status(404).json({ error: 'Deleted account record not found.' });
    }
    const existing = await client.query('SELECT new_user_id FROM account_reinvitations WHERE old_user_id=$1', [id.data]);
    if (existing.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This record already has a replacement account. Manage that account in its directory.', code: 'ACCOUNT_ALREADY_REINVITED' }); }
    const email = normalizeEmailAddress(profile.deleted_email);
    if (!email) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'The original email address is unavailable. Contact this person before creating another account.' }); }
    const role = ['student','lecturer','staff'].includes(profile.role) ? 'patient' : profile.role;
    let specialty: string | undefined;
    if (role === 'doctor') {
      const directory = await client.query('SELECT specialty FROM clinic_doctors WHERE user_id=$1', [id.data]);
      const name = z.string().trim().min(2).max(160).safeParse(profile.full_name);
      const retainedSpecialty = z.string().trim().min(2).max(160).safeParse(directory.rows[0]?.specialty);
      if (!name.success || !retainedSpecialty.success) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'The retained doctor name and specialty must be available before this account can be reinvited.' });
      }
      specialty = retainedSpecialty.data;
    }
    // An invitation can reuse an existing unconfirmed identity. Create first:
    // only this atomic operation proves ownership of the cleanup candidate.
    const created = await provider.auth.admin.createUser({
      email, email_confirm: false,
      app_metadata: { clinic_role: role, clinic_phone: profile.phone },
      user_metadata: { full_name: profile.full_name, phone: profile.phone },
    });
    if (created.error) {
      await client.query('ROLLBACK');
      if (['email_exists','user_already_exists'].includes(created.error.code ?? '')) {
        return res.status(409).json({ error: 'This email already has an account. Manage that account in its directory.', code: 'ACCOUNT_EMAIL_IN_USE' });
      }
      return res.status(503).json({ error: 'Unable to create a new invitation account. Check the account service and try again.' });
    }
    const newId = z.string().uuid().safeParse(created.data.user?.id);
    if (!newId.success || newId.data === id.data) throw new Error('Unexpected new account identity');
    createdId = newId.data;
    await client.query(`INSERT INTO profiles(id,email,role,full_name,phone,user_type,student_number,staff_number,department,program)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,role=EXCLUDED.role,full_name=EXCLUDED.full_name,phone=EXCLUDED.phone,
      user_type=EXCLUDED.user_type,student_number=EXCLUDED.student_number,staff_number=EXCLUDED.staff_number,department=EXCLUDED.department,program=EXCLUDED.program`,
      [createdId,email,role,profile.full_name,profile.phone,profile.user_type,profile.student_number,profile.staff_number,role === 'receptionist' ? RECEPTION_DEPARTMENT : profile.department,profile.program]);
    if (role === 'doctor') {
      await client.query('INSERT INTO clinic_doctors(user_id,full_name,specialty,department,active) VALUES($1,$2,$3,$4,true)', [createdId,profile.full_name,specialty,profile.department]);
    }
    await client.query('INSERT INTO account_invitations(user_id,invited_by,role) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING', [createdId,req.auth!.userId,role]);
    await client.query('INSERT INTO account_reinvitations(old_user_id,new_user_id,invited_by) VALUES($1,$2,$3)', [id.data,createdId,req.auth!.userId]);
    await client.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'profile',$3)`, [req.auth!.userId,`${role}.reinvited`,createdId]);
    await notifyClinicActivity(client, { title: 'Deleted account reinvited', message: `${profile.full_name || email} was invited back as ${role}. A new login is created; historical records remain with the deleted identity.` });
    const invited = await provider.auth.admin.inviteUserByEmail(email, { data: { full_name: profile.full_name, phone: profile.phone }, redirectTo: authCallbackUrl('invite') });
    if (invited.error || invited.data.user?.id !== createdId) throw new Error('Invitation was not acknowledged for the created identity');
    await client.query('COMMIT');
    if (res.headersSent || res.writableEnded || res.destroyed) return res;
    return res.status(201).json({ data: { id: createdId, email, role, invitationSent: true, previousUserId: id.data } });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    if (createdId) await provider.auth.admin.deleteUser(createdId).catch(() => undefined);
    return res.status(503).json({ error: 'Unable to finish this invitation. The retained account record has not been changed.' });
  } finally { client.release(); }
});
export default router;
