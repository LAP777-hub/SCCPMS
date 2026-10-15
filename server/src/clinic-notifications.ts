import type { Pool, PoolClient } from 'pg';

type Database = Pick<Pool | PoolClient, 'query'>;
/** Call inside the mutation transaction so notices and real-time invalidations
 * become visible only when the operation commits. */
export async function notifyClinicActivity(database: Database, activity: {
  targetUserId?: string | null; title: string; message: string; category?: 'system' | 'appointment';
}) {
  await database.query(`INSERT INTO notifications(user_id,title,message,category)
    SELECT recipient,$2,$3,$4 FROM (
      SELECT p.id AS recipient FROM profiles p LEFT JOIN account_status a ON a.user_id=p.id
      WHERE p.role IN ('admin','receptionist') AND COALESCE(a.active,true)
        AND a.deleted_at IS NULL AND a.deletion_requested_at IS NULL
      UNION SELECT $1::uuid WHERE $1::uuid IS NOT NULL
    ) recipients`, [activity.targetUserId ?? null, activity.title, activity.message, activity.category ?? 'system']);
}
