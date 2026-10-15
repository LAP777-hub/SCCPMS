import type { Pool } from 'pg';

export class ReportRangeError extends Error {}

export function reportRange(today: string, from?: string, to?: string) {
  const end = to ?? today;
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const first = from ?? start.toISOString().slice(0, 10);
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000 + 1;
  if (!Number.isFinite(days) || days < 1) throw new ReportRangeError('The report end date must be on or after the start date.');
  if (days > 366) throw new ReportRangeError('Choose a report period of at most 366 days.');
  return { from: first, to: end };
}

export async function operationsReport(database: Pick<Pool, 'query'>, input: { from?: string; to?: string }) {
  const settings = await database.query<{ timezone: string; today: string }>(
    `SELECT timezone,(now() AT TIME ZONE timezone)::date::text AS today FROM clinic_settings WHERE id=true`);
  const clinic = settings.rows[0];
  if (!clinic) throw new Error('Clinic settings unavailable');
  const range = reportRange(clinic.today, input.from, input.to);
  const result = await database.query(`WITH bounds AS (
      SELECT $1::date AS from_date,$2::date AS to_date,$3::text AS timezone
    ), selected AS MATERIALIZED (
      SELECT a.*,(a.starts_at AT TIME ZONE b.timezone)::date AS day FROM appointments a,bounds b
      WHERE a.starts_at >= (b.from_date::timestamp AT TIME ZONE b.timezone)
        AND a.starts_at < ((b.to_date+1)::timestamp AT TIME ZONE b.timezone)
    ), accounts AS (
      SELECT CASE WHEN p.role IN ('student','lecturer','staff') THEN 'patient' ELSE p.role END AS role,
        COALESCE(a.active,true) AND a.deleted_at IS NULL AND a.deletion_requested_at IS NULL AS active,
        a.deleted_at IS NOT NULL AS deleted
      FROM profiles p LEFT JOIN account_status a ON a.user_id=p.id
    ), daily AS (
      SELECT day::date::text AS date,COALESCE(s.appointments,0) AS appointments,
        COALESCE(s.completed,0) AS completed,COALESCE(s.cancelled,0) AS cancelled,
        COALESCE(s.no_show,0) AS no_show,COALESCE(w.total,0) AS walk_ins
      FROM bounds b CROSS JOIN LATERAL generate_series(b.from_date,b.to_date,interval '1 day') day
      LEFT JOIN (SELECT day AS booked_day,count(*)::int AS appointments,
        count(*) FILTER(WHERE status='completed')::int AS completed,
        count(*) FILTER(WHERE status='cancelled')::int AS cancelled,
        count(*) FILTER(WHERE status='no_show')::int AS no_show FROM selected GROUP BY day) s ON s.booked_day=day::date
      LEFT JOIN (SELECT (w.arrived_at AT TIME ZONE c.timezone)::date AS arrival_day,count(*)::int AS total
        FROM walk_ins w,bounds c WHERE w.arrived_at >= (c.from_date::timestamp AT TIME ZONE c.timezone)
          AND w.arrived_at < ((c.to_date+1)::timestamp AT TIME ZONE c.timezone) GROUP BY 1) w ON w.arrival_day=day::date
    ) SELECT $1::text AS "from",$2::text AS "to",$3::text AS timezone,
      count(*)::int AS appointments,
      count(*) FILTER(WHERE status='completed')::int AS completed,
      count(*) FILTER(WHERE status='cancelled')::int AS cancelled,
      count(*) FILTER(WHERE status='no_show')::int AS no_show,
      count(*) FILTER(WHERE status='pending')::int AS pending,
      count(*) FILTER(WHERE status='confirmed')::int AS confirmed,
      count(*) FILTER(WHERE status='in_progress')::int AS in_progress,
      count(DISTINCT patient_user_id) FILTER(WHERE status='completed')::int AS patients_seen,
      (SELECT count(*)::int FROM clinic_doctors d LEFT JOIN account_status a ON a.user_id=d.user_id
        WHERE d.active AND COALESCE(a.active,true) AND a.deleted_at IS NULL AND a.deletion_requested_at IS NULL) AS active_doctors,
      (SELECT count(*)::int FROM doctor_leave_requests WHERE status='pending') AS pending_leave,
      (SELECT count(*)::int FROM walk_ins w,bounds b WHERE (w.arrived_at AT TIME ZONE b.timezone)::date BETWEEN b.from_date AND b.to_date) AS walk_ins,
      (SELECT count(*)::int FROM patient_visits v,bounds b WHERE (v.visit_date AT TIME ZONE b.timezone)::date BETWEEN b.from_date AND b.to_date) AS clinical_visits,
      (SELECT count(*)::int FROM prescriptions p,bounds b WHERE (p.created_at AT TIME ZONE b.timezone)::date BETWEEN b.from_date AND b.to_date) AS prescriptions,
      (SELECT count(*)::int FROM lab_orders l,bounds b WHERE (l.created_at AT TIME ZONE b.timezone)::date BETWEEN b.from_date AND b.to_date) AS lab_orders,
      (SELECT jsonb_agg(to_jsonb(daily) ORDER BY date) FROM daily) AS daily_activity,
      (SELECT COALESCE(jsonb_agg(to_jsonb(workload) ORDER BY appointments DESC,doctor_name),'[]'::jsonb) FROM (
        SELECT d.id AS doctor_id,d.full_name AS doctor_name,count(*)::int AS appointments,
          count(*) FILTER(WHERE s.status='completed')::int AS completed,
          count(*) FILTER(WHERE s.status='cancelled')::int AS cancelled,
          count(*) FILTER(WHERE s.status='no_show')::int AS no_show
        FROM selected s JOIN clinic_doctors d ON d.id=s.doctor_id GROUP BY d.id,d.full_name
      ) workload) AS doctor_activity,
      (SELECT jsonb_build_object('admin',count(*) FILTER(WHERE active AND role='admin'),
        'doctor',count(*) FILTER(WHERE active AND role='doctor'),'receptionist',count(*) FILTER(WHERE active AND role='receptionist'),
        'patient',count(*) FILTER(WHERE active AND role='patient'),'inactive',count(*) FILTER(WHERE NOT active AND NOT deleted),
        'deleted',count(*) FILTER(WHERE deleted)) FROM accounts) AS account_counts,
      (SELECT COALESCE(jsonb_agg(to_jsonb(activity) ORDER BY action),'[]'::jsonb) FROM (
        SELECT action,count(*)::int AS count FROM audit_events e,bounds b
        WHERE (e.created_at AT TIME ZONE b.timezone)::date BETWEEN b.from_date AND b.to_date
          AND e.entity_type='profile' AND e.action ~ '\\.(invited|invitation_accepted|activated|reactivated|deactivated|deleted|reinvited)$'
        GROUP BY action
      ) activity) AS account_activity FROM selected`, [range.from, range.to, clinic.timezone]);
  return result.rows[0];
}
