import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { AddressSearch } from './address-search.js';
import { sharedRateLimitStore } from './rate-limit-store.js';
import { isVercelRuntime } from './runtime.js';
import { reserveAddressSearchSlot } from './address-provider-budget.js';
import { residenceSuggestions } from './residence-catalogue.js';

const router = Router();
const search = new AddressSearch({ endpoint: config.ADDRESS_PHOTON_URL, intervalMs: config.ADDRESS_SEARCH_INTERVAL_MS, dailyLimit: config.ADDRESS_SEARCH_DAILY_LIMIT,
  ...(isVercelRuntime ? { reserveSlot: () => reserveAddressSearchSlot(config.ADDRESS_PHOTON_URL, config.ADDRESS_SEARCH_INTERVAL_MS, config.ADDRESS_SEARCH_DAILY_LIMIT) } : {}) });
const querySchema = z.object({ q: z.string().trim().min(3).max(200) }).strict();
router.use(rateLimit({ store: sharedRateLimitStore('address-search'), windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Address search is busy. Enter your address manually or retry shortly.' } }));
router.get('/addresses', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const query = querySchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Enter between 3 and 200 characters to search Kimberley addresses.' });
  const residences = residenceSuggestions(query.data.q);
  try {
    const mapped = await search.search(query.data.q);
    return res.json({ data: [...mapped, ...residences], provider: 'Photon and SPU housing catalogue', attribution: '© OpenStreetMap contributors; Sol Plaatje University' });
  } catch {
    // Official names remain searchable during a map outage. No street address
    // or coordinates are invented for catalogue-only residence matches.
    if (residences.length) return res.json({ data: residences, provider: 'SPU housing catalogue', warning: 'Map search is unavailable. Published residence names are still available.', attribution: 'Sol Plaatje University' });
    return res.status(503).json({ error: 'Address search is temporarily unavailable. Enter your residential address manually or retry shortly.' });
  }
});
export default router;
