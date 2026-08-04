export {type SkillI18nEntry, type I18nConfig, setI18nConfig, getI18nConfig, translateSkill, loadSkillI18n, saveSkillI18n, getSupportedLocales, formatI18nKey, 
} from './i18n.js';

export {
  detectLocale,
  normalizeLocale,
  isLocaleSupported,
  getFallbackLocale,
} from './locale.js';
