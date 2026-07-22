import type { Locale, TranslationMap } from "./types";

type LazyLocale = Exclude<Locale, "en">;
type LocaleModule = Record<string, TranslationMap>;

type LazyLocaleRegistration = {
  exportName: string;
  loader: () => Promise<LocaleModule>;
};

export const DEFAULT_LOCALE: Locale = "en";

const LAZY_LOCALES: readonly LazyLocale[] = [
  "zh-CN",
  "zh-TW",
  "de",
  "es",
  "ja-JP",
];

const LAZY_LOCALE_REGISTRY: Record<LazyLocale, LazyLocaleRegistration> = {
  "zh-CN": {
    exportName: "zh_CN",
    loader: () => import("./locales/zh-CN"),
  },
  "zh-TW": {
    exportName: "zh_TW",
    loader: () => import("./locales/zh-TW"),
  },
  de: {
    exportName: "de",
    loader: () => import("./locales/de"),
  },
  es: {
    exportName: "es",
    loader: () => import("./locales/es"),
  },
  "ja-JP": {
    exportName: "ja_JP",
    loader: () => import("./locales/ja-JP"),
  },
};

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = [DEFAULT_LOCALE, ...LAZY_LOCALES];

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && SUPPORTED_LOCALES.includes(value as Locale);
}

function isLazyLocale(locale: Locale): locale is LazyLocale {
  return LAZY_LOCALES.includes(locale as LazyLocale);
}

export function resolveNavigatorLocale(navLang: string): Locale {
  if (navLang.startsWith("zh")) {
    return navLang === "zh-TW" || navLang === "zh-HK" ? "zh-TW" : "zh-CN";
  }
  if (navLang.startsWith("de")) {
    return "de";
  }
  if (navLang.startsWith("es")) {
    return "es";
  }
  if (navLang.startsWith("ja")) {
    return "ja-JP";
  }
  return DEFAULT_LOCALE;
}

export async function loadLazyLocaleTranslation(locale: Locale): Promise<TranslationMap | null> {
  if (!isLazyLocale(locale)) {
    return null;
  }
  const registration = LAZY_LOCALE_REGISTRY[locale];
  const module = await registration.loader();
  return module[registration.exportName] ?? null;
}