import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  previousLabStatuses,
  schedulingConflict,
  validClinicTime,
} from '../src/workflow-policy.js';

test('clinic time validation rejects impossible clock values', () => {
  assert.equal(validClinicTime('08:00'), true);
  assert.equal(validClinicTime('23:59'), true);
  for (const time of ['24:00', '08:60', '8:30', '99:99'])
    assert.equal(validClinicTime(time), false);
});

test('lab updates allow results and cancellation only before terminal states', () => {
  assert.deepEqual(previousLabStatuses('collected'), ['ordered']);
  assert.deepEqual(previousLabStatuses('processing'), ['collected']);
  assert.equal(previousLabStatuses('resulted').includes('resulted'), false);
  assert.equal(previousLabStatuses('cancelled').includes('resulted'), false);
  assert.equal(previousLabStatuses('resulted').includes('cancelled'), false);
});

test('schedule concurrency failures are conflicts rather than partial success', () => {
  for (const code of ['23P01', '40P01', '40001']) assert.equal(schedulingConflict({ code }), true);
  assert.equal(schedulingConflict({ code: 'ECONNREFUSED' }), false);
  assert.equal(schedulingConflict(null), false);
});
