import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Request, Response as ExpressResponse } from 'express';
import sharp from 'sharp';
import { pool } from '../src/db.js';
import { boundedPhotoStorageFetch, getProfilePhoto, putProfilePhoto, prepareProfilePhoto, MAX_PHOTO_BYTES } from '../src/profile-photo.routes.js';

const userId = '00000000-0000-4000-8000-000000000201';
const oldPath = `${userId}/00000000-0000-4000-8000-000000000202.webp`;
afterEach(() => mock.restoreAll());
async function image(format: 'png' | 'jpeg' | 'webp' = 'png') {
  return sharp({ create: { width: 720, height: 640, channels: 3, background: '#647d91' } }).withMetadata().toFormat(format).toBuffer();
}
function response() {
  const result = { status: 200, body: null as any, writes: 0, headerWrites: 0 };
  const ended = () => res.headersSent || res.writableEnded || res.destroyed;
  const res = {
    headersSent: false, writableEnded: false, destroyed: false,
    set() { assert.equal(ended(), false, 'headers must not be changed after the response ends'); result.headerWrites++; return res; },
    status(code: number) { assert.equal(ended(), false, 'response status must not be changed after it ends'); result.status = code; return res; },
    json(body: unknown) { assert.equal(ended(), false, 'a completed response must not receive another JSON write'); result.body = body; result.writes++; res.headersSent = true; res.writableEnded = true; return res; },
  };
  return { result, res: res as unknown as ExpressResponse, close(flag: 'headersSent' | 'writableEnded' | 'destroyed' = 'headersSent') { res[flag] = true; } };
}
const request = (body?: Buffer, avatarPath: unknown = oldPath) => ({ body, auth: { userId, profile: { avatar_path: avatarPath } }, get: () => 'image/png' }) as unknown as Request;

test('photos are decoded, resized, converted and stripped of metadata for each supported input', async () => {
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const output = await prepareProfilePhoto(await image(format), `image/${format}`);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 512); assert.equal(metadata.height, 512);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
  }
});
test('invalid, oversized, unsupported or falsely labelled images are rejected', async () => {
  for (const [body, type] of [[Buffer.from('<svg><script>alert(1)</script></svg>'), 'image/svg+xml'], [Buffer.from('not an image'), 'image/png'], [Buffer.alloc(MAX_PHOTO_BYTES + 1), 'image/png'], [await image('jpeg'), 'image/png']] as const) {
    await assert.rejects(prepareProfilePhoto(body, type));
  }
  const oversizedPixels = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(prepareProfilePhoto(oversizedPixels, 'image/png'));
});
test('photo reads cannot sign another account path and empty photos need no storage request', async () => {
  const fetcher = mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected storage request'); });
  for (const path of [null, '00000000-0000-4000-8000-000000000203/photo.webp']) {
    const { result, res } = response(); await getProfilePhoto(request(undefined, path), res);
    assert.equal(result.status, path === null ? 200 : 503);
  }
  assert.equal(fetcher.mock.calls.length, 0);
});
function storageFixture(failUpload = false, beforeResponse?: (call: { method: string; path: string; body?: unknown }) => void | Promise<void>) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    assert.match(url.pathname, /^\/storage\/v1\//);
    assert.ok(init?.signal, 'every storage request has an abort deadline');
    await beforeResponse?.(calls[calls.length - 1]);
    if (url.pathname.includes('/object/sign/')) return Response.json({ signedURL: '/object/sign/profile-photos/fixture?token=fixture-only' });
    if (method === 'DELETE') return Response.json([]);
    return failUpload ? Response.json({ statusCode: 503, message: 'Fixture outage' }, { status: 503 }) : Response.json({ Key: 'fixture', Id: 'fixture' });
  });
  return calls;
}
function databaseFixture(failAt?: 'UPDATE' | 'COMMIT') {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  mock.method(pool, 'connect', async () => ({ query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values }); if (failAt && sql.startsWith(failAt)) throw new Error('Fixture database outage');
    return { rowCount: 1, rows: sql.startsWith('SELECT avatar_path') ? [{ avatar_path: oldPath }] : [] };
  }, release() {} }));
  return calls;
}
test('upload stores only reencoded own-user content, persists its path and audit, then removes the replaced photo', async () => {
  const storage = storageFixture(), database = databaseFixture();
  const { result, res } = response(); await putProfilePhoto(request(await image()), res);
  assert.equal(result.status, 200); assert.ok(result.body.data.url);
  const update = database.find(call => call.sql.startsWith('UPDATE profiles'))!;
  assert.equal(update.values?.[0], userId); assert.match(String(update.values?.[1]), new RegExp(`^${userId}/[0-9a-f-]{36}\\.webp$`));
  assert.ok(database.some(call => call.sql.includes('profile.photo_updated')));
  assert.deepEqual(storage.find(call => call.method === 'DELETE')?.body, { prefixes: [oldPath] });
});
test('failed storage upload leaves profile and audit untouched', async () => {
  storageFixture(true); const database = databaseFixture();
  const { result, res } = response(); await putProfilePhoto(request(await image()), res);
  assert.equal(result.status, 503); assert.equal(database.length, 0);
});
test('a rolled-back profile update cleans its new upload without deleting the previous photo', async () => {
  const storage = storageFixture(); databaseFixture('UPDATE');
  const { result, res } = response(); await putProfilePhoto(request(await image()), res);
  assert.equal(result.status, 503);
  const cleanup = storage.find(call => call.method === 'DELETE')?.body as { prefixes: string[] };
  assert.ok(cleanup.prefixes[0].startsWith(`${userId}/`)); assert.notEqual(cleanup.prefixes[0], oldPath);
});
test('an uncertain commit retains both objects so it cannot destroy a successfully committed photo', async () => {
  const storage = storageFixture(); databaseFixture('COMMIT');
  const { result, res } = response(); await putProfilePhoto(request(await image()), res);
  assert.equal(result.status, 503); assert.equal(storage.filter(call => call.method === 'DELETE').length, 0);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(complete => { resolve = complete; });
  return { promise, resolve };
}

test('completed or disconnected responses start no storage or database work and receive no headers', async () => {
  const calls = storageFixture(), database = databaseFixture();
  const photo = await image();
  for (const flag of ['headersSent', 'writableEnded', 'destroyed'] as const) {
    for (const handler of [getProfilePhoto, putProfilePhoto]) {
      const { res, result, close } = response(); close(flag);
      await handler(request(photo), res);
      assert.equal(result.writes, 0); assert.equal(result.headerWrites, 0);
    }
  }
  assert.equal(calls.length, 0); assert.equal(database.length, 0);
});

test('a response ending during photo preparation cannot start a fresh upload', async () => {
  const calls = storageFixture(), database = databaseFixture();
  const { res, result, close } = response();
  const req = request(await image());
  req.get = (() => { close(); return 'image/png'; }) as Request['get'];
  await putProfilePhoto(req, res);
  assert.equal(calls.length, 0); assert.equal(database.length, 0); assert.equal(result.writes, 0);
});

test('a delayed signing result or failure never writes after a timeout response', async () => {
  for (const fail of [false, true]) {
    const entered = deferred(), release = deferred();
    const calls = storageFixture(false, async call => {
      if (call.path.includes('/object/sign/')) { entered.resolve(); await release.promise; if (fail) throw new Error('Fixture signing outage'); }
    });
    const { res, result, close } = response();
    const work = getProfilePhoto(request(), res);
    await entered.promise; close(); release.resolve(); await work;
    assert.equal(calls.length, 1); assert.equal(result.writes, 0);
    mock.restoreAll();
  }
});

test('a storage upload acknowledged after timeout still commits and cleans the prior photo without a second response', async () => {
  const entered = deferred(), release = deferred();
  const storage = storageFixture(false, async call => {
    if (call.method === 'POST' && !call.path.includes('/object/sign/')) { entered.resolve(); await release.promise; }
  });
  const database = databaseFixture(); const { res, result, close } = response();
  const work = putProfilePhoto(request(await image()), res);
  await entered.promise; close(); release.resolve(); await work;
  assert.equal(result.writes, 0);
  assert.ok(database.some(call => call.sql === 'COMMIT'));
  assert.ok(database.some(call => call.sql.includes('profile.photo_updated')));
  assert.deepEqual(storage.filter(call => call.method === 'DELETE').map(call => call.body), [{ prefixes: [oldPath] }]);
  assert.equal(storage.some(call => call.path.includes('/object/sign/')), false);
});

test('a delayed failed upload produces no database write or second response after timeout', async () => {
  const entered = deferred(), release = deferred();
  storageFixture(true, async () => { entered.resolve(); await release.promise; });
  const database = databaseFixture(); const { res, result, close } = response();
  const work = putProfilePhoto(request(await image()), res);
  await entered.promise; close('writableEnded'); release.resolve(); await work;
  assert.equal(result.writes, 0); assert.equal(database.length, 0);
});

test('a response ending during old-photo cleanup never signs another URL or deletes the committed object', async () => {
  const entered = deferred(), release = deferred();
  const storage = storageFixture(false, async call => { if (call.method === 'DELETE') { entered.resolve(); await release.promise; } });
  const database = databaseFixture(); const { res, result, close } = response();
  const work = putProfilePhoto(request(await image()), res);
  await entered.promise; assert.ok(database.some(call => call.sql === 'COMMIT'));
  close('destroyed'); release.resolve(); await work;
  assert.equal(result.writes, 0);
  assert.deepEqual(storage.filter(call => call.method === 'DELETE').map(call => call.body), [{ prefixes: [oldPath] }]);
  assert.equal(storage.some(call => call.path.includes('/object/sign/')), false);
});

test('rollback cleanup finishing after timeout cannot send an error to the completed response', async () => {
  const entered = deferred(), release = deferred();
  const storage = storageFixture(false, async call => { if (call.method === 'DELETE') { entered.resolve(); await release.promise; } });
  const database = databaseFixture('UPDATE'); const { res, result, close } = response();
  const work = putProfilePhoto(request(await image()), res);
  await entered.promise; close(); release.resolve(); await work;
  assert.equal(result.writes, 0); assert.ok(database.some(call => call.sql === 'ROLLBACK'));
  assert.equal(storage.filter(call => call.method === 'DELETE').length, 1);
  const cleaned = storage.find(call => call.method === 'DELETE')?.body as { prefixes: string[] };
  assert.notEqual(cleaned.prefixes[0], oldPath);
});

test('storage fetch aborts a stalled sign, upload and removal and preserves caller cancellation', async () => {
  mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    assert.ok(signal);
    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  // AbortSignal.timeout uses an unref timer. Keep this isolated assertion alive
  // until its tiny injected deadline fires; no real storage request is made.
  const keepAlive = setTimeout(() => undefined, 1000);
  try {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      await assert.rejects(boundedPhotoStorageFetch('https://clinic-ci.supabase.co/storage/v1/fixture', { method }, 10), { name: 'TimeoutError' });
    }
    const caller = new AbortController();
    const cancellation = new Error('Fixture caller cancellation');
    const pending = boundedPhotoStorageFetch('https://clinic-ci.supabase.co/storage/v1/fixture', { signal: caller.signal });
    caller.abort(cancellation);
    await assert.rejects(pending, error => error === cancellation);
    const requestController = new AbortController();
    const inherited = boundedPhotoStorageFetch(new Request('https://clinic-ci.supabase.co/storage/v1/fixture', { signal: requestController.signal }));
    requestController.abort(cancellation);
    await assert.rejects(inherited, error => error === cancellation);
  } finally { clearTimeout(keepAlive); }
});
