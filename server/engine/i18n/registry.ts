/**
 * i18n 注册中心
 *
 * 服务端国际化系统的核心注册和管理模块。
 */

import { logger } from '../../logger.js';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  type LocaleCode,
  type LocaleDefinition,
  type LocaleMessages,
  type LocaleMessageValue,
  type I18nRegistryOptions,
  type I18nFormatOptions,
  type I18nChangeCallback,
} from './types.js';
import { zhCNMessages } from './locales/zh-CN.js';
import { enMessages } from './locales/en.js';

export class I18nRegistry {
  private currentLocale: LocaleCode;
  private fallbackLocale: LocaleCode;
  private locales: Map<LocaleCode, LocaleDefinition> = new Map();
  private changeListeners: Set<I18nChangeCallback> = new Set();

  constructor(options: I18nRegistryOptions = {}) {
    this.currentLocale = options.defaultLocale ?? DEFAULT_LOCALE;
    this.fallbackLocale = options.fallbackLocale ?? FALLBACK_LOCALE;

    this.registerLocale({
      code: 'zh-CN',
      name: '简体中文',
      nativeName: '简体中文',
      messages: zhCNMessages,
    });

    this.registerLocale({
      code: 'en',
      name: 'English',
      nativeName: 'English',
      messages: enMessages,
    });
  }

  registerLocale(definition: LocaleDefinition): void {
    this.locales.set(definition.code, definition);
    logger.debug(`[I18n] Registered locale: ${definition.code}`);
  }

  unregisterLocale(code: LocaleCode): void {
    if (code === this.currentLocale) {
      logger.warn(`[I18n] Cannot unregister current locale: ${code}`);
      return;
    }
    this.locales.delete(code);
    logger.debug(`[I18n] Unregistered locale: ${code}`);
  }

  getLocaleDefinition(code: LocaleCode): LocaleDefinition | undefined {
    return this.locales.get(code);
  }

  hasLocale(code: LocaleCode): boolean {
    return this.locales.has(code);
  }

  listLocales(): LocaleDefinition[] {
    return Array.from(this.locales.values());
  }

  getSupportedLocales(): LocaleCode[] {
    return SUPPORTED_LOCALES;
  }

  setLocale(code: LocaleCode): boolean {
    if (!this.locales.has(code)) {
      logger.warn(`[I18n] Locale not found: ${code}`);
      return false;
    }
    if (this.currentLocale === code) {
      return true;
    }
    this.currentLocale = code;
    logger.debug(`[I18n] Locale changed to: ${code}`);
    this.notifyChange(code);
    return true;
  }

  getLocale(): LocaleCode {
    return this.currentLocale;
  }

  setFallbackLocale(code: LocaleCode): void {
    this.fallbackLocale = code;
  }

  getFallbackLocale(): LocaleCode {
    return this.fallbackLocale;
  }

  addChangeListener(callback: I18nChangeCallback): void {
    this.changeListeners.add(callback);
  }

  removeChangeListener(callback: I18nChangeCallback): void {
    this.changeListeners.delete(callback);
  }

  private notifyChange(locale: LocaleCode): void {
    for (const listener of this.changeListeners) {
      try {
        listener(locale);
      } catch (err) {
        logger.error(`[I18n] Change listener error: ${String(err)}`);
      }
    }
  }

  t(key: string, options: I18nFormatOptions = {}): string {
    const locale = options.locale ?? this.currentLocale;
    const messages = this.getMessages(locale);
    const value = this.resolveMessage(messages, key);

    if (value !== undefined) {
      return typeof value === 'string' ? value : String(value);
    }

    if (locale !== this.fallbackLocale) {
      const fallbackMessages = this.getMessages(this.fallbackLocale);
      const fallbackValue = this.resolveMessage(fallbackMessages, key);
      if (fallbackValue !== undefined) {
        return typeof fallbackValue === 'string' ? fallbackValue : String(fallbackValue);
      }
    }

    return options.defaultValue ?? key;
  }

  has(key: string, options: I18nFormatOptions = {}): boolean {
    const locale = options.locale ?? this.currentLocale;
    const messages = this.getMessages(locale);
    return this.resolveMessage(messages, key) !== undefined;
  }

  private getMessages(locale: LocaleCode): LocaleMessages {
    const definition = this.locales.get(locale);
    return definition?.messages ?? {};
  }

  private resolveMessage(messages: LocaleMessages, key: string): LocaleMessageValue | undefined {
    const parts = key.split('.');
    let current: LocaleMessageValue | undefined = messages;

    for (const part of parts) {
      if (
        current !== null &&
        typeof current === 'object' &&
        !Array.isArray(current) &&
        part in (current as Record<string, LocaleMessageValue>)
      ) {
        current = (current as Record<string, LocaleMessageValue>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  format(key: string, params: Record<string, string | number>, options: I18nFormatOptions = {}): string {
    const template = this.t(key, options);
    return template.replace(/\{(\w+)\}/g, (_, name) => {
      const value = params[name];
      return value !== undefined ? String(value) : `{${name}}`;
    });
  }

  plural(key: string, count: number, options: I18nFormatOptions = {}): string {
    const pluralKey = count === 1 ? key : `${key}_plural`;
    const message = this.t(pluralKey, { ...options, defaultValue: this.t(key, options) });
    return message.replace(/\{count\}/g, String(count));
  }

  clear(): void {
    this.locales.clear();
    this.changeListeners.clear();
    this.currentLocale = DEFAULT_LOCALE;
    this.fallbackLocale = FALLBACK_LOCALE;
  }
}

export const i18nRegistry = new I18nRegistry();

export function t(key: string, options?: I18nFormatOptions): string {
  return i18nRegistry.t(key, options);
}

export function format(key: string, params: Record<string, string | number>, options?: I18nFormatOptions): string {
  return i18nRegistry.format(key, params, options);
}

export function setLocale(code: LocaleCode): boolean {
  return i18nRegistry.setLocale(code);
}

export function getLocale(): LocaleCode {
  return i18nRegistry.getLocale();
}

export function hasLocale(code: LocaleCode): boolean {
  return i18nRegistry.hasLocale(code);
}

export function listLocales(): LocaleDefinition[] {
  return i18nRegistry.listLocales();
}
