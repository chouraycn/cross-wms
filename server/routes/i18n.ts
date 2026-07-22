import { Router, type Request, type Response } from 'express';
import { t, i18n } from '../i18n/translate.js';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n/registry.js';

const router = Router();

router.get('/locales', (_req: Request, res: Response) => {
  res.json({
    default: DEFAULT_LOCALE,
    supported: SUPPORTED_LOCALES,
    current: i18n.getLocale(),
    languages: SUPPORTED_LOCALES.map(locale => ({
      code: locale,
      name: t(`languages.${locale}`),
    })),
  });
});

router.get('/current', (_req: Request, res: Response) => {
  res.json({
    locale: i18n.getLocale(),
    message: t('server.ready'),
  });
});

router.post('/set', async (req: Request, res: Response) => {
  const { locale } = req.body as { locale?: string };
  
  if (!locale || !SUPPORTED_LOCALES.includes(locale as typeof SUPPORTED_LOCALES[0])) {
    return res.status(400).json({
      error: t('errors.invalid'),
      message: `${t('errors.invalid')}: ${t('common.locale')}`,
    });
  }
  
  await i18n.setLocale(locale as typeof SUPPORTED_LOCALES[0]);
  res.json({
    success: true,
    locale: i18n.getLocale(),
    message: t('common.success'),
  });
});

router.get('/translate/:key', (req: Request, res: Response) => {
  const { key } = req.params;
  const params = req.query as Record<string, string>;
  
  res.json({
    key,
    value: t(key, params),
    locale: i18n.getLocale(),
  });
});

export default router;