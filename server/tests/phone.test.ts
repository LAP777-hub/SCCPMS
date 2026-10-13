import assert from 'node:assert/strict';
import { test } from 'node:test';
import { phoneSchema, normalizePhoneNumber } from '../src/phone.js';
import { registrationSchema } from '../src/auth.routes.js';
import { patientSchema, staffSchema } from '../src/api.routes.js';

test('explicit international phone formatting produces a single canonical destination', () => {
  for (const input of ['+27712345678', ' +27 (71) 234-5678 ', '0027712345678', '00 27 (71) 234 5678']) {
    assert.equal(normalizePhoneNumber(input), '+27712345678', input);
    assert.equal(phoneSchema.parse(input), '+27712345678', input);
  }
  assert.equal(normalizePhoneNumber('+44 (20) 7946-0958'), '+442079460958');
  assert.equal(normalizePhoneNumber('+1 (202) 555-0123'), '+12025550123');
  assert.equal(normalizePhoneNumber('+27712345678'), normalizePhoneNumber(normalizePhoneNumber('+27 (71) 234-5678')));
});

test('ambiguous local numbers, extensions and multiple recipients cannot be normalized', () => {
  for (const input of [
    '0712345678', '27712345678', '+0712345678', '000712345678',
    '+27712345678,+27823456789', '+27712345678 / +27823456789',
    '+27712345678;+27823456789', '+27712345678 +27823456789',
    '+27712345678 ext 123', '+27712345678x123', '+27712345678#123',
    'tel:+27712345678', '+27\n712345678', '+27\t712345678',
    '+27 (71 2345678', '+27 71) 2345678', '+27 ((71)) 2345678', '+27 () 712345678',
    '', '+1234567', '+1234567890123456', '+27' + ' '.repeat(64) + '712345678',
  ]) {
    assert.equal(normalizePhoneNumber(input), null, input);
    assert.equal(phoneSchema.safeParse(input).success, false, input);
  }
  for (const input of [null, undefined, 27712345678, {}, []]) {
    assert.equal(normalizePhoneNumber(input), null);
    assert.equal(phoneSchema.safeParse(input).success, false);
  }
});

test('registration and administrative invitations persist canonical phone numbers', () => {
  const patient = { fullName: 'Phone Test', email: 'test123@spu.ac.za', phone: '00 27 (71) 234-5678', userType: 'Student', studentNumber: 'TEST123' };
  assert.equal(registrationSchema.parse({ ...patient, password: 'a-test-password', department: 'EMS', program: 'Bachelor of Commerce (BCom) in Accounting', addressLine1: '12 Phone Test Street' }).phone, '+27712345678');
  assert.equal(patientSchema.parse(patient).phone, '+27712345678');
  assert.equal(staffSchema.parse({ fullName: 'Phone Test Doctor', email: 'doctor@spu.ac.za', phone: '+27 (71) 234-5678', role: 'doctor', specialty: 'General Medicine' }).phone, '+27712345678');
  for (const phone of ['0712345678', '+27712345678,+27823456789']) {
    assert.equal(registrationSchema.safeParse({ ...patient, phone, password: 'a-test-password' }).success, false);
    assert.equal(patientSchema.safeParse({ ...patient, phone }).success, false);
    assert.equal(staffSchema.safeParse({ fullName: 'Phone Test Doctor', email: 'doctor@spu.ac.za', phone, role: 'doctor', specialty: 'General Medicine' }).success, false);
  }
});
