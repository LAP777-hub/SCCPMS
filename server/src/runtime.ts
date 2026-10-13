import { attachDatabasePool, waitUntil } from '@vercel/functions';
import type { Pool } from 'pg';

export const isVercelRuntime = process.env.VERCEL === '1';

export function manageDatabasePool(pool: Pool) {
  if (isVercelRuntime) attachDatabasePool(pool);
}

// Keep access-audit writes alive after the response when a function suspends.
// Callers handle failures before registering work, so rejections are not lost.
export function keepRequestWork(work: Promise<unknown>) {
  if (isVercelRuntime) waitUntil(work);
  else void work;
}
