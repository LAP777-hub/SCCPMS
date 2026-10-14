import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrationSchema } from '../src/auth.routes.js';
import { patientSchema, staffSchema } from '../src/api.routes.js';
import academicCatalogue from '../src/academic-catalogue.json' with { type: 'json' };

const invitedPatient = { fullName: 'Registration Test', email: 'test123@spu.ac.za', phone: '+27123456789', userType: 'Student', studentNumber: 'TEST123' };
const patient = { ...invitedPatient, password: 'a-test-password', department: 'EMS', program: 'Bachelor of Commerce (BCom) in Accounting', addressLine1: '12 Registration Test Street' };

test('patient registration rejects privilege fields and invalid identity details', () => {
  assert.equal(registrationSchema.safeParse({ ...patient, role: 'admin' }).success, false);
  assert.equal(registrationSchema.safeParse({ ...patient, studentNumber: '' }).success, false);
  assert.equal(registrationSchema.safeParse({ ...patient, phone: '0123456789' }).success, false);
  assert.equal(registrationSchema.safeParse({ ...patient, password: 'short' }).success, false);
  assert.equal(registrationSchema.safeParse(patient).success, true);
});

test('staff patient registration requires staff identity and normalizes email', () => {
  assert.equal(registrationSchema.safeParse({ ...patient, userType: 'Lecturer', staffNumber: '' }).success, false);
  const parsed = registrationSchema.parse({ ...patient, email: 'PATIENT@SPU.AC.ZA', userType: 'Lecturer', staffNumber: 'STAFF123' });
  assert.equal(parsed.email, 'patient@spu.ac.za');
});

test('all registration and invitation paths accept valid personal, university and custom-domain emails', () => {
  for (const email of ['student.name@gmail.com', 'patient@outlook.com', 'patient@yahoo.com', 'clinician@clinic-fixture.co.za', 'test123@spu.ac.za', 'test123@students.spu.ac.za']) {
    assert.equal(registrationSchema.safeParse({ ...patient,email }).success,true, email);
    assert.equal(patientSchema.safeParse({ ...invitedPatient,email }).success,true, email);
    for (const role of ['doctor', 'receptionist']) assert.equal(staffSchema.safeParse({ email,role,fullName:'Test Doctor',phone:patient.phone,specialty:'General Medicine' }).success,true, role);
  }
});

test('email need not match the student number while university identity details remain required', () => {
  assert.equal(registrationSchema.safeParse({ ...patient,email:'someone@gmail.com' }).success,true);
  assert.equal(patientSchema.safeParse(invitedPatient).success,true);
  assert.equal(patientSchema.safeParse({ ...invitedPatient,userType:'SPU Staff',staffNumber:null }).success,false);
  assert.equal(staffSchema.safeParse({ email:'doctor@spu.ac.za',role:'doctor',fullName:'Test Doctor',phone:patient.phone,specialty:'General Medicine' }).success,true);
});

test('all account creation paths reject malformed email addresses and address injection', () => {
  for (const email of ['', 'missing-at', 'patient@', 'patient@invalid', 'one@gmail.com,two@gmail.com', 'patient@gmail.com\r\nBcc: other@gmail.com', `${'x'.repeat(255)}@gmail.com`]) {
    assert.equal(registrationSchema.safeParse({ ...patient,email }).success,false, email);
    assert.equal(patientSchema.safeParse({ ...invitedPatient,email }).success,false, email);
    assert.equal(staffSchema.safeParse({ email,role:'doctor',fullName:'Test Doctor',phone:patient.phone,specialty:'General Medicine' }).success,false, email);
  }
});

test('students must supply a residential address, faculty and programme without requiring legacy address fields', () => {
  for (const field of ['addressLine1', 'department', 'program'] as const) {
    assert.equal(registrationSchema.safeParse({ ...patient, [field]: undefined }).success, false, field);
    assert.equal(registrationSchema.safeParse({ ...patient, [field]: '   ' }).success, false, field);
  }
  const parsed = registrationSchema.parse({ ...patient, addressLine1: '  A  ' });
  assert.equal(parsed.addressLine1, 'A', 'manual entry accepts the user supplied nonempty address');
  assert.equal(parsed.city, undefined);
  assert.equal(parsed.province, undefined);
  assert.equal(parsed.postalCode, undefined);
  assert.equal(registrationSchema.safeParse({ ...patient, addressLine1: 'A'.repeat(201) }).success, false);
});

test('registration accepts every exact catalogue programme and rejects programmes from a different faculty', () => {
  for (const faculty of academicCatalogue.faculties) {
    for (const program of faculty.programmes) {
      const parsed = registrationSchema.parse({ ...patient, department: faculty.code, program });
      assert.equal(parsed.department, faculty.code);
      assert.equal(parsed.program, program);
    }
  }
  assert.equal(registrationSchema.safeParse({ ...patient, department: 'EDU' }).success, false);
  assert.equal(registrationSchema.safeParse({ ...patient, department: 'Nursing', program: 'Nursing' }).success, false);
  assert.equal(registrationSchema.safeParse({ ...patient, program: 'Accounting' }).success, false);
  assert.equal(registrationSchema.parse({ ...patient, department: 'NAS', program: 'BSc in Data Science' }).department, 'NAS');
  assert.equal(registrationSchema.safeParse({ ...patient, department: 'NURS', program: 'BSc in Data Science' }).success, false, 'the retired faculty code cannot be submitted');
});

test('staff registration preserves optional address and programme but validates any selected faculty', () => {
  const staff = { ...invitedPatient, userType: 'SPU Staff', studentNumber: undefined, staffNumber: 'STAFF123', email: 'staff@spu.ac.za', password: patient.password };
  assert.equal(registrationSchema.safeParse(staff).success, true);
  assert.equal(registrationSchema.safeParse({ ...staff, department: 'Humanities', program: '' }).success, true);
  assert.equal(registrationSchema.safeParse({ ...staff, department: 'An invented faculty' }).success, false);
});

test('map coordinates are finite bounded pairs associated with the selected address', () => {
  const selectedAddress = { ...patient, addressLatitude: -28.745, addressLongitude: 24.762, addressSource: 'photon' };
  assert.equal(registrationSchema.safeParse(selectedAddress).success, true);
  assert.equal(registrationSchema.safeParse({ ...selectedAddress, addressLatitude: 0, addressLongitude: 0 }).success, true);
  assert.equal(registrationSchema.safeParse({ ...selectedAddress, addressLatitude: -90, addressLongitude: 180 }).success, true);
  for (const change of [
    { addressLatitude: 90.01 }, { addressLongitude: -180.01 },
    { addressLatitude: Number.NaN }, { addressLongitude: Infinity },
    { addressLatitude: '-28.745' }, { addressLongitude: undefined },
    { addressLatitude: undefined }, { addressSource: 'manual' },
    { addressSource: 'unknown' }, { addressLine1: '' },
  ]) assert.equal(registrationSchema.safeParse({ ...selectedAddress, ...change }).success, false, JSON.stringify(change));
  assert.equal(registrationSchema.safeParse({ ...patient, addressSource: 'photon' }).success, false);
  assert.equal(registrationSchema.safeParse({ ...patient, addressSource: 'manual' }).success, true);
});
