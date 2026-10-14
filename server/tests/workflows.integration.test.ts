import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mock, test } from 'node:test';
import pg from 'pg';
import type { Request, Response, Router } from 'express';
import { pool } from '../src/db.js';
import api from '../src/api.routes.js';
import scheduling from '../src/scheduling.routes.js';
import clinical from '../src/clinical.routes.js';
import analytics from '../src/analytics.routes.js';
import otp from '../src/otp.routes.js';
import auth from '../src/auth.routes.js';
import { config } from '../src/config.js';
import { otpCodeHash, otpEmailHash } from '../src/otp-security.js';

type Role = 'admin' | 'doctor' | 'patient' | 'receptionist';
async function call(
  router: Router,
  method: string,
  path: string,
  role: Role,
  userId: string,
  body: unknown = {},
  params: Record<string, string> = {},
  query: Record<string, string> = {},
  sessionId = randomUUID(),
  phone = '+27123456789',
  email = 'patient@spu.ac.za',
) {
  const layer = router.stack.find(
    (item: any) => item.route?.path === path && item.route?.methods[method]
  );
  assert.ok(layer, `${method} ${path} exists`);
  const handler = layer.route.stack.at(-1).handle;
  const result = { status: 200, body: undefined as any };
  const res = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json(value: unknown) {
      result.body = value;
      return res;
    },
  };
  await handler(
    { auth: { role, userId, sessionId, phone, email }, body, params, query } as unknown as Request,
    res as unknown as Response,
    () => {}
  );
  return result;
}

test(
  'database workflows persist changes and enforce scheduling and clinician ownership',
  { skip: process.env.RUN_DATABASE_TESTS !== '1' },
  async () => {
    // Every write is confined to a newly created, uniquely named schema.
    const schema = `clinic_workflow_test_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^clinic_workflow_test_[a-f0-9]{32}$/);
    const realConnect = pool.connect.bind(pool);
    const db = await realConnect();
    const other = await realConnect();
    const cleanup = new pg.Pool({ ...pool.options, max: 1 });
    let created = false;
    let connectionFailure: Error | undefined;
    const captureConnectionFailure = (error: Error) => { connectionFailure ??= error; };
    db.on('error', captureConnectionFailure);
    other.on('error', captureConnectionFailure);
    const rawDbQuery = db.query.bind(db),
      rawOtherQuery = other.query.bind(other);
    const setLocal = `SET LOCAL search_path TO "${schema}", public`;
    let isolatedAuthAuditReads = 0;
    const isolatedProviderSql = (sql: string) => sql.replace(/\bauth\.audit_log_entries\b/g, () => {
      isolatedAuthAuditReads += 1;
      return `"${schema}"."auth_audit_log_entries"`;
    });
    const routeQuery = async (sql: string, parameters?: unknown[]) => {
      const result = await rawDbQuery(isolatedProviderSql(sql), parameters);
      if (sql.trim().toUpperCase() === 'BEGIN') await rawDbQuery(setLocal);
      return result;
    };
    const dbQuery = async (sql: string, parameters?: unknown[]) => {
      await rawDbQuery('BEGIN');
      await rawDbQuery(setLocal);
      try {
        const result = await rawDbQuery(isolatedProviderSql(sql), parameters);
        await rawDbQuery('COMMIT');
        return result;
      } catch (error) {
        await rawDbQuery('ROLLBACK');
        throw error;
      }
    };
    const adminId = randomUUID(),
      doctorUser = randomUUID(),
      otherDoctorUser = randomUUID(),
      patientId = randomUUID(),
      secondPatient = randomUUID();
    const doctorId = randomUUID(),
      otherDoctorId = randomUUID();
    const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    const startsAt = `${day}T07:00:00.000Z`,
      endsAt = `${day}T07:30:00.000Z`;
    const nextStarts = `${day}T08:00:00.000Z`,
      nextEnds = `${day}T08:30:00.000Z`;
    try {
      await rawDbQuery(`CREATE SCHEMA "${schema}"`);
      created = true;
      await rawDbQuery('BEGIN');
      await rawDbQuery(setLocal);
      for (const file of [
        '001_initial.sql',
        '002_notifications_audit.sql',
        '003_clinic_workflows.sql',
        '004_profiles_table.sql',
        '005_account_status.sql',
        '006_workflow_integrity.sql',
        '009_walkin_consultation.sql',
        '010_active_schedule_integrity.sql',
        '012_clinical_record_revisions.sql',
        '013_request_audit_logs.sql',
        '014_otp_phone_binding.sql',
        '015_otp_email_binding.sql',
        '016_manual_logout_sessions.sql',
        '019_patient_account_deletion.sql',
        '022_otp_delivery_timing.sql',
        '023_otp_sender_binding.sql',
      ]) {
        await rawDbQuery(await readFile(new URL(`../sql/${file}`, import.meta.url), 'utf8'));
      }
      // Plain PostgreSQL in CI has no hosted Auth schema. Keep the Auth audit
      // UNION real SQL while routing it to fixture rows in this private schema.
      await rawDbQuery(`CREATE TABLE auth_audit_log_entries (
        id uuid PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL
      )`);
      await rawDbQuery(
        'INSERT INTO clinic_doctors (id,user_id,full_name,specialty) VALUES ($1,$2,$3,$4),($5,$6,$7,$4)',
        [
          doctorId,
          doctorUser,
          'Fixture Doctor',
          'Primary care',
          otherDoctorId,
          otherDoctorUser,
          'Second Fixture Doctor',
        ]
      );
      await rawDbQuery('COMMIT');
      mock.method(pool, 'connect', async () => ({ query: routeQuery, release() {} }));
      mock.method(pool, 'query', dbQuery);
      // Only the administrator exists: clinical/user analytics are empty.
      await dbQuery("INSERT INTO profiles(id,email,role) VALUES ($1,'admin@example.invalid','admin')",[adminId]);
      const emptyAnalytics = await call(analytics,'get','/analytics','admin',adminId);
      assert.equal(emptyAnalytics.status,200,JSON.stringify(emptyAnalytics.body));
      assert.equal(emptyAnalytics.body.data.patients,0);
      assert.equal(emptyAnalytics.body.data.staff,0);
      assert.equal(emptyAnalytics.body.data.appointmentsToday,0);
      assert.equal(emptyAnalytics.body.data.clinicalVisits,0);
      assert.equal(emptyAnalytics.body.data.dailyAppointments.length,7);
      assert.ok(emptyAnalytics.body.data.dailyAppointments.every((day: {count:number})=>day.count===0));
      await dbQuery("INSERT INTO profiles(id,email,role) VALUES ($1,'patient@spu.ac.za','patient'),($2,'other@spu.ac.za','patient'),($3,'doctor@spu.ac.za','doctor'),($4,'otherdoctor@spu.ac.za','doctor')",[patientId,secondPatient,doctorUser,otherDoctorUser]);
      const clinicSession=randomUUID();
      const boundEmail=otpEmailHash(patientId,'patient@spu.ac.za')!;
      const codeHash=otpCodeHash(patientId,clinicSession,boundEmail,'123456').toString('hex');
      await dbQuery("INSERT INTO otp_challenges(user_id,session_id,code_hash,email_hash,delivery_state,expires_at) VALUES ($1,$2,$3,$4,'accepted',now()+interval '5 minutes')",[patientId,clinicSession,codeHash,boundEmail]);
      const verified=await call(otp,'post','/verify','patient',patientId,{code:'123456'}, {},{},clinicSession);
      assert.equal(verified.status,200,JSON.stringify(verified.body));
      await dbQuery("UPDATE otp_verified_sessions SET verified_at=now()-interval '13 hours' WHERE user_id=$1 AND session_id=$2",[patientId,clinicSession]);
      assert.equal((await dbQuery("SELECT expires_at > now()+interval '13 hours' AS remains_valid FROM otp_verified_sessions WHERE user_id=$1 AND session_id=$2",[patientId,clinicSession])).rows[0].remains_valid,true,'a valid login has no separate dashboard expiry');
      assert.equal((await call(otp,'get','/status','patient',patientId,{}, {},{},clinicSession)).body.verified,true);
      assert.equal((await call(otp,'get','/status','patient',patientId,{}, {},{},randomUUID())).body.verified,false);
      assert.equal((await call(otp,'get','/status','patient',patientId,{}, {},{},clinicSession,'+27999999999')).body.verified,true,'changing only the phone leaves email verification valid');
      assert.equal((await call(otp,'get','/status','patient',patientId,{}, {},{},clinicSession,'+27123456789','other@spu.ac.za')).body.verified,false,'old email verification cannot authorize a changed email');
      assert.equal((await call(otp,'post','/verify','patient',patientId,{code:'123456'}, {},{},clinicSession)).status,404,'a consumed OTP cannot be replayed');
      await dbQuery("UPDATE otp_verified_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1 AND session_id=$2",[patientId,clinicSession]);
      await dbQuery(await readFile(new URL('../sql/016_manual_logout_sessions.sql', import.meta.url), 'utf8'));
      assert.equal((await call(otp,'get','/status','patient',patientId,{}, {},{},clinicSession)).body.verified,false,'an expired verification session cannot restore dashboard access');
      const changedSession=randomUUID();
      const oldCodeHash=otpCodeHash(patientId,changedSession,boundEmail,'123456').toString('hex');
      await dbQuery("INSERT INTO otp_challenges(user_id,session_id,code_hash,email_hash,delivery_state,expires_at) VALUES ($1,$2,$3,$4,'accepted',now()+interval '5 minutes')",[patientId,changedSession,oldCodeHash,boundEmail]);
      assert.equal((await call(otp,'post','/verify','patient',patientId,{code:'123456'}, {},{},changedSession,'+27123456789','other@spu.ac.za')).status,404,'an in-flight code sent to an old email cannot verify the current email');
      assert.equal((await call(otp,'get','/status','patient',patientId,{}, {},{},changedSession,'+27123456789','other@spu.ac.za')).body.verified,false);
      const manualSession=randomUUID(), otherSession=randomUUID();
      await dbQuery("INSERT INTO otp_verified_sessions(user_id,session_id,email_hash,expires_at) VALUES ($1,$2,$4,'infinity'),($1,$3,$4,'infinity')",[patientId,manualSession,otherSession,boundEmail]);
      const loggedOut=await call(auth,'post','/logout','patient',patientId,{}, {},{},manualSession);
      assert.equal(loggedOut.status,200);
      assert.equal((await call(otp,'get','/status','patient',patientId,{}, {},{},manualSession)).body.verified,false,'manual logout ends verification');
      assert.equal((await call(otp,'get','/status','patient',patientId,{}, {},{},otherSession)).body.verified,true,'logout cleanup targets its authenticated session');

      const sameTimeIds=[randomUUID(),randomUUID()].sort().reverse();
      await dbQuery("INSERT INTO audit_events(id,actor_user_id,action,entity_type,created_at) VALUES ($1,$3,'test.first','test','2030-01-01T00:00:00.123456Z'),($2,$3,'test.second','test','2030-01-01T00:00:00.123456Z')",[...sameTimeIds,adminId]);
      const authAuditId = randomUUID(), malformedActorAuditId = randomUUID(), accessAuditId = randomUUID();
      await dbQuery("INSERT INTO auth_audit_log_entries(id,payload,created_at) VALUES ($1,$2::jsonb,'2029-01-02T00:00:00Z'),($3,$4::jsonb,'2029-01-01T00:00:00Z')",
        [authAuditId,JSON.stringify({actor_id:adminId,action:'login'}),malformedActorAuditId,JSON.stringify({actor_id:'invalid-fixture-id',action:'logout'})]);
      await dbQuery("INSERT INTO request_audit_logs(id,actor_user_id,method,path,status_code,duration_ms,created_at) VALUES ($1,$2,'GET','/api/fixture-records',200,1,'2028-01-01T00:00:00Z')",[accessAuditId,adminId]);
      const firstPage=await call(api,'get','/audit-events','admin',adminId,{}, {},{limit:'1'});
      assert.equal(firstPage.status,200,JSON.stringify(firstPage.body));
      assert.equal(firstPage.body.data[0].id,sameTimeIds[0]);
      const nextPage=await call(api,'get','/audit-events','admin',adminId,{}, {},{limit:'1',before:firstPage.body.before,beforeId:firstPage.body.beforeId});
      assert.equal(nextPage.status,200,JSON.stringify(nextPage.body));
      assert.equal(nextPage.body.data[0].id,sameTimeIds[1],'audit pagination preserves rows with identical timestamps');
      const authPage=await call(api,'get','/audit-events','admin',adminId,{}, {},{limit:'1',before:nextPage.body.before,beforeId:nextPage.body.beforeId});
      assert.equal(authPage.status,200,JSON.stringify(authPage.body));
      assert.equal(authPage.body.data[0].id,authAuditId);
      assert.equal(authPage.body.data[0].actor_user_id,adminId);
      assert.equal(authPage.body.data[0].action,'auth.login');
      assert.equal(authPage.body.data[0].entity_type,'auth_session');
      const allAudit=await call(api,'get','/audit-events','admin',adminId,{}, {},{kind:'all'});
      assert.equal(allAudit.status,200,JSON.stringify(allAudit.body));
      assert.equal(allAudit.body.data.find((row: {id:string})=>row.id===malformedActorAuditId).actor_user_id,null,'malformed provider actor IDs cannot break the audit UNION');
      assert.ok(allAudit.body.data.some((row: {id:string})=>row.id===accessAuditId));
      const accessAudit=await call(api,'get','/audit-events','admin',adminId,{}, {},{kind:'access'});
      assert.equal(accessAudit.status,200,JSON.stringify(accessAudit.body));
      assert.deepEqual(accessAudit.body.data.map((row: {id:string})=>row.id),[accessAuditId],'access filtering excludes clinical and provider-auth audit rows');
      assert.equal(accessAudit.body.data[0].action,'GET /api/fixture-records (200)');
      assert.equal(isolatedAuthAuditReads,5,'all audit queries read private Auth fixtures instead of a hosted Auth table');
      mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        );
        if (url.pathname.endsWith('/rest/v1/profiles')) {
          const id = url.searchParams.get('id')?.replace('eq.', '') ?? patientId;
          return new globalThis.Response(
            JSON.stringify([{ id, role: 'patient', full_name: 'Fixture Patient' }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.pathname.includes('/auth/v1/admin/users/')) {
          const id = url.pathname.split('/').at(-1);
          return new globalThis.Response(
            JSON.stringify({
              id,
              email: 'fixture@example.test',
              app_metadata: { clinic_role: 'patient' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(
          `Unexpected network request to ${url.pathname}; no external writes are allowed in this test.`
        );
      });

      const availability = await call(
        scheduling,
        'post',
        '/availability-slots',
        'doctor',
        doctorUser,
        { doctorId, startsAt, endsAt }
      );
      assert.equal(availability.status, 201, JSON.stringify(availability.body));
      const slotId = availability.body.data.id;
      const nextAvailability = await call(
        scheduling,
        'post',
        '/availability-slots',
        'doctor',
        doctorUser,
        { doctorId, startsAt: nextStarts, endsAt: nextEnds }
      );
      assert.equal(nextAvailability.status, 201);
      const nextSlot = nextAvailability.body.data.id;
      const booking = await call(api, 'post', '/appointments', 'patient', patientId, {
        slotId,
        consultationType: 'General consultation',
        mode: 'in_person',
        reason: 'Fixture appointment',
      });
      assert.equal(booking.status, 201, JSON.stringify(booking.body));
      const appointmentId = booking.body.data.id;
      const closureConflict=await call(scheduling,'post','/clinic/holidays','admin',adminId,{date:day,title:'Campus closure'});
      assert.equal(closureConflict.status,409,'existing bookings prevent a clinic closure');
      assert.equal(
        (await dbQuery('SELECT status FROM doctor_availability_slots WHERE id=$1', [slotId]))
          .rows[0].status,
        'booked'
      );
      assert.equal(
        (
          await call(api, 'post', '/appointments', 'patient', secondPatient, {
            slotId,
            consultationType: 'General consultation',
            mode: 'in_person',
          })
        ).status,
        409
      );

      const unauthorized = await call(
        scheduling,
        'post',
        '/appointments/:id/reschedule',
        'doctor',
        otherDoctorUser,
        { slotId: nextSlot },
        { id: appointmentId }
      );
      assert.equal(unauthorized.status, 403);
      const rescheduled = await call(
        scheduling,
        'post',
        '/appointments/:id/reschedule',
        'patient',
        patientId,
        { slotId: nextSlot },
        { id: appointmentId }
      );
      assert.equal(rescheduled.status, 200, JSON.stringify(rescheduled.body));
      assert.equal(
        (await dbQuery('SELECT status FROM doctor_availability_slots WHERE id=$1', [slotId]))
          .rows[0].status,
        'available'
      );
      assert.equal(
        (await dbQuery('SELECT status FROM doctor_availability_slots WHERE id=$1', [nextSlot]))
          .rows[0].status,
        'booked'
      );
      assert.equal(
        (await dbQuery('SELECT count(*)::int AS count FROM appointment_reschedule_events')).rows[0]
          .count,
        1
      );

      const confirmed = await call(
        api,
        'patch',
        '/appointments/:id/status',
        'admin',
        adminId,
        { status: 'confirmed' },
        { id: appointmentId }
      );
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
      assert.equal(confirmed.body.data.status, 'confirmed');
      assert.equal(
        (
          await call(
            api,
            'patch',
            '/appointments/:id/status',
            'doctor',
            doctorUser,
            { status: 'in_progress' },
            { id: appointmentId }
          )
        ).status,
        404,
        'future visits cannot start early'
      );
      assert.equal(
        (
          await call(
            scheduling,
            'delete',
            '/availability-slots/:id',
            'doctor',
            doctorUser,
            {},
            { id: nextSlot }
          )
        ).status,
        409,
        'booked slots cannot be removed'
      );

      const leave = await call(clinical, 'post', '/leave-requests', 'doctor', doctorUser, {
        startsOn: day,
        endsOn: day,
        leaveType: 'annual',
        reason: 'Fixture leave',
      });
      assert.equal(leave.status, 201, JSON.stringify(leave.body));
      const leaveId = leave.body.data.id;
      const conflict = await call(
        clinical,
        'patch',
        '/leave-requests/:id',
        'admin',
        adminId,
        { status: 'approved' },
        { id: leaveId }
      );
      assert.equal(conflict.status, 409, 'leave cannot remove booked care silently');
      assert.equal(
        (
          await call(
            api,
            'patch',
            '/appointments/:id/status',
            'admin',
            adminId,
            { status: 'cancelled' },
            { id: appointmentId }
          )
        ).status,
        200
      );
      const approved = await call(
        clinical,
        'patch',
        '/leave-requests/:id',
        'admin',
        adminId,
        { status: 'approved' },
        { id: leaveId }
      );
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      assert.equal(
        (
          await call(
            scheduling,
            'get',
            '/doctors/:id/availability',
            'patient',
            patientId,
            {},
            { id: doctorId },
            { date: day }
          )
        ).body.data.length,
        0,
        'approved leave disappears from bookable times'
      );
      assert.equal(
        (
          await call(api, 'post', '/appointments', 'patient', patientId, {
            slotId,
            consultationType: 'General consultation',
            mode: 'in_person',
          })
        ).status,
        409
      );
      assert.equal(
        (
          await call(
            clinical,
            'delete',
            '/leave-requests/:id',
            'doctor',
            doctorUser,
            {},
            { id: leaveId }
          )
        ).status,
        200
      );
      assert.equal(
        (
          await call(
            scheduling,
            'get',
            '/doctors/:id/availability',
            'patient',
            patientId,
            {},
            { id: doctorId },
            { date: day }
          )
        ).body.data.length,
        2,
        'withdrawal restores usable times'
      );

      const walkIn = await call(clinical, 'post', '/walk-ins', 'receptionist', adminId, {
        patientName: 'Fixture Walk In',
        reason: 'Intake fixture',
        urgency: 'medium',
      });
      assert.equal(walkIn.status, 201);
      const walkInId = walkIn.body.data.id;
      await dbQuery(
        'INSERT INTO account_status(user_id,active) VALUES ($1,false) ON CONFLICT(user_id) DO UPDATE SET active=false',
        [secondPatient]
      );
      const inactiveIntake = await call(clinical, 'post', '/walk-ins', 'receptionist', adminId, {
        patientUserId: secondPatient,
        patientName: 'Inactive Fixture',
        reason: 'Inactive account check',
        urgency: 'low',
      });
      assert.equal(inactiveIntake.status, 422, 'inactive patients cannot be checked into the queue');
      const inactiveLink = await call(clinical, 'patch', '/walk-ins/:id', 'receptionist', adminId,
        { status: 'waiting', patientUserId: secondPatient }, { id: walkInId });
      assert.equal(inactiveLink.status, 422, 'anonymous intake cannot be linked to an inactive patient');
      assert.equal((await dbQuery('SELECT patient_user_id FROM walk_ins WHERE id=$1', [walkInId])).rows[0].patient_user_id,
        null, 'a rejected relink keeps the existing intake record');
      const assigned = await call(
        clinical,
        'patch',
        '/walk-ins/:id',
        'receptionist',
        adminId,
        { status: 'assigned', doctorId },
        { id: walkInId }
      );
      assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
      const unassigned = await call(
        clinical,
        'patch',
        '/walk-ins/:id',
        'receptionist',
        adminId,
        { status: 'waiting', doctorId: null, urgency: 'high' },
        { id: walkInId }
      );
      assert.equal(unassigned.status, 200);
      assert.equal(unassigned.body.data.assigned_doctor_id, null);
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/walk-ins/:id',
            'receptionist',
            adminId,
            { status: 'assigned', doctorId },
            { id: walkInId }
          )
        ).status,
        200
      );
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/walk-ins/:id',
            'doctor',
            otherDoctorUser,
            { status: 'in_progress' },
            { id: walkInId }
          )
        ).status,
        403
      );
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/walk-ins/:id',
            'doctor',
            doctorUser,
            { status: 'in_progress' },
            { id: walkInId }
          )
        ).status,
        200
      );
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/walk-ins/:id',
            'doctor',
            doctorUser,
            { status: 'completed' },
            { id: walkInId }
          )
        ).status,
        200
      );
      assert.equal(
        (await dbQuery('SELECT status FROM walk_ins WHERE id=$1', [walkInId])).rows[0].status,
        'completed'
      );

      // Convert a registered walk-in into a real, documented clinical consultation.
      const localOffset = 12 - new Date().getUTCHours();
      const noonZone =
        localOffset === 0 ? 'UTC' : `Etc/GMT${localOffset > 0 ? '-' : '+'}${Math.abs(localOffset)}`;
      await dbQuery(
        `UPDATE clinic_settings SET timezone=$1,opens_at='00:00',closes_at='23:59',default_appointment_minutes=10`,
        [noonZone]
      );
      const registered = await call(clinical, 'post', '/walk-ins', 'receptionist', adminId, {
        patientUserId: patientId,
        patientName: 'Registered Fixture',
        reason: 'Clinical documentation fixture',
        urgency: 'low',
      });
      assert.equal(registered.status, 201, JSON.stringify(registered.body));
      const registeredId = registered.body.data.id;
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/walk-ins/:id',
            'receptionist',
            adminId,
            { status: 'assigned', doctorId },
            { id: registeredId }
          )
        ).status,
        200
      );
      const consultation = await call(
        clinical,
        'post',
        '/walk-ins/:id/consultation',
        'doctor',
        doctorUser,
        {},
        { id: registeredId }
      );
      assert.equal(consultation.status, 201, JSON.stringify(consultation.body));
      const visitAppointment = consultation.body.data.appointmentId;
      assert.equal(
        (
          await call(
            clinical,
            'post',
            '/walk-ins/:id/consultation',
            'doctor',
            doctorUser,
            {},
            { id: registeredId }
          )
        ).body.data.appointmentId,
        visitAppointment,
        'conversion is idempotent'
      );
      assert.equal(
        (
          await call(
            api,
            'patch',
            '/appointments/:id/status',
            'doctor',
            doctorUser,
            { status: 'completed' },
            { id: visitAppointment }
          )
        ).status,
        404,
        'undocumented visits cannot be completed'
      );
      const visit = await call(clinical, 'post', '/patient-visits', 'doctor', doctorUser, {
        appointmentId: visitAppointment,
        chiefComplaint: 'Fixture complaint',
        assessment: 'Fixture assessment',
        plan: 'Fixture plan',
        temperatureC: 37,
      });
      assert.equal(visit.status, 201, JSON.stringify(visit.body));
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/patient-visits/:id',
            'doctor',
            doctorUser,
            { plan: 'Updated fixture plan' },
            { id: visit.body.data.id }
          )
        ).status,
        200
      );
      const revisions=await call(clinical,'get','/patient-visits/:id/revisions','doctor',doctorUser,{}, {id:visit.body.data.id});
      assert.equal(revisions.status,200,JSON.stringify(revisions.body));
      assert.equal(revisions.body.data.length,1);
      assert.equal(revisions.body.data[0].previous_record.plan,'Fixture plan');
      assert.equal(revisions.body.data[0].revised_record.plan,'Updated fixture plan');
      assert.equal((await call(clinical,'get','/patient-visits/:id/revisions','doctor',otherDoctorUser,{}, {id:visit.body.data.id})).status,404);
      const prescription = await call(clinical, 'post', '/prescriptions', 'doctor', doctorUser, {
        visitId: visit.body.data.id,
        medication: 'Fixture medication',
        dosage: 'Fixture dose',
        frequency: 'Fixture frequency',
        duration: 'Fixture duration',
      });
      assert.equal(prescription.status, 201, JSON.stringify(prescription.body));
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/prescriptions/:id',
            'doctor',
            doctorUser,
            { status: 'discontinued' },
            { id: prescription.body.data.id }
          )
        ).status,
        200
      );
      const lab = await call(clinical, 'post', '/lab-orders', 'doctor', doctorUser, {
        visitId: visit.body.data.id,
        testName: 'Fixture laboratory test',
      });
      assert.equal(lab.status, 201);
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/lab-orders/:id',
            'doctor',
            doctorUser,
            { status: 'resulted', resultSummary: '' },
            { id: lab.body.data.id }
          )
        ).status,
        422
      );
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/lab-orders/:id',
            'doctor',
            doctorUser,
            { status: 'resulted', resultSummary: 'Fixture result' },
            { id: lab.body.data.id }
          )
        ).status,
        200
      );
      assert.equal(
        (
          await call(
            clinical,
            'patch',
            '/lab-orders/:id',
            'doctor',
            doctorUser,
            { status: 'processing' },
            { id: lab.body.data.id }
          )
        ).status,
        404,
        'resulted tests cannot return to processing'
      );
      assert.equal(
        (
          await call(
            api,
            'patch',
            '/appointments/:id/status',
            'doctor',
            doctorUser,
            { status: 'completed' },
            { id: visitAppointment }
          )
        ).status,
        200
      );
      assert.equal(
        (await dbQuery('SELECT status FROM walk_ins WHERE id=$1', [registeredId])).rows[0].status,
        'completed',
        'documented completion synchronizes the linked queue'
      );
      await dbQuery(
        `UPDATE clinic_settings SET timezone='Africa/Johannesburg',opens_at='08:00',closes_at='17:15',default_appointment_minutes=30`
      );
      const cleanSlot = await call(
        scheduling,
        'post',
        '/availability-slots',
        'doctor',
        doctorUser,
        { doctorId, startsAt: `${day}T10:00:00.000Z`, endsAt: `${day}T10:30:00.000Z` }
      );
      assert.equal(cleanSlot.status, 201);
      assert.equal(
        (
          await call(
            scheduling,
            'delete',
            '/availability-slots/:id',
            'doctor',
            doctorUser,
            {},
            { id: cleanSlot.body.data.id }
          )
        ).status,
        200
      );
      const notification = (
        await dbQuery('SELECT id FROM notifications WHERE user_id=$1 LIMIT 1', [patientId])
      ).rows[0];
      assert.ok(notification);
      assert.equal(
        (
          await call(
            api,
            'delete',
            '/notifications/:id',
            'patient',
            secondPatient,
            {},
            { id: notification.id }
          )
        ).status,
        404
      );
      assert.equal(
        (
          await call(
            api,
            'delete',
            '/notifications/:id',
            'patient',
            patientId,
            {},
            { id: notification.id }
          )
        ).status,
        200
      );

      // Two independent connections attempt to give one patient overlapping visits.
      const racePatient = randomUUID(),
        raceStart = `${day}T09:00:00.000Z`,
        raceEnd = `${day}T09:30:00.000Z`;
      const insert = `INSERT INTO appointments (patient_user_id,doctor_id,starts_at,ends_at,consultation_type,mode) VALUES ($1,$2,$3,$4,'Race fixture','in_person')`;
      const race = async (query: typeof rawDbQuery, doctor: string) => {
        await query('BEGIN');
        await query(setLocal);
        try {
          await query(insert, [racePatient, doctor, raceStart, raceEnd]);
          await query('COMMIT');
        } catch (error) {
          await query('ROLLBACK');
          throw error;
        }
      };
      const races = await Promise.allSettled([
        race(rawDbQuery, doctorId),
        race(rawOtherQuery, otherDoctorId),
      ]);
      assert.equal(races.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = races.find((result) => result.status === 'rejected');
      assert.ok(rejected && rejected.status === 'rejected');
      assert.ok(
        ['23P01', '40P01'].includes(rejected.reason.code),
        `Patient race rejected with ${rejected.reason.code}: ${rejected.reason.message}`
      );

      // No missing bind parameters or raw placeholder data in reports.
      const report = await call(
        clinical,
        'get',
        '/reports/summary',
        'admin',
        adminId,
        {},
        {},
        { from: day, to: day }
      );
      assert.equal(report.status, 200, JSON.stringify(report.body));
      assert.equal(report.body.data.appointments, 2);
      assert.equal(report.body.data.cancelled, 1);
      assert.equal(
        (
          await call(
            clinical,
            'get',
            '/reports/summary',
            'admin',
            adminId,
            {},
            {},
            { from: '2027-02-02', to: '2027-01-01' }
          )
        ).status,
        422
      );
    } finally {
      mock.restoreAll();
      await rawDbQuery('ROLLBACK').catch(() => undefined);
      await rawOtherQuery('ROLLBACK').catch(() => undefined);
      db.release(connectionFailure);
      other.release(connectionFailure);
      try {
        // Cleanup uses a fresh connection if a long-lived fixture socket died.
        // A failed connection remains a test failure; it cannot skip assertions.
        if (created) {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          assert.equal((await cleanup.query('SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].count,0);
        }
      } finally {
        await cleanup.end();
        await pool.end();
      }
    }
  }
);
