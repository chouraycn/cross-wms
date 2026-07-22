import { logger } from '../../../logger.js';
import { getI18nConfig, getSupportedLocales } from './i18n.js';

export function detectLocale(): string {
  const envLocale = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES;

  if (envLocale) {
    const parsed = normalizeLocale(envLocale);
    if (isLocaleSupported(parsed)) {
      logger.debug(`[I18n] Detected locale from environment: ${parsed}`);
      return parsed;
    }

    const fallback = getFallbackLocale(parsed);
    if (fallback) {
      logger.debug(`[I18n] Detected locale ${parsed} not supported, falling back to ${fallback}`);
      return fallback;
    }
  }

  const config = getI18nConfig();
  logger.debug(`[I18n] Using default locale: ${config.defaultLocale}`);
  return config.defaultLocale;
}

export function normalizeLocale(locale: string): string {
  if (!locale) return '';

  const normalized = locale
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');

  const parts = normalized.split('.')[0].split('-');

  if (parts.length === 1) {
    return parts[0];
  }

  const language = parts[0];
  const region = parts[1].toUpperCase();

  return `${language}-${region}`;
}

export function isLocaleSupported(locale: string): boolean {
  const normalized = normalizeLocale(locale);
  const supported = getSupportedLocales();

  return supported.includes(normalized);
}

export function getFallbackLocale(locale: string): string | undefined {
  const normalized = normalizeLocale(locale);
  const supported = getSupportedLocales();
  const config = getI18nConfig();

  if (supported.includes(normalized)) {
    return normalized;
  }

  const language = normalized.split('-')[0];

  const languageMatch = supported.find((l) => l.startsWith(`${language}-`));
  if (languageMatch) {
    return languageMatch;
  }

  if (supported.includes(language)) {
    return language;
  }

  if (config.fallback) {
    return config.defaultLocale;
  }

  return undefined;
}
