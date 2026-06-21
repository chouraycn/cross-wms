import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation resources
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: 'zh-CN', // Default language (backward compatible)
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18n;
