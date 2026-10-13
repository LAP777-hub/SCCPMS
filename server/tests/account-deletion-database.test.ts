import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pool } from '../src/db.js';
import { deletePatientLoginAccount, PatientDeletionError } from '../src/account-deletion.js';

test('patient deletion preserves database history, safely retries and frees the original email in an isolated schema', { skip: process.env.RUN_DATABASE_TESTS !== '1' }, async () => {
  const schema = `clinic_account_deletion_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^clinic_account_deletion_test_[a-f0-9]{32}$/);
  const control = await pool.connect();
  const database = new pg.Pool({ ...pool.options, options: `-c search_path=${schema},public`, max: 3 });
  const patientId = randomUUID(), actorId = randomUUID(), otherId = randomUUID();
  const originalEmail = 'deleted-fixture@spu.ac.za';
  const migration = await readFile(new URL('../sql/019_patient_account_deletion.sql', import.meta.url), 'utf8');
  const providerDeletes: { id: string; soft: boolean }[] = [];
  let providerUnavailable = true;
  let providerDeleted = false;
  const provider = {
    from(table: string) {
      assert.equal(table, 'profiles');
      let selectedId = '';
      const request = {
        select() { return request; },
        eq(field: string, id: string) { assert.equal(field, 'id'); selectedId = id; return request; },
        async maybeSingle() { return { data: (await database.query('SELECT id,role FROM profiles WHERE id=$1', [selectedId])).rows[0] ?? null, error: null }; },
      };
      return request;
    },
    auth: { admin: {
      async getUserById(id: string) { return { data: { user: { id, app_metadata: { clinic_role: 'patient' } } }, error: null }; },
      async deleteUser(id: string, soft: boolean) {
        providerDeletes.push({ id, soft });
        if (providerUnavailable) return { error: { status: 503, code: 'unexpected_failure' } };
        if (providerDeleted) return { error: { status: 404, code: 'user_not_found' } };
        providerDeleted = true;
        return { error: null };
      },
    } },
  } as unknown as SupabaseClient;
  const pendingError = (error: unknown) => error instanceof PatientDeletionError && error.status === 503 && error.code === 'PATIENT_DELETION_PENDING';
  try {
    await control.query(`CREATE SCHEMA "${schema}"`);
    assert.equal((await database.query('SELECT current_schema() AS schema')).rows[0].schema, schema);
    await database.query(await readFile(new URL('../sql/004_profiles_table.sql', import.meta.url), 'utf8'));
    await database.query(await readFile(new URL('../sql/005_account_status.sql', import.meta.url), 'utf8'));
    await database.query(await readFile(new URL('../sql/002_notifications_audit.sql', import.meta.url), 'utf8'));
    await database.query(`
      CREATE TABLE appointments (id uuid PRIMARY KEY,patient_user_id uuid NOT NULL,status text NOT NULL,ends_at timestamptz NOT NULL);
      CREATE TABLE walk_ins (id uuid PRIMARY KEY,patient_user_id uuid NOT NULL,status text NOT NULL);
      CREATE TABLE patient_visits (id uuid PRIMARY KEY,patient_user_id uuid NOT NULL,assessment text NOT NULL);
      CREATE TABLE prescriptions (id uuid PRIMARY KEY,patient_user_id uuid NOT NULL,medication text NOT NULL);
      CREATE TABLE lab_orders (id uuid PRIMARY KEY,patient_user_id uuid NOT NULL,result_summary text NOT NULL);
      CREATE TABLE otp_verified_sessions (user_id uuid NOT NULL,session_id uuid NOT NULL);
      CREATE TABLE otp_challenges (user_id uuid NOT NULL,consumed_at timestamptz);
    `);
    await database.query('INSERT INTO profiles(id,email,role,full_name) VALUES ($1,$2,\'patient\',\'Retained Patient Fixture\'),($3,\'admin-fixture@example.invalid\',\'admin\',\'Retained Admin Fixture\')', [patientId, originalEmail, actorId]);
    await database.query('INSERT INTO account_status(user_id,active) VALUES ($1,true),($2,true)', [patientId, actorId]);
    await database.query(migration);
    await database.query(migration);
    assert.equal((await database.query('SELECT active FROM account_status WHERE user_id=$1', [actorId])).rows[0].active, true);
    await assert.rejects(deletePatientLoginAccount(database, provider, patientId, actorId), (error: unknown) => error instanceof PatientDeletionError && error.status === 409);
    assert.equal(providerDeletes.length, 0);
    await database.query('UPDATE account_status SET active=false WHERE user_id=$1', [patientId]);
    await database.query('INSERT INTO appointments VALUES ($1,$2,\'completed\',now()-interval \'1 day\')', [randomUUID(), patientId]);
    await database.query('INSERT INTO walk_ins VALUES ($1,$2,\'completed\')', [randomUUID(), patientId]);
    await database.query('INSERT INTO patient_visits VALUES ($1,$2,\'Retained assessment\')', [randomUUID(), patientId]);
    await database.query('INSERT INTO prescriptions VALUES ($1,$2,\'Retained medication\')', [randomUUID(), patientId]);
    await database.query('INSERT INTO lab_orders VALUES ($1,$2,\'Retained lab result\')', [randomUUID(), patientId]);
    await database.query('INSERT INTO otp_verified_sessions VALUES ($1,$2),($3,$4)', [patientId, randomUUID(), otherId, randomUUID()]);
    await database.query('INSERT INTO otp_challenges(user_id) VALUES ($1),($2)', [patientId, otherId]);
    const historyTables = ['appointments', 'walk_ins', 'patient_visits', 'prescriptions', 'lab_orders'];
    const before = await Promise.all(historyTables.map(table => database.query(`SELECT * FROM ${table} ORDER BY id`).then(result => result.rows)));

    await assert.rejects(deletePatientLoginAccount(database, provider, patientId, actorId), pendingError);
    const reserved = (await database.query('SELECT * FROM account_status WHERE user_id=$1', [patientId])).rows[0];
    assert.equal(reserved.active, false);
    assert.ok(reserved.deletion_requested_at);
    assert.equal(reserved.deleted_at, null);
    assert.equal(reserved.deleted_by, actorId);
    await assert.rejects(database.query('UPDATE account_status SET active=true WHERE user_id=$1', [patientId]), (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === '23514');
    assert.equal((await database.query('SELECT count(*)::int AS count FROM otp_verified_sessions WHERE user_id=$1', [patientId])).rows[0].count, 0);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM otp_verified_sessions WHERE user_id=$1', [otherId])).rows[0].count, 1);
    assert.ok((await database.query('SELECT consumed_at FROM otp_challenges WHERE user_id=$1', [patientId])).rows[0].consumed_at);
    assert.equal((await database.query('SELECT consumed_at FROM otp_challenges WHERE user_id=$1', [otherId])).rows[0].consumed_at, null);

    providerUnavailable = false;
    await database.query(`CREATE FUNCTION fail_final_deletion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='patient.deleted' THEN RAISE EXCEPTION 'Isolated finalization fixture failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_final_deletion BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_final_deletion();`);
    await assert.rejects(deletePatientLoginAccount(database, provider, patientId, actorId), pendingError);
    assert.equal(providerDeleted, true);
    assert.deepEqual((await database.query('SELECT email,deleted_email FROM profiles WHERE id=$1', [patientId])).rows[0], { email: originalEmail, deleted_email: null });
    assert.equal((await database.query('SELECT deleted_at FROM account_status WHERE user_id=$1', [patientId])).rows[0].deleted_at, null);
    await database.query('DROP TRIGGER fail_final_deletion ON audit_events');
    const completed = await deletePatientLoginAccount(database, provider, patientId, actorId);
    assert.equal(completed.active, false);
    assert.ok(completed.deleted_at);
    const retained = (await database.query('SELECT email,deleted_email,full_name FROM profiles WHERE id=$1', [patientId])).rows[0];
    assert.deepEqual(retained, { email: `deleted+${patientId}@accounts.invalid`, deleted_email: originalEmail, full_name: 'Retained Patient Fixture' });
    const after = await Promise.all(historyTables.map(table => database.query(`SELECT * FROM ${table} ORDER BY id`).then(result => result.rows)));
    assert.deepEqual(after, before, 'all historical appointments, walk-ins, visits, prescriptions and lab results survive credential deletion');
    await database.query('INSERT INTO profiles(id,email,role) VALUES ($1,$2,\'patient\')', [randomUUID(), originalEmail]);
    const calls = providerDeletes.length;
    assert.deepEqual(await deletePatientLoginAccount(database, provider, patientId, actorId), completed);
    assert.equal(providerDeletes.length, calls);
    assert.ok(providerDeletes.every(call => call.id === patientId && call.soft === true));
    assert.deepEqual((await database.query('SELECT action,count(*)::int AS count FROM audit_events GROUP BY action ORDER BY action')).rows, [
      { action: 'patient.deleted', count: 1 }, { action: 'patient.deletion_requested', count: 1 },
    ]);
    await database.query(migration);
    assert.deepEqual((await database.query('SELECT email,deleted_email,full_name FROM profiles WHERE id=$1', [patientId])).rows[0], retained);
  } finally {
    await database.end();
    assert.match(schema, /^clinic_account_deletion_test_[a-f0-9]{32}$/);
    await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    control.release();
    await pool.end();
  }
});
