import express, { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuth, requireOtp } from './auth.js';

export const PHOTO_BUCKET = 'profile-photos';
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export function boundedPhotoStorageFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1], timeoutMs = 10000) {
  const previousSignal = init?.signal ?? (input instanceof globalThis.Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(timeoutMs);
  return globalThis.fetch(input, { ...init, signal: previousSignal ? AbortSignal.any([previousSignal, timeout]) : timeout });
}
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: boundedPhotoStorageFetch },
});
function responseEnded(res: Response) { return res.headersSent || res.writableEnded || res.destroyed; }
function photoResponse(res: Response, status: number, body: object) {
  return responseEnded(res) ? res : res.status(status).json(body);
}
function ownPath(userId: string, path: unknown): path is string {
  return typeof path === 'string' && path.startsWith(`${userId}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(path);
}
export async function prepareProfilePhoto(input: Buffer, contentType: string) {
  if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_PHOTO_BYTES || !(contentType in formats)) throw new Error('Invalid profile image.');
  const image = sharp(input, { limitInputPixels: 16000000, failOn: 'warning', animated: false });
  const metadata = await image.metadata();
  if (metadata.format !== formats[contentType as keyof typeof formats] || (metadata.pages ?? 1) > 1) throw new Error('Invalid profile image.');
  // Decode/re-encode the pixels, auto-orient and omit EXIF/GPS and other metadata.
  return image.rotate().resize(512, 512, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}
async function photoData(userId: string, path: unknown) {
  if (!path) return { url: null };
  if (!ownPath(userId, path)) throw new Error('Invalid stored photo path.');
  const result = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, 900);
  if (result.error || !result.data?.signedUrl) throw new Error('Photo service unavailable.');
  return { url: result.data.signedUrl };
}
export async function getProfilePhoto(req: Request, res: Response) {
  if (responseEnded(res)) return res;
  res.set('Cache-Control', 'private, no-store');
  try { return photoResponse(res, 200, { data: await photoData(req.auth!.userId, req.auth!.profile.avatar_path) }); }
  catch { return photoResponse(res, 503, { error: 'Unable to load your profile photo. Retry shortly.' }); }
}
export async function putProfilePhoto(req: Request, res: Response) {
  if (responseEnded(res)) return res;
  res.set('Cache-Control', 'private, no-store');
  let image: Buffer;
  try { image = await prepareProfilePhoto(req.body, req.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''); }
  catch { return photoResponse(res, 422, { error: 'Choose a valid JPEG, PNG or WebP photo up to 5 MB (maximum 16 megapixels).' }); }
  if (responseEnded(res)) return res;
  const userId = req.auth!.userId;
  const path = `${userId}/${randomUUID()}.webp`;
  const storage = admin.storage.from(PHOTO_BUCKET);
  const uploaded = await storage.upload(path, image, { contentType: 'image/webp', upsert: false, cacheControl: '300' }).catch(() => null);
  if (!uploaded || uploaded.error) return photoResponse(res, 503, { error: 'Unable to upload your profile photo. Retry shortly.' });
  let previous: unknown;
  let commitAttempted = false;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const existing = await client.query('SELECT avatar_path FROM profiles WHERE id=$1 FOR UPDATE', [userId]);
    if (!existing.rowCount) throw new Error('Profile unavailable.');
    previous = existing.rows[0].avatar_path;
    await client.query('UPDATE profiles SET avatar_path=$2,updated_at=now() WHERE id=$1', [userId, path]);
    await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'profile.photo_updated','profile',$1)", [userId]);
    commitAttempted = true;
    await client.query('COMMIT');
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    // A lost COMMIT response is ambiguous. Retain the object rather than delete
    // a photo whose profile update may already have committed.
    if (!commitAttempted) await storage.remove([path]).catch(() => undefined);
    return photoResponse(res, 503, { error: 'Unable to finish saving your profile photo. Refresh and retry shortly.' });
  } finally { client?.release(); }
  if (ownPath(userId, previous)) await storage.remove([previous]).catch(() => undefined);
  if (responseEnded(res)) return res;
  try { return photoResponse(res, 200, { data: await photoData(userId, path) }); }
  catch { return photoResponse(res, 200, { data: { url: null }, message: 'Photo saved. Reload your profile to view it.' }); }
}
export async function deleteProfilePhoto(req: Request, res: Response) {
  if (responseEnded(res)) return res;
  res.set('Cache-Control', 'private, no-store');
  const userId = req.auth!.userId;
  let previous: unknown;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // A cached profile or request body may name an old/foreign object. Only the
    // locked caller-owned database row determines what can be removed.
    const existing = await client.query('SELECT avatar_path FROM profiles WHERE id=$1 FOR UPDATE', [userId]);
    if (!existing.rowCount) throw new Error('Profile unavailable.');
    previous = existing.rows[0].avatar_path;
    if (responseEnded(res)) {
      await client.query('ROLLBACK');
      return res;
    }
    if (previous !== null && previous !== undefined) {
      await client.query('UPDATE profiles SET avatar_path=NULL,updated_at=now() WHERE id=$1', [userId]);
      await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'profile.photo_removed','profile',$1)", [userId]);
    }
    await client.query('COMMIT');
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    // Never delete storage after an ambiguous COMMIT acknowledgement: the
    // profile may still reference the object if its transaction rolled back.
    return photoResponse(res, 503, { error: 'Unable to remove your profile photo. Refresh and retry shortly.' });
  } finally { client?.release(); }
  if (ownPath(userId, previous)) await admin.storage.from(PHOTO_BUCKET).remove([previous]).catch(() => undefined);
  return photoResponse(res, 200, { data: { url: null } });
}
const router = Router();
router.use(requireAuth, requireOtp);
router.get('/photo', getProfilePhoto);
router.put('/photo', express.raw({ type: Object.keys(formats), limit: MAX_PHOTO_BYTES }), putProfilePhoto);
router.delete('/photo', deleteProfilePhoto);
export default router;
