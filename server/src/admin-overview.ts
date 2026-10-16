import type { Pool } from 'pg';

// One statement gives all panels the same database snapshot and clinic date.
// Medical records count encounters, rather than counting their prescriptions
// and laboratory orders again. Historical care remains after account deletion.
export async function adminOverview(database: Pick<Pool, 'query'>) {
  const result = await database.query(`WITH clinic AS (
    SELECT timezone,(now() AT TIME ZONE timezone)::date AS today FROM clinic_settings WHERE id=true
  ), patients AS MATERIALIZED (
    SELECT p.*,CASE
      WHEN p.role='student' THEN 'Students'
      WHEN p.role='lecturer' THEN 'Faculty'
      WHEN p.role='staff' THEN 'Employees'
      WHEN p.user_type='Student' THEN 'Students'
      WHEN p.user_type='Lecturer' THEN 'Faculty'
      WHEN p.user_type='SPU Staff' THEN 'Employees'
      ELSE 'Others' END AS category
    FROM profiles p LEFT JOIN account_status s ON s.user_id=p.id
    WHERE p.role IN ('patient','student','lecturer','staff') AND COALESCE(s.active,true)
      AND s.deleted_at IS NULL AND s.deletion_requested_at IS NULL
  ), doctors AS MATERIALIZED (
    SELECT d.* FROM clinic_doctors d LEFT JOIN account_status s ON s.user_id=d.user_id
    WHERE d.active AND COALESCE(s.active,true) AND s.deleted_at IS NULL AND s.deletion_requested_at IS NULL
  ), days AS (
    SELECT c.today-i AS date,c.timezone FROM clinic c CROSS JOIN generate_series(0,6) i
  ), trends AS (
    SELECT d.date,
      (SELECT count(*)::int FROM patients p WHERE p.created_at >= (d.date::timestamp AT TIME ZONE d.timezone)
        AND p.created_at < ((d.date+1)::timestamp AT TIME ZONE d.timezone)) AS patients,
      (SELECT count(*)::int FROM doctors p WHERE p.created_at >= (d.date::timestamp AT TIME ZONE d.timezone)
        AND p.created_at < ((d.date+1)::timestamp AT TIME ZONE d.timezone)) AS doctors,
      (SELECT count(*)::int FROM appointments a WHERE a.created_at >= (d.date::timestamp AT TIME ZONE d.timezone)
        AND a.created_at < ((d.date+1)::timestamp AT TIME ZONE d.timezone)) AS appointments,
      (SELECT count(*)::int FROM patient_visits v WHERE v.created_at >= (d.date::timestamp AT TIME ZONE d.timezone)
        AND v.created_at < ((d.date+1)::timestamp AT TIME ZONE d.timezone)) AS records
    FROM days d
  ), week AS (
    SELECT date_trunc('week',c.today)::date+i AS date,c.timezone
    FROM clinic c CROSS JOIN generate_series(0,6) i
  ), appointment_details AS (
    SELECT a.id,a.created_at,a.starts_at,a.ends_at,a.status,a.consultation_type,
      COALESCE(NULLIF(p.full_name,''),'Patient record') AS patient_name,
      COALESCE(NULLIF(d.full_name,''),'Doctor record') AS doctor_name
    FROM appointments a LEFT JOIN profiles p ON p.id=a.patient_user_id
      LEFT JOIN clinic_doctors d ON d.id=a.doctor_id
  ) SELECT c.timezone,now() AS "generatedAt",
    jsonb_build_object('patients',(SELECT count(*)::int FROM patients),
      'doctors',(SELECT count(*)::int FROM doctors),'appointments',(SELECT count(*)::int FROM appointments),
      'medicalRecords',(SELECT count(*)::int FROM patient_visits)) AS totals,
    jsonb_build_object(
      'patients',(SELECT jsonb_agg(jsonb_build_object('date',date::text,'label',to_char(date,'Dy'),'value',patients) ORDER BY date) FROM trends),
      'doctors',(SELECT jsonb_agg(jsonb_build_object('date',date::text,'label',to_char(date,'Dy'),'value',doctors) ORDER BY date) FROM trends),
      'appointments',(SELECT jsonb_agg(jsonb_build_object('date',date::text,'label',to_char(date,'Dy'),'value',appointments) ORDER BY date) FROM trends),
      'medicalRecords',(SELECT jsonb_agg(jsonb_build_object('date',date::text,'label',to_char(date,'Dy'),'value',records) ORDER BY date) FROM trends)
    ) AS trends,
    (SELECT jsonb_agg(jsonb_build_object('date',w.date::text,'day',to_char(w.date,'Dy'),'count',
      (SELECT count(*)::int FROM appointments a WHERE a.starts_at >= (w.date::timestamp AT TIME ZONE w.timezone)
        AND a.starts_at < ((w.date+1)::timestamp AT TIME ZONE w.timezone))) ORDER BY w.date) FROM week w) AS "weeklyAppointments",
    (SELECT jsonb_agg(jsonb_build_object('category',label,'count',(SELECT count(*)::int FROM patients p WHERE p.category=label)) ORDER BY ordinal)
      FROM (VALUES ('Students',1),('Employees',2),('Faculty',3),('Others',4)) categories(label,ordinal)) AS demographics,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'startsAt',a.starts_at,'endsAt',a.ends_at,
      'status',a.status,'consultationType',a.consultation_type,'patientName',a.patient_name,'doctorName',a.doctor_name)
      ORDER BY a.created_at DESC,a.id),'[]'::jsonb)
      FROM (SELECT * FROM appointment_details ORDER BY created_at DESC,id LIMIT 5) a) AS "recentAppointments",
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'startsAt',a.starts_at,'endsAt',a.ends_at,
      'status',a.status,'consultationType',a.consultation_type,'patientName',a.patient_name,'doctorName',a.doctor_name)
      ORDER BY a.starts_at,a.id),'[]'::jsonb)
      FROM (SELECT a.* FROM appointment_details a WHERE a.starts_at >= (c.today::timestamp AT TIME ZONE c.timezone)
        AND a.starts_at < ((c.today+1)::timestamp AT TIME ZONE c.timezone)
        AND a.status NOT IN ('cancelled','no_show') ORDER BY a.starts_at,a.id LIMIT 8) a) AS "todayTimeline",
    jsonb_build_object('available',false,'currency','ZAR','income',0,'expenses',0,'net',0,'series','[]'::jsonb) AS finances
    FROM clinic c`);
  if (!result.rows[0]) throw new Error('Clinic settings unavailable');
  return result.rows[0];
}
