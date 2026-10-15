import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportRange, ReportRangeError } from '../src/operations-report.js';

test('report defaults include thirty calendar days and use a supplied end date', () => {
  assert.deepEqual(reportRange('2026-10-15'), { from:'2026-09-16',to:'2026-10-15' });
  assert.deepEqual(reportRange('2026-10-15',undefined,'2024-03-01'), { from:'2024-02-01',to:'2024-03-01' });
});
test('report accepts one day and an inclusive 366-day leap-year range', () => {
  assert.deepEqual(reportRange('2026-10-15','2024-01-01','2024-12-31'),{from:'2024-01-01',to:'2024-12-31'});
  assert.deepEqual(reportRange('2026-10-15','2026-10-15','2026-10-15'),{from:'2026-10-15',to:'2026-10-15'});
});
test('oversized, reversed and future-start-only reports are rejected before series generation', () => {
  for (const [from,to] of [['2024-01-01','2025-01-01'],['2026-10-16','2026-10-15'],['2026-10-16',undefined]]) {
    assert.throws(()=>reportRange('2026-10-15',from,to),ReportRangeError);
  }
});
