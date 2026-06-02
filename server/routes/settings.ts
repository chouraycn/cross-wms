/**
 * App Settings Routes (key-value store)
 *
 * Mounted at /api/app-settings so:
 * - GET /api/app-settings/:key
 * - PUT /api/app-settings/:key
 */
import { Router, type Request, type Response } from 'express';
import {
  getAppSettings as dbGet,
  setAppSettings as dbSet,
} from '../db.js';

const router = Router();

// GET /api/app-settings/:key
router.get('/:key', (req: Request, res: Response) => {
  const value = dbGet(req.params.key);
  if (value === null) {
    res.status(404).json({ error: 'Settings not found' });
    return;
  }
  try {
    const data = JSON.parse(value);
    res.json({ data });
  } catch {
    // Return raw string if not valid JSON
    res.json({ data: value });
  }
});

// PUT /api/app-settings/:key
router.put('/:key', (req: Request, res: Response) => {
  try {
    const value = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    dbSet(req.params.key, value);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
