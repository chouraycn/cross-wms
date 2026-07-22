import { Router } from 'express';
import { t } from '../i18n/translate.js';

const router = Router();

router.get('/', (_req, res) => res.json({ status: t('common.ok'), time: new Date().toISOString(), message: t('server.ready') }));

export default router;
