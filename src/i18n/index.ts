import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// ===================== 类型定义 =====================

/** 支持的语言代码 */
export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文', nativeName: '简体中文' },
  { code: 'zh-TW', name: '繁體中文', nativeName: '繁體中文' },
  { code: 'en-US', name: 'English', nativeName: 'English' },
  { code: 'ja-JP', name: '日本語', nativeName: '日本語' },
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['code'];

/** 命名空间定义 */
export const NAMESPACES = [
  'common',
  'sidebar',
  'chat',
  'models',
  'settings',
  'errors',
  'status',
  'wms',
  'skills',
  'slashCommands',
] as const;

export type I18nNamespace = typeof NAMESPACES[number];

/** 默认命名空间 */
export const DEFAULT_NAMESPACE: I18nNamespace = 'common';

/** 后备语言链 */
export const FALLBACK_LANGUAGE_CHAIN: Record<string, string[]> = {
  'zh-TW': ['zh-CN', 'en-US'],
  'zh-CN': ['en-US'],
  'ja-JP': ['en-US'],
  'en-US': [],
};

// ===================== 事件发射器 =====================

type EventHandler = (...args: unknown[]) => void;

class I18nEventEmitter {
  private events: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.events.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(...args);
        } catch {
          // ignore handler errors
        }
      });
    }
  }
}

export const i18nEvents = new I18nEventEmitter();

// ===================== 语言检测 =====================

function detectLanguage(): SupportedLanguage {
  // 优先从 localStorage 获取
  const savedLang = localStorage.getItem('app_language');
  if (savedLang && SUPPORTED_LANGUAGES.some((l) => l.code === savedLang)) {
    return savedLang as SupportedLanguage;
  }

  // 检测浏览器语言
  const browserLang = navigator.language || (navigator as Navigator & { userLanguage?: string }).userLanguage;
  if (browserLang) {
    // 精确匹配
    if (SUPPORTED_LANGUAGES.some((l) => l.code === browserLang)) {
      return browserLang as SupportedLanguage;
    }
    // 前缀匹配
    if (browserLang.startsWith('zh')) {
      return 'zh-CN';
    }
    if (browserLang.startsWith('ja')) {
      return 'ja-JP';
    }
    if (browserLang.startsWith('en')) {
      return 'en-US';
    }
  }

  return 'zh-CN';
}

// ===================== 动态加载语言包 =====================

const loadedLanguages = new Set<SupportedLanguage>();

/**
 * 动态加载语言包
 * @param locale - 语言代码
 * @param namespace - 命名空间（可选，不传则加载所有命名空间）
 */
export async function loadLanguage(
  locale: SupportedLanguage,
  namespace?: I18nNamespace,
): Promise<void> {
  const cacheKey = namespace ? `${locale}-${namespace}` : locale;
  if (loadedLanguages.has(cacheKey as SupportedLanguage)) {
    return;
  }

  try {
    if (namespace) {
      const module = await import(
        /* @vite-ignore */
        /* webpackChunkName: "i18n-[request]" */
        `./locales/${locale}.json`
      );
      const resources = module.default || module;
      const nsResources = resources[namespace] || {};
      i18n.addResourceBundle(locale, namespace, nsResources, true, false);
    } else {
      const module = await import(
        /* @vite-ignore */
        /* webpackChunkName: "i18n-[request]" */
        `./locales/${locale}.json`
      );
      const resources = module.default || module;

      // 将顶层 key 作为命名空间
      Object.keys(resources).forEach((ns) => {
        if (NAMESPACES.includes(ns as I18nNamespace)) {
          i18n.addResourceBundle(locale, ns, resources[ns], true, false);
        }
      });
    }

    loadedLanguages.add(cacheKey as SupportedLanguage);
  } catch {
      throw new Error(`Failed to load language ${locale}`);
    }
}

// ===================== 变量插值 =====================

/**
 * 变量插值 - 替换字符串中的 {{key}} 为对应的值
 * @param template - 模板字符串
 * @param params - 参数对象
 */
export function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

// ===================== 复数形式 =====================

/**
 * 复数形式处理
 * 格式: "{{count}} item | {{count}} items"
 * @param template - 模板字符串（用 | 分隔单数和复数形式）
 * @param count - 数量
 * @param params - 其他参数
 */
export function pluralize(
  template: string,
  count: number,
  params?: Record<string, unknown>,
): string {
  const forms = template.split('|').map((s) => s.trim());
  const form = count === 1 ? forms[0] : forms[forms.length - 1];
  return interpolate(form, { ...params, count });
}

// ===================== 日期格式化 =====================

/**
 * 格式化日期
 * @param date - 日期对象或时间戳
 * @param locale - 语言代码
 * @param options - Intl.DateTimeFormat 选项
 */
export function formatDate(
  date: Date | number | string,
  locale?: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = date instanceof Date ? date : new Date(date);
  const lang = locale || i18n.language || 'zh-CN';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };

  const fmt = new Intl.DateTimeFormat(lang, { ...defaultOptions, ...options });
  return fmt.format(d);
}

// ===================== 数字格式化 =====================

/**
 * 格式化数字
 * @param num - 数字
 * @param locale - 语言代码
 * @param options - Intl.NumberFormat 选项
 */
export function formatNumber(
  num: number,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string {
  const lang = locale || i18n.language || 'zh-CN';
  const fmt = new Intl.NumberFormat(lang, options);
  return fmt.format(num);
}

// ===================== 货币格式化 =====================

/**
 * 格式化货币
 * @param num - 金额
 * @param currency - 货币代码（默认 CNY）
 * @param locale - 语言代码
 * @param options - Intl.NumberFormat 选项
 */
export function formatCurrency(
  num: number,
  currency: string = 'CNY',
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string {
  const lang = locale || i18n.language || 'zh-CN';
  const defaultOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  const fmt = new Intl.NumberFormat(lang, { ...defaultOptions, ...options });
  return fmt.format(num);
}

// ===================== 后备语言解析 =====================

/**
 * 获取后备语言链
 * @param locale - 当前语言
 */
export function getFallbackChain(locale: string): string[] {
  return FALLBACK_LANGUAGE_CHAIN[locale] || ['en-US'];
}

/**
 * 翻译函数 - 支持命名空间、插值、复数
 * @param key - 翻译 key，支持 "namespace:key" 格式
 * @param params - 参数对象
 */
export function t(key: string, params?: Record<string, unknown>): string {
  let namespace = DEFAULT_NAMESPACE;
  let actualKey = key;

  // 解析命名空间
  if (key.includes(':')) {
    const parts = key.split(':');
    namespace = parts[0] as typeof namespace;
    actualKey = parts.slice(1).join(':');
  }

  // 使用 i18next 获取翻译
  const translation = i18n.t(`${namespace}:${actualKey}`, {
    defaultValue: key,
    ...params,
  });

  // 处理复数形式（如果 params 中有 count 且翻译包含 |）
  if (params?.count !== undefined && typeof translation === 'string' && translation.includes('|')) {
    return pluralize(translation, params.count, params);
  }

  return translation;
}

// ===================== 语言切换 =====================

/**
 * 切换语言
 * @param lang - 语言代码
 */
export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  const previousLang = i18n.language;

  if (previousLang === lang) return;

  // 动态加载语言包
  await loadLanguage(lang);

  // 切换语言
  await i18n.changeLanguage(lang);

  // 保存到 localStorage
  localStorage.setItem('app_language', lang);

  // 触发事件
  i18nEvents.emit('languageChanged', {
    previous: previousLang,
    current: lang,
  });
}

/**
 * 获取当前语言
 */
export function getCurrentLanguage(): SupportedLanguage {
  const lang = i18n.language;
  if (SUPPORTED_LANGUAGES.some((l) => l.code === lang)) {
    return lang as SupportedLanguage;
  }
  return 'zh-CN';
}

/**
 * 获取可用语言列表
 */
export function getAvailableLocales(): typeof SUPPORTED_LANGUAGES {
  return SUPPORTED_LANGUAGES;
}

// ===================== 初始化 =====================

// 预加载默认语言（同步导入以确保首次渲染可用）
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

function buildResources(localeData: Record<string, Record<string, unknown>>): Record<I18nNamespace, Record<string, unknown>> {
  const result: Record<I18nNamespace, Record<string, unknown>> = {};
  Object.keys(localeData).forEach((ns) => {
    if (NAMESPACES.includes(ns as I18nNamespace)) {
      result[ns as I18nNamespace] = localeData[ns];
    }
  });
  return result;
}

const savedLanguage = detectLanguage();

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': buildResources(zhCN),
    'en-US': buildResources(enUS),
  },
  lng: savedLanguage,
  fallbackLng: {
    'zh-TW': ['zh-CN', 'en-US'],
    'zh-CN': ['en-US'],
    'ja-JP': ['en-US'],
    default: ['en-US'],
  },
  ns: NAMESPACES as unknown as string[],
  defaultNS: DEFAULT_NAMESPACE,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

// 标记已加载的语言
loadedLanguages.add('zh-CN');
loadedLanguages.add('en-US');

// 跟踪上一个语言
let previousLanguage = savedLanguage;

// 监听 i18next 的语言切换事件
i18n.on('languageChanged', (lng) => {
  const prev = previousLanguage;
  previousLanguage = lng as SupportedLanguage;
  i18nEvents.emit('languageChanged', {
    previous: prev,
    current: lng,
  });
});

export default i18n;
