/**
 * 服务端 i18n 类型定义
 *
 * 定义服务端国际化系统的核心类型。
 */

export type LocaleCode = 'zh-CN' | 'en';

/**
 * Locale message tree. Leaf values are strings (or arrays of strings for
 * plural-friendly keys), while intermediate nodes are nested objects that
 * group related keys (e.g. `chat.messageCopied`).
 */
export type LocaleMessageValue =
  | string
  | string[]
  | { [key: string]: LocaleMessageValue };

export type LocaleMessages = Record<string, LocaleMessageValue>;

export type LocaleDefinition = {
  code: LocaleCode;
  name: string;
  nativeName: string;
  messages: LocaleMessages;
};

export type I18nRegistryOptions = {
  defaultLocale?: LocaleCode;
  fallbackLocale?: LocaleCode;
};

export type I18nFormatOptions = {
  locale?: LocaleCode;
  defaultValue?: string;
};

export type I18nChangeCallback = (locale: LocaleCode) => void;

export const SUPPORTED_LOCALES: LocaleCode[] = ['zh-CN', 'en'];

export const DEFAULT_LOCALE: LocaleCode = 'zh-CN';
export const FALLBACK_LOCALE: LocaleCode = 'en';
