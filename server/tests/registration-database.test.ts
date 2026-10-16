import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mock, test } from 'node:test';
import type { Request, Response as ExpressResponse } from 'express';
import auth from '../src/auth.routes.js';
import { pool } from '../src/db.js';

test('registration address and academic details persist in an isolated database schema with coordinate constraints', { skip: process.env.RUN_DATABASE_TESTS !== '1' }, async () => {
  const schema = `clinic_registration_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^clinic_registration_test_[a-f0-9]{32}$/);
  const db = await pool.connect();
  const query = db.query.bind(db);
  let newUserId = randomUUID();
  const userIds: string[] = [];
  const migration = await readFile(new URL('../sql/017_registration_address_coordinates.sql', import.meta.url), 'utf8');
  const facultyMigration = await readFile(new URL('../sql/018_nas_faculty_code.sql', import.meta.url), 'utf8');
  const route = auth.stack.find((item: any) => item.route?.path === '/register' && item.route?.methods.post);
  assert.ok(route);
  const insertProfile = async (profile: Record<string, unknown>) => {
    const fields = Object.keys(profile);
    for (const field of fields) assert.match(field, /^[a-z_][a-z0-9_]*$/);
    return query(`INSERT INTO profiles (${fields.join(',')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(',')}) ON CONFLICT (id) DO NOTHING`, Object.values(profile));
  };
  const register = async (body: unknown) => {
    const result = { status: 200, body: undefined as any };
    const res = {
      status(code: number) { result.status = code; return res; },
      json(value: unknown) { result.body = value; return res; },
    };
    await route.route.stack.at(-1).handle({ body } as Request, res as unknown as ExpressResponse, () => {});
    return result;
  };
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await query('BEGIN');
    await query(`SET LOCAL search_path TO "${schema}", public`);
    await query(await readFile(new URL('../sql/004_profiles_table.sql', import.meta.url), 'utf8'));
    await query(await readFile(new URL('../sql/002_notifications_audit.sql', import.meta.url), 'utf8'));
    const legacyId = randomUUID();
    await query("INSERT INTO profiles(id,email,role) VALUES ($1,'legacy-admin@example.invalid','admin')", [legacyId]);
    await query(migration);
    const legacyPatientId = randomUUID();
    const clinicalDoctorId = randomUUID();
    await query("INSERT INTO profiles(id,email,role,department,program) VALUES ($1,'legacy-patient@example.invalid','patient','NURS','BSc in Data Science'), ($2,'clinical-doctor@example.invalid','doctor','NURS',NULL)", [legacyPatientId, clinicalDoctorId]);
    const verifyFacultyMigration = async () => {
      assert.deepEqual((await query('SELECT role,department,program FROM profiles WHERE id=$1', [legacyPatientId])).rows[0],
        { role: 'patient', department: 'NAS', program: 'BSc in Data Science' });
      assert.deepEqual((await query('SELECT role,department,program FROM profiles WHERE id=$1', [clinicalDoctorId])).rows[0],
        { role: 'doctor', department: 'NURS', program: null }, 'a clinical doctor department is not a patient faculty selection');
    };
    await query(facultyMigration);
    await verifyFacultyMigration();
    const receptionistId = randomUUID();
    await query("INSERT INTO profiles(id,email,role,department) VALUES ($1,'reception-photo-fixture@example.invalid','receptionist','Cardiology')", [receptionistId]);
    const photoMigration = await readFile(new URL('../sql/027_profile_photos_reception_department.sql', import.meta.url), 'utf8');
    await query(photoMigration); await query(photoMigration);
    assert.equal((await query('SELECT department FROM profiles WHERE id=$1', [receptionistId])).rows[0].department, 'Reception / Front desk');
    await verifyFacultyMigration();
    const avatar = `${receptionistId}/${randomUUID()}.webp`;
    await query('UPDATE profiles SET avatar_path=$2 WHERE id=$1', [receptionistId, avatar]);
    assert.equal((await query('SELECT avatar_path FROM profiles WHERE id=$1', [receptionistId])).rows[0].avatar_path, avatar);
    for (const [column, value] of [['avatar_path', `${clinicalDoctorId}/${randomUUID()}.webp`], ['department', 'Cardiology']]) {
      await query('SAVEPOINT photo_policy');
      await assert.rejects(query(`UPDATE profiles SET ${column}=$2 WHERE id=$1`, [receptionistId, value]), /check constraint/);
      await query('ROLLBACK TO SAVEPOINT photo_policy');
    }
    await query(facultyMigration);
    await verifyFacultyMigration();
    mock.method(pool, 'query', query);
    mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const user = { id: newUserId, email: body?.email, identities: [{ id: 'isolated-fixture-identity', provider: 'email' }] };
      if (url.pathname.endsWith('/auth/v1/signup')) {
        // Model the existing signup trigger using this private database only.
        const profile = { ...body.data, id: newUserId };
        delete profile.address_latitude;
        delete profile.address_longitude;
        delete profile.address_source;
        await insertProfile(profile);
        userIds.push(newUserId);
        return Response.json({ user });
      }
      if (url.pathname.endsWith('/rest/v1/profiles')) {
        if (method === 'POST') await insertProfile(body);
        else if (method === 'PATCH') {
          const fields = Object.keys(body);
          for (const field of fields) assert.match(field, /^[a-z_][a-z0-9_]*$/);
          assert.equal(url.searchParams.get('role'), 'eq.patient');
          const id = url.searchParams.get('id')?.replace(/^eq\./, '');
          await query(`UPDATE profiles SET ${fields.map((field, index) => `${field}=$${index + 1}`).join(',')} WHERE id=$${fields.length + 1} AND role='patient'`, [...Object.values(body), id]);
        } else throw new Error('Unexpected profile request in isolated registration test');
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith(`/auth/v1/admin/users/${newUserId}`) && method === 'PUT') return Response.json({ user });
      throw new Error('External provider request blocked by isolated registration test');
    });

    const mapped = await register({
      email: 'personal.fixture@gmail.com', password: 'database-fixture-password', fullName: 'Isolated Registration Fixture',
      phone: '+27123456789', userType: 'Student', studentNumber: 'DBFIXTURE123',
      department: 'NAS', program: 'Master of Science in e-Science',
      addressLine1: '  12 Isolated Test Street, Kimberley  ', addressLatitude: -28.745,
      addressLongitude: 24.762, addressSource: 'photon',
    });
    assert.equal(mapped.status, 201, JSON.stringify(mapped.body));
    const mappedProfile = (await query('SELECT role,email,student_number,department,program,address_line1,address_latitude,address_longitude,address_source FROM profiles WHERE id=$1', [newUserId])).rows[0];
    assert.deepEqual(mappedProfile, {
      role: 'patient', email: 'personal.fixture@gmail.com', student_number: 'DBFIXTURE123', department: 'NAS', program: 'Master of Science in e-Science',
      address_line1: '12 Isolated Test Street, Kimberley', address_latitude: -28.745,
      address_longitude: 24.762, address_source: 'photon',
    });
    const mappedId = newUserId;
    newUserId = randomUUID();
    const manual = await register({
      email: 'dbmanual123@spu.ac.za', password: 'database-fixture-password', fullName: 'Isolated Manual Address Fixture',
      phone: '+27123456789', userType: 'Student', studentNumber: 'DBMANUAL123',
      department: 'Humanities', program: 'Bachelor of Arts (BA)', addressLine1: '  Residence room 4  ',
    });
    assert.equal(manual.status, 201, JSON.stringify(manual.body));
    assert.deepEqual((await query('SELECT address_line1,address_latitude,address_longitude,address_source,city,province,postal_code FROM profiles WHERE id=$1', [newUserId])).rows[0], {
      address_line1: 'Residence room 4', address_latitude: null, address_longitude: null,
      address_source: 'manual', city: null, province: null, postal_code: null,
    });
    assert.equal((await query("SELECT count(*)::integer AS count FROM audit_events WHERE action='patient.registered' AND actor_user_id=ANY($1::uuid[])", [userIds])).rows[0].count, 2);
    for (const assignments of [
      'address_latitude=91', 'address_longitude=-181', 'address_longitude=NULL',
      "address_source='unknown'", "address_source='manual'", 'address_source=NULL',
    ]) {
      await query('SAVEPOINT invalid_coordinates');
      await assert.rejects(query(`UPDATE profiles SET ${assignments} WHERE id=$1`, [mappedId]), (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23514');
      await query('ROLLBACK TO SAVEPOINT invalid_coordinates');
      await query('RELEASE SAVEPOINT invalid_coordinates');
    }
    await query(migration);
    assert.deepEqual((await query('SELECT role,address_latitude,address_longitude,address_source FROM profiles WHERE id=$1', [legacyId])).rows[0], { role: 'admin', address_latitude: null, address_longitude: null, address_source: null });
    assert.deepEqual((await query('SELECT role,email,student_number,department,program,address_line1,address_latitude,address_longitude,address_source FROM profiles WHERE id=$1', [mappedId])).rows[0], mappedProfile, 'reapplying the additive migration preserves registered data');
  } finally {
    mock.restoreAll();
    await query('ROLLBACK').catch(() => undefined);
    assert.match(schema, /^clinic_registration_test_[a-f0-9]{32}$/);
    await query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    db.release();
    await pool.end();
  }
});
