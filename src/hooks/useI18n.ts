import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  t as translate,
  changeLanguage as changeLang,
  getCurrentLanguage,
  getAvailableLocales,
  formatDate as fmtDate,
  formatNumber as fmtNumber,
  formatCurrency as fmtCurrency,
  i18nEvents,
  loadLanguage,
  type SupportedLanguage,
  type I18nNamespace,
  SUPPORTED_LANGUAGES,
} from '../i18n';

export interface UseI18nReturn {
  /** 翻译函数 */
  t: (key: string, params?: Record<string, unknown>) => string;
  /** 当前语言 */
  locale: SupportedLanguage;
  /** 切换语言 */
  setLocale: (locale: SupportedLanguage) => Promise<void>;
  /** 可用语言列表 */
  availableLocales: typeof SUPPORTED_LANGUAGES;
  /** 格式化日期 */
  formatDate: (date: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  /** 格式化数字 */
  formatNumber: (num: number, options?: Intl.NumberFormatOptions) => string;
  /** 格式化货币 */
  formatCurrency: (num: number, currency?: string, options?: Intl.NumberFormatOptions) => string;
  /** 加载语言包 */
  loadLanguage: (locale: SupportedLanguage, namespace?: string) => Promise<void>;
}

/**
 * useI18n Hook - 多语言功能 Hook
 *
 * 提供翻译、语言切换、日期/数字/货币格式化等功能。
 */
export function useI18n(): UseI18nReturn {
  const [locale, setLocaleState] = useState<SupportedLanguage>(() => getCurrentLanguage());

  // 监听语言切换事件
  useEffect(() => {
    const handler = (data: unknown) => {
      const { current } = data as { current: SupportedLanguage };
      setLocaleState(current);
    };

    const unsubscribe = i18nEvents.on('languageChanged', handler);
    return unsubscribe;
  }, []);

  /**
   * 翻译函数
   * @param key - 翻译 key，支持 "namespace:key" 格式
   * @param params - 参数对象（用于插值、复数等）
   */
  const t = useCallback((key: string, params?: Record<string, unknown>): string => {
    return translate(key, params);
  }, []);

  /**
   * 切换语言
   * @param newLocale - 目标语言代码
   */
  const setLocale = useCallback(async (newLocale: SupportedLanguage): Promise<void> => {
    await changeLang(newLocale);
  }, []);

  /**
   * 格式化日期
   * @param date - 日期对象或时间戳
   * @param options - Intl.DateTimeFormat 选项
   */
  const formatDate = useCallback(
    (date: Date | number | string, options?: Intl.DateTimeFormatOptions): string => {
      return fmtDate(date, locale, options);
    },
    [locale],
  );

  /**
   * 格式化数字
   * @param num - 数字
   * @param options - Intl.NumberFormat 选项
   */
  const formatNumber = useCallback(
    (num: number, options?: Intl.NumberFormatOptions): string => {
      return fmtNumber(num, locale, options);
    },
    [locale],
  );

  /**
   * 格式化货币
   * @param num - 金额
   * @param currency - 货币代码（默认 CNY）
   * @param options - Intl.NumberFormat 选项
   */
  const formatCurrency = useCallback(
    (num: number, currency: string = 'CNY', options?: Intl.NumberFormatOptions): string => {
      return fmtCurrency(num, currency, locale, options);
    },
    [locale],
  );

  /**
   * 动态加载语言包
   * @param localeToLoad - 语言代码
   * @param namespace - 命名空间（可选）
   */
  const loadLang = useCallback(async (localeToLoad: SupportedLanguage, namespace?: string): Promise<void> => {
    await loadLanguage(localeToLoad, namespace as I18nNamespace | undefined);
  }, []);

  const availableLocales = useMemo(() => getAvailableLocales(), []);

  return {
    t,
    locale,
    setLocale,
    availableLocales,
    formatDate,
    formatNumber,
    formatCurrency,
    loadLanguage: loadLang,
  };
}

export default useI18n;
