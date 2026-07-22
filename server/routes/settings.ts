/**
 * App Settings Routes (key-value store)
 *
 * Mounted at /api/app-settings so:
 * - GET /api/app-settings/:key
 * - PUT /api/app-settings/:key
 */
import { Router, type Request, type Response } from 'express';
import { t } from '../i18n/translate.js';
import {
  getAppSettings as dbGet,
  setAppSettings as dbSet,
} from '../dao/settings.js';

const router = Router();

router.get('/:key', (req: Request, res: Response) => {
  const value = dbGet(req.params.key);
  if (value === null) {
    res.status(404).json({ error: t('errors.notFound') });
    return;
  }
  try {
    const data = JSON.parse(value);
    res.json({ data });
  } catch {
    res.json({ data: value });
  }
});

router.put('/:key', (req: Request, res: Response) => {
  try {
    const value = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    dbSet(req.params.key, value);
    res.json({ ok: true, message: t('common.success') });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
