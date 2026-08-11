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
import { ok, fail, notFound, BizCode } from './_shared/respond.js';

const router = Router();

router.get('/:key', (req: Request, res: Response) => {
  const value = dbGet(req.params.key);
  if (value === null) {
    return notFound(res, t('errors.notFound'));
  }
  try {
    const data = JSON.parse(value);
    return ok(res, data);
  } catch {
    return ok(res, value);
  }
});

router.put('/:key', (req: Request, res: Response) => {
  try {
    const value = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    dbSet(req.params.key, value);
    return ok(res, { ok: true }, t('common.success'));
  } catch (e) {
    return fail(res, BizCode.BAD_REQUEST, (e as Error).message, 400);
  }
});

export default router;
