import { Router } from 'express';
import { requireAuth, requireOtp, allowRoles } from './auth.js';
import { pool } from './db.js';
import { adminOverview } from './admin-overview.js';

const router = Router();
router.get('/admin/overview', requireAuth, requireOtp, allowRoles('admin'), async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try { return res.json({ data: await adminOverview(pool) }); }
  catch { return res.status(503).json({ error: 'Unable to load the dashboard overview. Retry shortly.' }); }
});
export default router;
