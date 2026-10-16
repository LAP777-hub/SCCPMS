import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { pool } from '../src/db.js';
import { adminOverview } from '../src/admin-overview.js';

test('admin overview uses actual isolated SQL for zero states, active demographics, clinic dates and retained medical history', { skip: process.env.RUN_DATABASE_TESTS !== '1' }, async () => {
  const schema = `clinic_overview_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^clinic_overview_test_[a-f0-9]{32}$/);
  const control = await pool.connect();
  const db = new pg.Pool({ ...pool.options, options: `-c search_path=${schema},public`, max: 1 });
  let created = false;
  try {
    await control.query(`CREATE SCHEMA "${schema}"`); created = true;
    assert.equal((await db.query('SELECT current_schema() AS name')).rows[0].name, schema);
    await db.query(`CREATE TABLE clinic_settings(id boolean PRIMARY KEY,timezone text NOT NULL);
      INSERT INTO clinic_settings VALUES(true,'Pacific/Kiritimati');
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text,user_type text,full_name text,created_at timestamptz DEFAULT now());
      CREATE TABLE account_status(user_id uuid PRIMARY KEY,active boolean,deleted_at timestamptz,deletion_requested_at timestamptz);
      CREATE TABLE clinic_doctors(id uuid PRIMARY KEY,user_id uuid,full_name text,active boolean,created_at timestamptz DEFAULT now());
      CREATE TABLE appointments(id uuid PRIMARY KEY,patient_user_id uuid,doctor_id uuid,starts_at timestamptz,ends_at timestamptz,status text,consultation_type text,created_at timestamptz DEFAULT now());
      CREATE TABLE patient_visits(id uuid PRIMARY KEY,patient_user_id uuid,created_at timestamptz DEFAULT now());`);
    await db.query(`INSERT INTO profiles(id,role,full_name) VALUES($1,'admin','Fixture admin')`, [randomUUID()]);
    const empty = await adminOverview(db);
    assert.deepEqual(empty.totals, { patients: 0, doctors: 0, appointments: 0, medicalRecords: 0 });
    assert.equal(empty.weeklyAppointments.length, 7);
    assert.deepEqual(empty.weeklyAppointments.map((day: any) => day.day), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.ok(empty.weeklyAppointments.every((day: any) => day.count === 0));
    for (const series of Object.values(empty.trends) as any[][]) { assert.equal(series.length, 7); assert.ok(series.every(point => point.value === 0)); }
    assert.equal(empty.demographics.reduce((sum: number, group: any) => sum + group.count, 0), 0);
    assert.deepEqual(empty.recentAppointments, []); assert.deepEqual(empty.todayTimeline, []);
    assert.equal(empty.finances.available, false); assert.equal(empty.finances.net, 0);

    const ids = Array.from({ length: 10 }, () => randomUUID());
    const roles = ['student', 'staff', 'lecturer', 'patient', 'patient', 'patient', 'patient', 'doctor'];
    const kinds = [null, null, null, null, 'Student', 'Lecturer', 'SPU Staff', null];
    for (let i = 0; i < roles.length; i++) await db.query(`INSERT INTO profiles(id,role,user_type,full_name,created_at)
      VALUES($1,$2,$3,$4,(((now() AT TIME ZONE 'Pacific/Kiritimati')::date)::timestamp + interval '10 minutes') AT TIME ZONE 'Pacific/Kiritimati')`, [ids[i], roles[i], kinds[i], `Fixture ${i}`]);
    // Exclude a suspended, deleted and deletion-pending patient respectively.
    await db.query(`INSERT INTO account_status(user_id,active,deleted_at,deletion_requested_at) VALUES
      ($1,false,NULL,NULL),($2,false,now(),NULL),($3,true,NULL,now())`, [ids[4], ids[5], ids[6]]);
    const doctorId = randomUUID();
    await db.query(`INSERT INTO clinic_doctors(id,user_id,full_name,active) VALUES($1,$2,'Fixture doctor',true),($3,$4,'Inactive doctor',false)`, [doctorId, ids[7], randomUUID(), ids[8]]);
    for (const [shift, status] of [[0, 'pending'], [0, 'cancelled'], [0, 'confirmed'], [-7, 'completed'], [7, 'pending']] as const) {
      // Week shifts use Monday; today's three bookings use the real clinic date.
      await db.query(`INSERT INTO appointments(id,patient_user_id,doctor_id,starts_at,ends_at,status,consultation_type)
        SELECT $1,$2,$3,(day::timestamp+interval '9 hours') AT TIME ZONE c.timezone,
          (day::timestamp+interval '9 hours 30 minutes') AT TIME ZONE c.timezone,$4,'Fixture consultation'
        FROM clinic_settings c CROSS JOIN LATERAL (SELECT CASE WHEN $5::int=0 THEN (now() AT TIME ZONE c.timezone)::date
          ELSE date_trunc('week',now() AT TIME ZONE c.timezone)::date+$5::int END AS day) selected`, [randomUUID(), ids[0], doctorId, status, shift]);
    }
    await db.query(`INSERT INTO patient_visits(id,patient_user_id) VALUES($1,$2),($3,$4)`, [randomUUID(), ids[0], randomUUID(), ids[5]]);
    const full = await adminOverview(db);
    assert.deepEqual(full.totals, { patients: 4, doctors: 1, appointments: 5, medicalRecords: 2 });
    assert.deepEqual(full.demographics.map((group: any) => [group.category, group.count]), [['Students', 1], ['Employees', 1], ['Faculty', 1], ['Others', 1]]);
    assert.equal(full.weeklyAppointments.reduce((sum: number, day: any) => sum + day.count, 0), 3);
    assert.equal(full.todayTimeline.length, 2); assert.ok(full.todayTimeline.every((item: any) => item.status !== 'cancelled'));
    assert.equal(full.recentAppointments.length, 5);
    assert.equal(full.trends.patients.at(-1).value, 4, '00:10 clinic-local registration is on the clinic date, even on a different UTC date');
    assert.equal(full.trends.appointments.at(-1).value, 5);
    assert.equal(full.trends.medicalRecords.at(-1).value, 2);
    assert.equal(full.timezone, 'Pacific/Kiritimati');
  } finally {
    await db.end();
    if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
    control.release(); await pool.end();
  }
});
