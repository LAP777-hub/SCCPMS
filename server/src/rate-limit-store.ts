import { createHmac } from 'node:crypto';
import type { Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import { pool } from './db.js';
import { config } from './config.js';
import { isVercelRuntime } from './runtime.js';

export class RateLimitStorageUnavailable extends Error {
  constructor() { super('Request limits are temporarily unavailable. Please retry shortly.'); }
}

export class PostgresRateLimitStore implements Store {
  localKeys = false;
  prefix: string;
  private windowMs = 60000;

  constructor(namespace: string) { this.prefix = `${namespace}:`; }
  init(options: Options) { this.windowMs = options.windowMs; }
  private key(value: string) {
    return this.prefix + createHmac('sha256', config.OTP_HMAC_SECRET).update(`request-limit:${value}`).digest('hex');
  }
  async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      const result = await pool.query<{ hits: number; reset_at: Date }>(
        `INSERT INTO api_rate_limits (bucket_key,hits,reset_at)
         VALUES ($1,1,clock_timestamp() + $2 * interval '1 millisecond')
         ON CONFLICT (bucket_key) DO UPDATE SET
           hits = CASE WHEN api_rate_limits.reset_at <= clock_timestamp() THEN 1 ELSE api_rate_limits.hits+1 END,
           reset_at = CASE WHEN api_rate_limits.reset_at <= clock_timestamp()
             THEN clock_timestamp() + $2 * interval '1 millisecond' ELSE api_rate_limits.reset_at END
         RETURNING hits,reset_at`, [this.key(key), this.windowMs]);
      return { totalHits: result.rows[0].hits, resetTime: new Date(result.rows[0].reset_at) };
    } catch { throw new RateLimitStorageUnavailable(); }
  }
  async decrement(key: string) {
    await pool.query('UPDATE api_rate_limits SET hits=GREATEST(hits-1,0) WHERE bucket_key=$1', [this.key(key)]);
  }
  async resetKey(key: string) {
    await pool.query('DELETE FROM api_rate_limits WHERE bucket_key=$1', [this.key(key)]);
  }
}

export function sharedRateLimitStore(namespace: string) {
  return isVercelRuntime ? new PostgresRateLimitStore(namespace) : undefined;
}
