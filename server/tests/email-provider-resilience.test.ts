import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { EmailDeliveryError, OWNER_OTP_SENDER, type EmailTransport } from '../src/email.js';
import { sendOwnerFixture as sendOtpEmail } from './email-fixtures.js';

const settings = { NODE_ENV: 'production' as const, RESEND_API_KEY: 're_test_resilience_fixture_0123456789', RESEND_FROM_EMAIL: OWNER_OTP_SENDER };
const challenge = '00000000-0000-4000-8000-000000000011';
const reference = '00000000-0000-4000-8000-000000000012';
function transport(responses: Array<Response | Error>, budget = 10000) {
  let clock = 0;
  const calls: RequestInit[] = [], waits: number[] = [];
  return { calls, waits, options: {
    fetcher: async (_url, init) => {
      calls.push(init!);
      const result = responses.shift();
      if (result instanceof Error) throw result;
      assert.ok(result);
      return result;
    },
    now: () => clock,
    wait: async milliseconds => { waits.push(milliseconds); clock += milliseconds; },
    timeoutMs: budget,
  } satisfies Partial<EmailTransport> };
}

test('a lost provider response retries the identical code and key without issuing another email payload', async () => {
  const fixture = transport([new TypeError('private connection details'), Response.json({ id: reference })]);
  const result = await sendOtpEmail('patient@spu.ac.za', '123456', challenge, settings, 600, fixture.options);
  assert.equal(result.messageId, reference);
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[0].body, fixture.calls[1].body);
  assert.equal(new Headers(fixture.calls[0].headers).get('Idempotency-Key'), `otp/${challenge}`);
  assert.equal(new Headers(fixture.calls[1].headers).get('Idempotency-Key'), `otp/${challenge}`);
  assert.equal(JSON.stringify(result).includes('123456'), false);
  assert.match(JSON.parse(String(fixture.calls[0].body)).text, /10 minutes/);
});

test('temporary provider throttling waits for Retry-After then retries once within the same deadline', async () => {
  const fixture = transport([Response.json({ name: 'rate_limit_exceeded' }, { status: 429, headers: { 'Retry-After': '2' } }), Response.json({ id: reference })]);
  await sendOtpEmail('patient@spu.ac.za', '123456', challenge, settings, 600, fixture.options);
  assert.deepEqual(fixture.waits, [2000]);
  assert.equal(fixture.calls.length, 2);
});

test('a long Retry-After returns a safe retry hint instead of hanging the login request', async () => {
  const fixture = transport([Response.json({ name: 'rate_limit_exceeded' }, { status: 429, headers: { 'Retry-After': '60' } })]);
  await assert.rejects(sendOtpEmail('patient@spu.ac.za', '123456', challenge, settings, 600, fixture.options),
    (error: unknown) => error instanceof EmailDeliveryError && error.reason === 'rate_limited' && error.retryAfterSeconds === 60 && error.deliveryOutcome === 'not_sent');
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.waits, []);
});

for (const name of ['daily_quota_exceeded', 'monthly_quota_exceeded']) {
  test(`${name} never retries a provider quota rejection`, async () => {
    const fixture = transport([Response.json({ name }, { status: 429 })]);
    await assert.rejects(sendOtpEmail('patient@spu.ac.za', '123456', challenge, settings, 600, fixture.options), { reason: 'quota_exceeded', deliveryOutcome: 'not_sent' });
    assert.equal(fixture.calls.length, 1);
  });
}

for (const message of ['The fixture-clinic.co.za domain is not verified.', 'You can only send testing emails to your own email address.']) {
  test('unverified sender errors are classified without exposing provider text or retrying', async () => {
    const fixture = transport([Response.json({ name: 'validation_error', message }, { status: 403 })]);
    await assert.rejects(sendOtpEmail('patient@spu.ac.za', '123456', challenge, settings, 600, fixture.options),
      (error: unknown) => error instanceof EmailDeliveryError && error.reason === 'sender_unverified' && error.deliveryOutcome === 'not_sent' && !error.message.includes(message));
    assert.equal(fixture.calls.length, 1);
  });
}

test('a repeated provider outage makes at most two attempts and remains an unknown delivery', async () => {
  const fixture = transport([Response.json({}, { status: 503 }), Response.json({}, { status: 503 })]);
  await assert.rejects(sendOtpEmail('patient@spu.ac.za', '123456', challenge, settings, 600, fixture.options), { reason: 'provider_rejected', deliveryOutcome: 'unknown' });
  assert.equal(fixture.calls.length, 2);
});

test('pending code lifetime remains stable when the default lifetime changes before replay', async () => {
  const fixture = transport([Response.json({ id: reference })]);
  await sendOtpEmail('patient@spu.ac.za', '123456', challenge, { ...settings, OTP_VALIDITY_SECONDS: 900 }, 600, fixture.options);
  assert.match(JSON.parse(String(fixture.calls[0].body)).text, /10 minutes/);
  assert.doesNotMatch(JSON.parse(String(fixture.calls[0].body)).text, /15 minutes/);
});

test('the request deadline also aborts a stalled provider response body', async () => {
  const server = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.write('{'); });
  server.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  let attempts = 0;
  const started = performance.now();
  try {
    await assert.rejects(sendOtpEmail('patient@spu.ac.za', '123456', challenge, settings, 600, {
      fetcher: async (_url, init) => { attempts++; return fetch(`http://127.0.0.1:${address.port}`, init); },
      timeoutMs: 120,
      attemptTimeoutMs: 100,
    }), { reason: 'timeout', deliveryOutcome: 'unknown' });
    assert.equal(attempts, 1, 'the budget cannot accommodate a second attempt');
    assert.ok(performance.now() - started < 2000, 'the stalled body must not create an indefinite busy screen');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
