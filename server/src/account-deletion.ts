import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool, PoolClient } from 'pg';
import { notifyClinicActivity } from './clinic-notifications.js';

const patientRoles = ['patient', 'student', 'lecturer', 'staff'];
type AccountState = {
  active: boolean;
  deletion_requested_at: Date | null;
  deleted_at: Date | null;
};

export class PatientDeletionError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'PatientDeletionError';
  }
}

function missingAuthUser(error: { status?: number; code?: string } | null) {
  return error?.status === 404 || error?.code === 'user_not_found';
}

/** Only the admin route calls this function. No clinic identity or history is deleted. */
export async function deletePatientLoginAccount(
  database: Pool,
  provider: SupabaseClient,
  userId: string,
  actorUserId: string,
  family: 'patient' | 'staff' = 'patient'
) {
  const roles = family === 'staff' ? ['doctor', 'receptionist'] : patientRoles;
  if (userId === actorUserId) {
    throw new PatientDeletionError(422, 'You cannot delete your own account.');
  }

  const { data: profile, error: profileError } = await provider
    .from('profiles').select('id,role,full_name').eq('id', userId).maybeSingle();
  if (profileError) throw new PatientDeletionError(503, 'Unable to verify this patient account.');
  if (!profile || !roles.includes(profile.role)) {
    throw new PatientDeletionError(404, 'Patient account not found.');
  }

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO account_status (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );
    const state = await client.query<AccountState>(
      'SELECT active,deletion_requested_at,deleted_at FROM account_status WHERE user_id=$1 FOR UPDATE',
      [userId]
    );
    const account = state.rows[0];
    if (!account) throw new Error('Missing account status');
    if (account.deleted_at) {
      await client.query('COMMIT');
      return { id: userId, active: false, deleted_at: account.deleted_at };
    }
    if (account.active !== false) {
      throw new PatientDeletionError(409, 'Deactivate this patient account before deleting it.');
    }

    if (!account.deletion_requested_at) {
      const { data, error } = await provider.auth.admin.getUserById(userId);
      if (error || !data.user) {
        throw new PatientDeletionError(503, 'Unable to verify this patient login account.');
      }
      if (!roles.includes(data.user.app_metadata.clinic_role ?? profile.role)) {
        throw new PatientDeletionError(404, 'Patient account not found.');
      }
      if (family === 'staff' && data.user.app_metadata.clinic_role !== profile.role) throw new PatientDeletionError(409, 'Account role is inconsistent. Correct the staff role before deleting it.');

      const appointments = await client.query(
        family === 'staff' ? `SELECT 1 FROM appointments a JOIN clinic_doctors d ON d.id=a.doctor_id WHERE d.user_id=$1 AND
         (a.status='in_progress' OR (a.status IN ('pending','confirmed') AND a.ends_at>now())) LIMIT 1`
          : `SELECT 1 FROM appointments WHERE patient_user_id=$1 AND
         (status='in_progress' OR (status IN ('pending','confirmed') AND ends_at>now())) LIMIT 1`,
        [userId]
      );
      const walkIns = await client.query(
        family === 'staff' ? `SELECT 1 FROM walk_ins w JOIN clinic_doctors d ON d.id=w.assigned_doctor_id WHERE d.user_id=$1 AND w.status NOT IN ('completed','cancelled') LIMIT 1`
          : `SELECT 1 FROM walk_ins WHERE patient_user_id=$1 AND status NOT IN ('completed','cancelled') LIMIT 1`,
        [userId]
      );
      if (appointments.rowCount || walkIns.rowCount) {
        throw new PatientDeletionError(409, 'Complete, cancel or reschedule active appointments and walk-ins before deleting this patient account.');
      }

      await client.query(
        `UPDATE account_status SET deletion_requested_at=now(),deleted_by=$2,active=false,updated_at=now()
         WHERE user_id=$1`,
        [userId, actorUserId]
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id)
         VALUES ($1,'${family === 'staff' ? profile.role : 'patient'}.deletion_requested','profile',$2)`,
        [actorUserId, userId]
      );
      await client.query('DELETE FROM otp_verified_sessions WHERE user_id=$1', [userId]);
      await client.query(
        'UPDATE otp_challenges SET consumed_at=COALESCE(consumed_at,now()) WHERE user_id=$1',
        [userId]
      );
    }
    // This reservation survives provider failures and blocks every reactivation.
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const pending = () => new PatientDeletionError(
    503,
    'Patient deletion is pending. Login access remains disabled. Retry Delete account to finish removing the login account.',
    'PATIENT_DELETION_PENDING'
  );
  try {
    // A hard Auth deletion would cascade profiles on the hosted schema. Soft
    // deletion irreversibly removes credentials while retaining the FK identity.
    const { error } = await provider.auth.admin.deleteUser(userId, true);
    if (error && !missingAuthUser(error)) throw error;
  } catch {
    throw pending();
  }

  let finalClient: PoolClient | undefined;
  try {
    finalClient = await database.connect();
    await finalClient.query('BEGIN');
    const state = await finalClient.query<AccountState>(
      'SELECT active,deletion_requested_at,deleted_at FROM account_status WHERE user_id=$1 FOR UPDATE',
      [userId]
    );
    const account = state.rows[0];
    if (!account || account.active !== false || !account.deletion_requested_at) throw pending();
    if (account.deleted_at) {
      await finalClient.query('COMMIT');
      return { id: userId, active: false, deleted_at: account.deleted_at };
    }
    await finalClient.query(
      `UPDATE profiles SET deleted_email=COALESCE(deleted_email,email),email=$2,updated_at=now()
       WHERE id=$1`,
      [userId, `deleted+${userId}@accounts.invalid`]
    );
    const deleted = await finalClient.query<{ deleted_at: Date }>(
      'UPDATE account_status SET deleted_at=now(),updated_at=now() WHERE user_id=$1 RETURNING deleted_at',
      [userId]
    );
    await finalClient.query(
      `INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id)
       VALUES ($1,'${family === 'staff' ? profile.role : 'patient'}.deleted','profile',$2)`,
      [actorUserId, userId]
    );
    if (family === 'staff') await finalClient.query('UPDATE clinic_doctors SET active=false,updated_at=now() WHERE user_id=$1', [userId]);
    await notifyClinicActivity(finalClient, { targetUserId: userId, title: 'Account deleted', message: `${profile.full_name || `Account ${userId}`} (${family === 'staff' ? profile.role : 'patient'}) had their deactivated login deleted. Contact details and clinic history are retained in Records.` });
    await finalClient.query('COMMIT');
    return { id: userId, active: false, deleted_at: deleted.rows[0].deleted_at };
  } catch {
    await finalClient?.query('ROLLBACK').catch(() => undefined);
    throw pending();
  } finally {
    finalClient?.release();
  }
}
