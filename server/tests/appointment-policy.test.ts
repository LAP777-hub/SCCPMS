import assert from 'node:assert/strict';
import test from 'node:test';
import { canChangeAppointmentStatus, isWithinClinicHours } from '../src/appointment-policy.js';

test('patients can cancel their own pending appointment only', () => {
  assert.equal(canChangeAppointmentStatus('patient', 'pending', 'cancelled', true), true);
  assert.equal(canChangeAppointmentStatus('patient', 'confirmed', 'cancelled', true), true);
  assert.equal(canChangeAppointmentStatus('patient', 'in_progress', 'cancelled', true), false);
  assert.equal(canChangeAppointmentStatus('patient', 'pending', 'completed', true), false);
  assert.equal(canChangeAppointmentStatus('patient', 'pending', 'cancelled', false), false);
});

test('doctor status changes follow the visit lifecycle', () => {
  assert.equal(canChangeAppointmentStatus('doctor', 'confirmed', 'in_progress', true), true);
  assert.equal(canChangeAppointmentStatus('doctor', 'confirmed', 'no_show', true), true);
  assert.equal(canChangeAppointmentStatus('doctor', 'in_progress', 'completed', true), true);
  assert.equal(canChangeAppointmentStatus('doctor', 'pending', 'completed', true), false);
  assert.equal(canChangeAppointmentStatus('doctor', 'confirmed', 'completed', true), false);
});

test('reception staff and admins can confirm pending and cancel active bookings', () => {
  assert.equal(canChangeAppointmentStatus('receptionist', 'pending', 'confirmed', true), true);
  assert.equal(canChangeAppointmentStatus('admin', 'confirmed', 'cancelled', true), true);
  assert.equal(canChangeAppointmentStatus('receptionist', 'in_progress', 'cancelled', true), false);
});

test('clinic hours use the configured timezone and reject past dates and holidays', () => {
  const now = new Date('2026-09-27T06:00:00.000Z');
  const allowed = isWithinClinicHours({
    startsAt: new Date('2026-09-28T06:00:00.000Z'),
    endsAt: new Date('2026-09-28T06:30:00.000Z'),
    timeZone: 'Africa/Johannesburg',
    opensAt: '08:00',
    closesAt: '17:15',
    isHoliday: false,
    now,
  });
  assert.equal(allowed, true);
  assert.equal(isWithinClinicHours({ startsAt: new Date('2026-09-28T04:30:00.000Z'), endsAt: new Date('2026-09-28T05:00:00.000Z'), timeZone: 'Africa/Johannesburg', opensAt: '08:00', closesAt: '17:15', isHoliday: false, now }), false);
  assert.equal(isWithinClinicHours({ startsAt: new Date('2026-09-28T16:00:00.000Z'), endsAt: new Date('2026-09-28T16:30:00.000Z'), timeZone: 'Africa/Johannesburg', opensAt: '08:00', closesAt: '17:15', isHoliday: true, now }), false);
  assert.equal(isWithinClinicHours({ startsAt: new Date('2026-09-27T05:30:00.000Z'), endsAt: new Date('2026-09-27T06:00:00.000Z'), timeZone: 'Africa/Johannesburg', opensAt: '08:00', closesAt: '17:15', isHoliday: false, now }), false);
});