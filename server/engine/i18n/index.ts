/**
 * 服务端 i18n 模块 - Barrel 导出
 *
 * 汇总服务端国际化系统的全部功能。
 */

// 类型定义
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
} from './types.js';
export type {
  LocaleCode,
  LocaleMessages,
  LocaleDefinition,
  I18nRegistryOptions,
  I18nFormatOptions,
  I18nChangeCallback,
} from './types.js';

// 注册中心
export {
  I18nRegistry,
  i18nRegistry,
  t,
  format,
  setLocale,
  getLocale,
  hasLocale,
  listLocales,
} from './registry.js';

// Locales
export { zhCNMessages } from './locales/zh-CN.js';
export { enMessages } from './locales/en.js';
