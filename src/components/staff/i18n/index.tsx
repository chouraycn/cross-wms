import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import englishCatalog from './en.json'

export type AppLocale = 'zh-CN' | 'en-US'

type I18nContextValue = {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  toggleLocale: () => void
  t: (source: string, values?: Record<string | number, string | number>) => string
}

const STORAGE_KEY = 'staffdeck_locale'
const CATALOG = englishCatalog as Record<string, string>
const TEMPLATE_TOKEN = /\{(\w+)\}/g

function initialLocale(): AppLocale {
  if (typeof window === 'undefined') return 'zh-CN'
  return window.localStorage.getItem(STORAGE_KEY) === 'en-US' ? 'en-US' : 'zh-CN'
}

let currentLocale: AppLocale = initialLocale()

function interpolate(target: string, values: Record<string | number, string | number>): string {
  return target.replace(TEMPLATE_TOKEN, (_, key: string) => {
    const numericKey = Number(key)
    if (!Number.isNaN(numericKey) && values[numericKey] !== undefined) {
      return String(values[numericKey])
    }
    return String(values[key] ?? `{${key}}`)
  })
}

function translateCore(source: string): string | null {
  return CATALOG[source] || null
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function getStoredLocale(): AppLocale {
  return currentLocale
}

export function getDateLocale(): string {
  return currentLocale === 'en-US' ? 'en-US' : 'zh-CN'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale)

  const setLocale = useCallback((nextLocale: AppLocale) => {
    currentLocale = nextLocale
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLocale)
    } catch {
      // ignore storage errors (e.g. private mode quota)
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLocale
    }
    setLocaleState(nextLocale)
  }, [])

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')
  }, [locale, setLocale])

  const t = useCallback(
    (source: string, values: Record<string | number, string | number> = {}) => {
      if (locale === 'zh-CN') return interpolate(source, values)
      return interpolate(translateCore(source) || source, values)
    },
    [locale],
  )

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, t, toggleLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
