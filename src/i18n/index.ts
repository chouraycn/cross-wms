import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文', nativeName: '简体中文' },
  { code: 'en-US', name: 'English', nativeName: 'English' },
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['code'];

function detectLanguage(): SupportedLanguage {
  // 优先从 localStorage 获取
  const savedLang = localStorage.getItem('app_language');
  if (savedLang && SUPPORTED_LANGUAGES.some(l => l.code === savedLang)) {
    return savedLang as SupportedLanguage;
  }
  
  // 检测浏览器语言
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (browserLang) {
    // zh-CN, zh-TW, zh-HK 等都映射到 zh-CN
    if (browserLang.startsWith('zh')) {
      return 'zh-CN';
    }
    // en-US, en-GB 等都映射到 en-US
    if (browserLang.startsWith('en')) {
      return 'en-US';
    }
  }
  
  return 'zh-CN';
}

const savedLanguage = detectLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: savedLanguage,
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  });

export function changeLanguage(lang: SupportedLanguage): void {
  i18n.changeLanguage(lang);
  localStorage.setItem('app_language', lang);
}

export function getCurrentLanguage(): SupportedLanguage {
  return (i18n.language || 'zh-CN') as SupportedLanguage;
}

export default i18n;
