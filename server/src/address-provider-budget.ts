import { createHash } from 'node:crypto';
import { pool } from './db.js';
import { AddressSearchUnavailable } from './address-search.js';

export async function reserveAddressSearchSlot(endpoint: string, intervalMs: number, dailyLimit: number) {
  try {
    const result = await pool.query<{ delay_ms: number }>(
      `INSERT INTO address_provider_budget (provider_key,budget_day,requests,next_request_at)
       VALUES ($1,(clock_timestamp() AT TIME ZONE 'UTC')::date,1,clock_timestamp()+$2*interval '1 millisecond')
       ON CONFLICT (provider_key) DO UPDATE SET
         requests=CASE WHEN address_provider_budget.budget_day <> (clock_timestamp() AT TIME ZONE 'UTC')::date
           THEN 1 ELSE address_provider_budget.requests+1 END,
         budget_day=(clock_timestamp() AT TIME ZONE 'UTC')::date,
         next_request_at=GREATEST(address_provider_budget.next_request_at,clock_timestamp())+$2*interval '1 millisecond'
       WHERE (address_provider_budget.budget_day <> (clock_timestamp() AT TIME ZONE 'UTC')::date OR address_provider_budget.requests < $3)
         AND address_provider_budget.next_request_at <= clock_timestamp()+interval '2200 milliseconds'
       RETURNING CEIL(GREATEST(0,EXTRACT(epoch FROM (next_request_at-$2*interval '1 millisecond'-clock_timestamp()))*1000))::int AS delay_ms`,
      [createHash('sha256').update(endpoint).digest('hex'), intervalMs, dailyLimit]);
    if (!result.rows.length) throw new Error('Provider budget unavailable.');
    return result.rows[0].delay_ms;
  } catch { throw new AddressSearchUnavailable('Address search is busy. Enter your residential address manually or retry shortly.'); }
}
