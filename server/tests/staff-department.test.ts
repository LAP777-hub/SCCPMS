import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staffSchema } from '../src/api.routes.js';
import { RECEPTION_DEPARTMENT } from '../src/staff-policy.js';
const staff = { email: 'fixture.receptionist@gmail.com', role: 'receptionist', fullName: 'Fixture Receptionist', phone: '+27812345678' };
test('receptionist creation has one canonical department and rejects clinical departments and specialties', () => {
  for (const department of [undefined, null, '', 'Front Desk / Reception', 'Reception/Front desk']) assert.equal(staffSchema.parse({ ...staff, department }).department, RECEPTION_DEPARTMENT);
  assert.equal(staffSchema.safeParse({ ...staff, department: 'Cardiology' }).success, false);
  assert.equal(staffSchema.safeParse({ ...staff, specialty: 'General Medicine' }).success, false);
  assert.equal(staffSchema.parse({ ...staff, role: 'doctor', department: 'Cardiology', specialty: 'Cardiology' }).department, 'Cardiology');
});
