import { Router } from 'express';
import { allowRoles, requireAuth, requireOtp } from './auth.js';
import { pool } from './db.js';

const router = Router();
router.get(
  '/analytics',
  requireAuth,
  requireOtp,
  allowRoles('admin', 'receptionist'),
  async (_req, res) => {
    try {
      const result = await pool.query(`
      WITH clinic AS (SELECT timezone, (now() AT TIME ZONE timezone)::date AS today FROM clinic_settings WHERE id=true)
      SELECT
        (SELECT count(*)::int FROM profiles p LEFT JOIN account_status a ON a.user_id=p.id
          WHERE p.role IN ('patient','student','lecturer','staff') AND COALESCE(a.active,true)) AS patients,
        (SELECT count(*)::int FROM clinic_doctors d LEFT JOIN account_status a ON a.user_id=d.user_id
          WHERE d.active AND COALESCE(a.active,true)) AS doctors,
        (SELECT count(*)::int FROM profiles p LEFT JOIN account_status a ON a.user_id=p.id
          WHERE p.role IN ('doctor','receptionist') AND COALESCE(a.active,true)) AS staff,
        (SELECT count(*)::int FROM appointments a, clinic c
          WHERE (a.starts_at AT TIME ZONE c.timezone)::date=c.today AND a.status<>'cancelled') AS "appointmentsToday",
        (SELECT count(*)::int FROM appointments WHERE status='pending' AND ends_at>now()) AS "pendingAppointments",
        (SELECT count(*)::int FROM walk_ins WHERE status NOT IN ('completed','cancelled')) AS "activeWalkIns",
        (SELECT count(*)::int FROM patient_visits) AS "clinicalVisits",
        (SELECT count(*)::int FROM doctor_leave_requests WHERE status='pending') AS "pendingLeaveRequests",
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day::date, 'count', total) ORDER BY day), '[]'::jsonb)
          FROM (SELECT day, count(a.id)::int AS total FROM clinic c
            CROSS JOIN LATERAL generate_series(c.today-6,c.today,interval '1 day') day
            LEFT JOIN appointments a ON (a.starts_at AT TIME ZONE c.timezone)::date=day::date AND a.status<>'cancelled'
            GROUP BY day) activity) AS "dailyAppointments"`);
      return res.json({ data: result.rows[0] });
    } catch {
      return res.status(503).json({ error: 'Unable to calculate clinic analytics.' });
    }
  }
);
export default router;
