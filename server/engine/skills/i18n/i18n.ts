import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../../logger.js';
import type { SkillEntry } from '../types.js';

export interface SkillI18nEntry {
  locale: string;
  name: string;
  description: string;
  summary?: string;
  keywords?: string[];
}

export interface I18nConfig {
  defaultLocale: string;
  supportedLocales: string[];
  fallback: boolean;
}

let i18nConfig: I18nConfig = {
  defaultLocale: 'en',
  supportedLocales: ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'en-US'],
  fallback: true,
};

export function setI18nConfig(config: Partial<I18nConfig>): void {
  i18nConfig = { ...i18nConfig, ...config };
  logger.info(`[I18n] Config updated: defaultLocale=${i18nConfig.defaultLocale}, supportedLocales=${i18nConfig.supportedLocales.join(',')}`);
}

export function getI18nConfig(): I18nConfig {
  return { ...i18nConfig };
}

export function getSupportedLocales(): string[] {
  return [...i18nConfig.supportedLocales];
}

export function formatI18nKey(key: string, params?: Record<string, unknown>): string {
  if (!params) return key;

  return Object.entries(params).reduce((acc, [k, v]) => {
    return acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }, key);
}

export function translateSkill(skill: SkillEntry, locale: string): SkillEntry {
  const i18nEntries = loadSkillI18n(skill.skill.baseDir);
  const entry = i18nEntries.find((e) => e.locale === locale);

  if (!entry) {
    if (i18nConfig.fallback) {
      const fallbackEntry = i18nEntries.find((e) => e.locale === i18nConfig.defaultLocale);
      if (fallbackEntry) {
        return {
          ...skill,
          skill: {
            ...skill.skill,
            name: fallbackEntry.name,
            description: fallbackEntry.description,
          },
        };
      }
    }
    return skill;
  }

  return {
    ...skill,
    skill: {
      ...skill.skill,
      name: entry.name,
      description: entry.description,
    },
    frontmatter: {
      ...skill.frontmatter,
      ...(entry.summary && { summary: entry.summary }),
      ...(entry.keywords && { keywords: entry.keywords.join(',') }),
    },
  };
}

export function loadSkillI18n(skillDir: string): SkillI18nEntry[] {
  const entries: SkillI18nEntry[] = [];
  const i18nDir = path.join(skillDir, 'i18n');

  if (!fs.existsSync(i18nDir)) {
    return entries;
  }

  try {
    const files = fs.readdirSync(i18nDir);

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const locale = file.replace('.json', '');
      const filePath = path.join(i18nDir, file);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as Partial<SkillI18nEntry>;

        if (data.name && data.description) {
          entries.push({
            locale,
            name: data.name,
            description: data.description,
            summary: data.summary,
            keywords: data.keywords,
          });
        }
      } catch (err) {
        logger.warn(`[I18n] Failed to parse i18n file ${filePath}: ${err}`);
      }
    }
  } catch (err) {
    logger.warn(`[I18n] Failed to read i18n directory ${i18nDir}: ${err}`);
  }

  return entries;
}

export function saveSkillI18n(skillDir: string, entries: SkillI18nEntry[]): void {
  const i18nDir = path.join(skillDir, 'i18n');

  if (!fs.existsSync(i18nDir)) {
    fs.mkdirSync(i18nDir, { recursive: true });
  }

  for (const entry of entries) {
    const filePath = path.join(i18nDir, `${entry.locale}.json`);
    const content = JSON.stringify(entry, null, 2);

    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      logger.debug(`[I18n] Saved i18n file: ${filePath}`);
    } catch (err) {
      logger.error(`[I18n] Failed to save i18n file ${filePath}: ${err}`);
    }
  }
}
