/**
 * schema-meta.ts 单元测试
 *
 * 覆盖：
 * - CONFIG_TAGS：标签词汇表
 * - schemaHelp：字段帮助文本
 * - schemaHints：字段 UI 提示
 * - schemaTags：tags / priority / isKnownTag / deriveTags / sortTags
 */

import { describe, it, expect } from 'vitest';
import { CONFIG_TAGS, schemaHelp, schemaHints, schemaTags } from '../schema-meta.js';
import type { ConfigTag } from '../schema-meta.js';

describe('CONFIG_TAGS', () => {
  it('包含核心分类标签', () => {
    expect(CONFIG_TAGS).toContain('security');
    expect(CONFIG_TAGS).toContain('auth');
    expect(CONFIG_TAGS).toContain('network');
    expect(CONFIG_TAGS).toContain('advanced');
  });

  it('是只读常量数组且条目数充足', () => {
    expect(Array.isArray(CONFIG_TAGS)).toBe(true);
    expect(CONFIG_TAGS.length).toBeGreaterThan(10);
  });
});

describe('schemaHelp', () => {
  it('为 gateway.port 提供中文帮助文本', () => {
    expect(schemaHelp['gateway.port']).toBeTruthy();
    expect(typeof schemaHelp['gateway.port']).toBe('string');
    expect(schemaHelp['gateway.port']).toContain('端口');
  });

  it('为 logging.level 提供帮助文本', () => {
    expect(schemaHelp['logging.level']).toBeTruthy();
    expect(schemaHelp['logging.level']).toContain('日志级别');
  });
});

describe('schemaHints', () => {
  it('为 gateway.port 提供 UI 提示', () => {
    const hint = schemaHints['gateway.port'];
    expect(hint).toBeDefined();
    expect(hint.title).toBe('端口');
    expect(hint.widget).toBe('number');
    expect(hint.placeholder).toBe('3000');
    expect(hint.tags).toContain('network');
  });

  it('所有 hint 的 tags 都是合法 ConfigTag', () => {
    for (const [, hint] of Object.entries(schemaHints)) {
      if (hint.tags) {
        for (const tag of hint.tags) {
          expect(schemaTags.isKnownTag(tag)).toBe(true);
        }
      }
    }
  });
});

describe('schemaTags', () => {
  it('tags 属性与 CONFIG_TAGS 同源', () => {
    expect(schemaTags.tags).toBe(CONFIG_TAGS);
  });

  it('priority 为每个标签映射到数值', () => {
    for (const tag of CONFIG_TAGS) {
      expect(typeof schemaTags.priority[tag]).toBe('number');
    }
    // security 优先级最高（数值最小）
    expect(schemaTags.priority.security).toBe(0);
  });

  it('isKnownTag 对合法标签返回 true，非法标签返回 false', () => {
    expect(schemaTags.isKnownTag('security')).toBe(true);
    expect(schemaTags.isKnownTag('auth')).toBe(true);
    expect(schemaTags.isKnownTag('unknown-tag')).toBe(false);
    expect(schemaTags.isKnownTag('')).toBe(false);
  });

  it('deriveTags 优先返回 schemaHints 中的精确标签（已排序）', () => {
    // gateway.port 的 hint tags = ['network', 'performance']
    // priority: network=3, performance=7 → 排序后 ['network', 'performance']
    expect(schemaTags.deriveTags('gateway.port')).toEqual(['network', 'performance']);
  });

  it('deriveTags 对未在 hints 中的路径使用前缀规则', () => {
    // gateway.unknownField 没有精确 hint，前缀 'gateway.' → ['network']
    const tags = schemaTags.deriveTags('gateway.unknownField');
    expect(tags).toContain('network');
  });

  it('deriveTags 对含 apiKey 的路径附加 security/auth 关键词标签', () => {
    const tags = schemaTags.deriveTags('custom.apiKey');
    expect(tags).toContain('security');
    expect(tags).toContain('auth');
  });

  it('deriveTags 对无匹配的路径返回空数组', () => {
    expect(schemaTags.deriveTags('zzz')).toEqual([]);
  });

  it('sortTags 按优先级升序排序', () => {
    const sorted = schemaTags.sortTags(['performance', 'security', 'network'] as ConfigTag[]);
    expect(sorted).toEqual(['security', 'network', 'performance']);
  });

  it('deriveTags 结果已按优先级排序', () => {
    // gateway.auth.token hint tags = ['security', 'auth']，priority 0 < 1
    expect(schemaTags.deriveTags('gateway.auth.token')).toEqual(['security', 'auth']);
  });
});
