import { Request, Response, NextFunction } from 'express';
import { i18n, SUPPORTED_LOCALES, isSupportedLocale } from '../i18n/translate.js';

export async function i18nMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const langHeader = req.headers['accept-language'] || '';
  const preferredLang = langHeader.split(',')[0]?.split(';')[0]?.toLowerCase();
  
  if (preferredLang && isSupportedLocale(preferredLang)) {
    await i18n.setLocale(preferredLang);
  }
  
  next();
}

export function setLocaleMiddleware(req: Request, res: Response, next: NextFunction): void {
  const locale = req.query.locale as string;
  
  if (locale && isSupportedLocale(locale)) {
    void i18n.setLocale(locale);
    res.setHeader('Content-Language', locale);
  }
  
  next();
}