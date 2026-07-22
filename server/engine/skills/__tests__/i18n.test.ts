import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Skill, SkillEntry } from '../types.js';
import {
  setI18nConfig,
  getI18nConfig,
  translateSkill,
  loadSkillI18n,
  saveSkillI18n,
  getSupportedLocales,
  formatI18nKey,
  detectLocale,
  normalizeLocale,
  isLocaleSupported,
  getFallbackLocale,
} from '../i18n/index.js';

function createMockSkill(name: string, overrides: Partial<Skill> = {}): Skill {
  return {
    name,
    description: `Description for ${name}`,
    filePath: `/skills/${name}/SKILL.md`,
    baseDir: `/skills/${name}`,
    source: 'bundled',
    disableModelInvocation: false,
    ...overrides,
  };
}

function createMockSkillEntry(skill: Skill, overrides: Partial<SkillEntry> = {}): SkillEntry {
  return {
    skill,
    frontmatter: {},
    ...overrides,
  };
}

describe('i18n', () => {
  let tempDir: string;
  let originalLang: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-test-'));
    originalLang = process.env.LANG;
    setI18nConfig({
      defaultLocale: 'en',
      supportedLocales: ['en', 'zh-CN', 'zh-TW', 'ja'],
      fallback: true,
    });
  });

  afterEach(() => {
    if (originalLang !== undefined) {
      process.env.LANG = originalLang;
    } else {
      delete process.env.LANG;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('setI18nConfig / getI18nConfig', () => {
    it('should set and get i18n config', () => {
      const config = getI18nConfig();
      expect(config.defaultLocale).toBe('en');
      expect(config.supportedLocales).toEqual(['en', 'zh-CN', 'zh-TW', 'ja']);
      expect(config.fallback).toBe(true);

      setI18nConfig({ defaultLocale: 'zh-CN', fallback: false });
      const updatedConfig = getI18nConfig();
      expect(updatedConfig.defaultLocale).toBe('zh-CN');
      expect(updatedConfig.supportedLocales).toEqual(['en', 'zh-CN', 'zh-TW', 'ja']);
      expect(updatedConfig.fallback).toBe(false);
    });
  });

  describe('getSupportedLocales', () => {
    it('should return supported locales', () => {
      const locales = getSupportedLocales();
      expect(locales).toEqual(['en', 'zh-CN', 'zh-TW', 'ja']);
    });

    it('should return a copy of the array', () => {
      const locales = getSupportedLocales();
      locales.push('fr');
      const original = getSupportedLocales();
      expect(original).not.toContain('fr');
    });
  });

  describe('formatI18nKey', () => {
    it('should return key without params', () => {
      expect(formatI18nKey('hello')).toBe('hello');
    });

    it('should replace params in key', () => {
      const result = formatI18nKey('hello {name}, you have {count} messages', {
        name: 'Alice',
        count: 5,
      });
      expect(result).toBe('hello Alice, you have 5 messages');
    });

    it('should handle missing params gracefully', () => {
      const result = formatI18nKey('hello {name}', {});
      expect(result).toBe('hello {name}');
    });

    it('should handle multiple occurrences of same param', () => {
      const result = formatI18nKey('{greeting} {name}, {greeting} again', {
        greeting: 'Hello',
        name: 'Bob',
      });
      expect(result).toBe('Hello Bob, Hello again');
    });
  });

  describe('loadSkillI18n', () => {
    it('should return empty array when i18n directory does not exist', () => {
      const skillDir = path.join(tempDir, 'skill-no-i18n');
      fs.mkdirSync(skillDir, { recursive: true });

      const entries = loadSkillI18n(skillDir);
      expect(entries).toEqual([]);
    });

    it('should load i18n entries from json files', () => {
      const skillDir = path.join(tempDir, 'skill-with-i18n');
      const i18nDir = path.join(skillDir, 'i18n');
      fs.mkdirSync(i18nDir, { recursive: true });

      fs.writeFileSync(path.join(i18nDir, 'en.json'), JSON.stringify({
        locale: 'en',
        name: 'English Name',
        description: 'English Description',
        summary: 'English Summary',
        keywords: ['keyword1', 'keyword2'],
      }));

      fs.writeFileSync(path.join(i18nDir, 'zh-CN.json'), JSON.stringify({
        locale: 'zh-CN',
        name: '中文名称',
        description: '中文描述',
      }));

      const entries = loadSkillI18n(skillDir);
      expect(entries.length).toBe(2);

      const enEntry = entries.find((e) => e.locale === 'en');
      expect(enEntry?.name).toBe('English Name');
      expect(enEntry?.description).toBe('English Description');
      expect(enEntry?.summary).toBe('English Summary');
      expect(enEntry?.keywords).toEqual(['keyword1', 'keyword2']);

      const zhEntry = entries.find((e) => e.locale === 'zh-CN');
      expect(zhEntry?.name).toBe('中文名称');
      expect(zhEntry?.description).toBe('中文描述');
    });

    it('should skip invalid json files', () => {
      const skillDir = path.join(tempDir, 'skill-invalid-i18n');
      const i18nDir = path.join(skillDir, 'i18n');
      fs.mkdirSync(i18nDir, { recursive: true });

      fs.writeFileSync(path.join(i18nDir, 'invalid.json'), 'not valid json');
      fs.writeFileSync(path.join(i18nDir, 'en.json'), JSON.stringify({
        locale: 'en',
        name: 'Valid Name',
        description: 'Valid Description',
      }));

      const entries = loadSkillI18n(skillDir);
      expect(entries.length).toBe(1);
      expect(entries[0].locale).toBe('en');
    });

    it('should skip files without name or description', () => {
      const skillDir = path.join(tempDir, 'skill-incomplete-i18n');
      const i18nDir = path.join(skillDir, 'i18n');
      fs.mkdirSync(i18nDir, { recursive: true });

      fs.writeFileSync(path.join(i18nDir, 'incomplete.json'), JSON.stringify({
        locale: 'fr',
        name: 'French Name',
      }));

      const entries = loadSkillI18n(skillDir);
      expect(entries.length).toBe(0);
    });
  });

  describe('saveSkillI18n', () => {
    it('should create i18n directory and save entries', () => {
      const skillDir = path.join(tempDir, 'skill-save');
      const entries = [
        {
          locale: 'en',
          name: 'English Name',
          description: 'English Description',
        },
        {
          locale: 'zh-CN',
          name: '中文名称',
          description: '中文描述',
          summary: '中文摘要',
          keywords: ['关键词1', '关键词2'],
        },
      ];

      saveSkillI18n(skillDir, entries);

      const i18nDir = path.join(skillDir, 'i18n');
      expect(fs.existsSync(i18nDir)).toBe(true);

      const enContent = JSON.parse(fs.readFileSync(path.join(i18nDir, 'en.json'), 'utf-8'));
      expect(enContent.name).toBe('English Name');
      expect(enContent.description).toBe('English Description');

      const zhContent = JSON.parse(fs.readFileSync(path.join(i18nDir, 'zh-CN.json'), 'utf-8'));
      expect(zhContent.name).toBe('中文名称');
      expect(zhContent.description).toBe('中文描述');
      expect(zhContent.summary).toBe('中文摘要');
      expect(zhContent.keywords).toEqual(['关键词1', '关键词2']);
    });
  });

  describe('translateSkill', () => {
    it('should translate skill to specified locale', () => {
      const skillDir = path.join(tempDir, 'skill-translate');
      const i18nDir = path.join(skillDir, 'i18n');
      fs.mkdirSync(i18nDir, { recursive: true });

      fs.writeFileSync(path.join(i18nDir, 'en.json'), JSON.stringify({
        locale: 'en',
        name: 'English Skill',
        description: 'English Description',
      }));

      fs.writeFileSync(path.join(i18nDir, 'zh-CN.json'), JSON.stringify({
        locale: 'zh-CN',
        name: '中文技能',
        description: '中文描述',
      }));

      const skill = createMockSkillEntry(createMockSkill('test-skill', { baseDir: skillDir }));
      const translated = translateSkill(skill, 'zh-CN');

      expect(translated.skill.name).toBe('中文技能');
      expect(translated.skill.description).toBe('中文描述');
    });

    it('should fallback to default locale when requested locale not found', () => {
      const skillDir = path.join(tempDir, 'skill-fallback');
      const i18nDir = path.join(skillDir, 'i18n');
      fs.mkdirSync(i18nDir, { recursive: true });

      fs.writeFileSync(path.join(i18nDir, 'en.json'), JSON.stringify({
        locale: 'en',
        name: 'English Skill',
        description: 'English Description',
      }));

      const skill = createMockSkillEntry(createMockSkill('test-skill', { baseDir: skillDir }));
      const translated = translateSkill(skill, 'ja');

      expect(translated.skill.name).toBe('English Skill');
      expect(translated.skill.description).toBe('English Description');
    });

    it('should return original skill when no i18n entries found', () => {
      const skillDir = path.join(tempDir, 'skill-no-i18n');
      fs.mkdirSync(skillDir, { recursive: true });

      const skill = createMockSkillEntry(createMockSkill('test-skill', { baseDir: skillDir }));
      const translated = translateSkill(skill, 'zh-CN');

      expect(translated.skill.name).toBe('test-skill');
      expect(translated.skill.description).toBe('Description for test-skill');
    });

    it('should not fallback when fallback is disabled', () => {
      setI18nConfig({ fallback: false });

      const skillDir = path.join(tempDir, 'skill-no-fallback');
      const i18nDir = path.join(skillDir, 'i18n');
      fs.mkdirSync(i18nDir, { recursive: true });

      fs.writeFileSync(path.join(i18nDir, 'en.json'), JSON.stringify({
        locale: 'en',
        name: 'English Skill',
        description: 'English Description',
      }));

      const skill = createMockSkillEntry(createMockSkill('test-skill', { baseDir: skillDir }));
      const translated = translateSkill(skill, 'zh-CN');

      expect(translated.skill.name).toBe('test-skill');
      expect(translated.skill.description).toBe('Description for test-skill');
    });
  });

  describe('detectLocale', () => {
    it('should detect locale from LANG environment variable', () => {
      process.env.LANG = 'zh_CN.UTF-8';
      const locale = detectLocale();
      expect(locale).toBe('zh-CN');
    });

    it('should use default locale when LANG is not set', () => {
      delete process.env.LANG;
      const locale = detectLocale();
      expect(locale).toBe('en');
    });

    it('should fallback when detected locale is not supported', () => {
      process.env.LANG = 'fr_FR.UTF-8';
      const locale = detectLocale();
      expect(locale).toBe('en');
    });
  });

  describe('normalizeLocale', () => {
    it('should normalize locale with underscore', () => {
      expect(normalizeLocale('zh_CN')).toBe('zh-CN');
      expect(normalizeLocale('EN_US')).toBe('en-US');
    });

    it('should handle locale with encoding', () => {
      expect(normalizeLocale('zh_CN.UTF-8')).toBe('zh-CN');
      expect(normalizeLocale('en_US.UTF-8')).toBe('en-US');
    });

    it('should handle simple language codes', () => {
      expect(normalizeLocale('en')).toBe('en');
      expect(normalizeLocale('ja')).toBe('ja');
    });

    it('should trim whitespace', () => {
      expect(normalizeLocale(' zh-CN ')).toBe('zh-CN');
    });
  });

  describe('isLocaleSupported', () => {
    it('should return true for supported locales', () => {
      expect(isLocaleSupported('en')).toBe(true);
      expect(isLocaleSupported('zh-CN')).toBe(true);
      expect(isLocaleSupported('zh-TW')).toBe(true);
    });

    it('should return false for unsupported locales', () => {
      expect(isLocaleSupported('fr')).toBe(false);
      expect(isLocaleSupported('de')).toBe(false);
    });
  });

  describe('getFallbackLocale', () => {
    it('should return locale if supported', () => {
      expect(getFallbackLocale('en')).toBe('en');
      expect(getFallbackLocale('zh-CN')).toBe('zh-CN');
    });

    it('should return default locale when no fallback found', () => {
      expect(getFallbackLocale('fr')).toBe('en');
    });

    it('should return language match when available', () => {
      expect(getFallbackLocale('zh-HK')).toBe('zh-CN');
    });

    it('should return undefined when fallback is disabled', () => {
      setI18nConfig({ fallback: false });
      expect(getFallbackLocale('fr')).toBeUndefined();
    });
  });
});
