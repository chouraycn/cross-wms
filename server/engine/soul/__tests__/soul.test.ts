/**
 * Soul 模块单元测试
 *
 * 覆盖：
 * - parser.ts: parseFrontMatter / extractSection / extractSections / parsePersonality /
 *   parseStrategyPreferences / parseIdentity / parseListItems / parseSoulMarkdown / parseUserMarkdown
 * - priority.ts: PRIORITY_WEIGHTS / PRIORITY_ORDER / computePriorityOrder / resolveSectionConflict /
 *   mergeStrategies / mergePersonality / mergeSoulConfigs
 * - builder.ts: buildSystemPrompt / formatSection / estimateTokenCount
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseFrontMatter,
  extractSection,
  extractSections,
  parsePersonality,
  parseStrategyPreferences,
  parseIdentity,
  parseListItems,
  parseSoulMarkdown,
  parseUserMarkdown,
  computeHash,
  DEFAULT_PERSONALITY,
  DEFAULT_STRATEGY,
} from '../parser.js';
import {
  PRIORITY_WEIGHTS,
  PRIORITY_ORDER,
  computePriorityOrder,
  resolveSectionConflict,
  mergeStrategies,
  mergePersonality,
  mergeSoulConfigs,
} from '../priority.js';
import {
  buildSystemPrompt,
  formatSection,
  estimateTokenCount,
} from '../builder.js';
import type {
  SoulConfig,
  SoulSource,
  SoulSection,
  SoulSectionType,
  SoulPriority,
  MergedSoulConfig,
  PersonalityMode,
  StrategyPreferences,
} from '../types.js';

// 避免 loader.ts 加载文件系统
vi.mock('../loader.js', () => ({
  loadAllSouls: vi.fn(),
}));

// ===================== 测试辅助函数 =====================

function createMockSource(priority: SoulPriority, loadedAt: number = Date.now()): SoulSource {
  return { priority, filePath: `/test/${priority}.md`, loadedAt };
}

function createMockSection(
  type: SoulSectionType,
  content: string,
  source: SoulSource,
): SoulSection {
  return { type, content, source, hash: computeHash(content) };
}

function createMockSoulConfig(
  priority: SoulPriority,
  loadedAt: number = Date.now(),
  overrides?: Partial<SoulConfig>,
): SoulConfig {
  const source = createMockSource(priority, loadedAt);
  return {
    source,
    personality: DEFAULT_PERSONALITY,
    strategy: { ...DEFAULT_STRATEGY },
    rawContent: '',
    ...overrides,
  };
}

function createMockMergedConfig(
  overrides?: Partial<MergedSoulConfig>,
): MergedSoulConfig {
  const source = createMockSource('system');
  return {
    identity: createMockSection('identity', '## 身份\n\n你是测试助手。', source),
    capabilities: createMockSection('capabilities', '## 能力\n\n- 能力A\n- 能力B', source),
    constraints: createMockSection('constraints', '## 约束\n\n- 不做坏事', source),
    style: createMockSection('style', '## 风格\n\n- 简洁', source),
    knowledge: createMockSection('knowledge', '## 知识\n\n测试知识。', source),
    personality: 'balanced',
    strategy: { plannerThreshold: 'moderate', observerFastPath: false, maxTurnsMultiplier: 1.0 },
    sources: [source],
    ...overrides,
  };
}

// ===================== 测试数据 =====================

const SAMPLE_SOUL_MD = `---
title: 测试助手
version: 1.0
---

# CrossWMS 测试助手

## 身份

你是 CrossWMS 测试助手，负责单元测试验证。

## 能力

- 代码生成
- 代码审查
- 测试编写

## 约束

- 不执行危险操作
- 不编造数据

## 风格

- 简洁直接
- 中文优先

## 知识

仓库管理系统（WMS）领域知识。

\`plannerThreshold\`: \`complex\`
\`observerFastPath\`: \`true\`
\`maxTurnsMultiplier\`: \`1.5\`

*personality*: \`efficient\`
`;

// ===================== parser.ts 测试 =====================

describe('parser - parseFrontMatter', () => {
  it('解析 YAML Front Matter', () => {
    const content = '---\ntitle: 测试\ncount: 42\nenabled: true\n---\n\n正文';
    const meta = parseFrontMatter(content);
    expect(meta.title).toBe('测试');
    expect(meta.count).toBe(42);
    expect(meta.enabled).toBe(true);
  });

  it('无 Front Matter 时返回空对象', () => {
    const meta = parseFrontMatter('纯文本内容');
    expect(meta).toEqual({});
  });

  it('解析带引号的字符串值', () => {
    const content = '---\nname: "hello"\n---\n\n正文';
    const meta = parseFrontMatter(content);
    expect(meta.name).toBe('hello');
  });

  it('解析浮点数', () => {
    const content = '---\nscore: 3.14\n---\n\n正文';
    const meta = parseFrontMatter(content);
    expect(meta.score).toBe(3.14);
  });
});

describe('parser - extractSection', () => {
  it('提取指定 ## 节内容', () => {
    const content = '## 身份\n\n我是助手。\n\n## 能力\n\n- 能力1';
    const section = extractSection(content, '身份');
    expect(section).not.toBeNull();
    expect(section).toContain('我是助手');
  });

  it('不存在的节返回 null', () => {
    const content = '## 身份\n\n我是助手。';
    expect(extractSection(content, '能力')).toBeNull();
  });

  it('提取最后一节（无后续 ## 节）', () => {
    const content = '## 知识\n\n一些知识内容。';
    const section = extractSection(content, '知识');
    expect(section).not.toBeNull();
    expect(section).toContain('一些知识内容');
  });
});

describe('parser - extractSections', () => {
  it('提取所有 5 个分段', () => {
    const source = createMockSource('system');
    const sections = extractSections(SAMPLE_SOUL_MD, source);

    expect(sections.identity).not.toBeNull();
    expect(sections.identity!.content).toContain('测试助手');

    expect(sections.capabilities).not.toBeNull();
    expect(sections.capabilities!.content).toContain('代码生成');

    expect(sections.constraints).not.toBeNull();
    expect(sections.constraints!.content).toContain('不执行危险操作');

    expect(sections.style).not.toBeNull();
    expect(sections.style!.content).toContain('简洁直接');

    expect(sections.knowledge).not.toBeNull();
    expect(sections.knowledge!.content).toContain('WMS');
  });

  it('分段包含正确的来源和哈希', () => {
    const source = createMockSource('project');
    const sections = extractSections(SAMPLE_SOUL_MD, source);
    expect(sections.identity!.source.priority).toBe('project');
    expect(sections.identity!.hash).toBeTruthy();
  });

  it('支持中英文分段名称', () => {
    const content = '## Identity\n\nI am assistant.\n\n## Capabilities\n\n- Code';
    const source = createMockSource('system');
    const sections = extractSections(content, source);
    expect(sections.identity).not.toBeNull();
    expect(sections.identity!.content).toContain('assistant');
    expect(sections.capabilities).not.toBeNull();
  });

  it('缺失的分段为 null', () => {
    const content = '## 身份\n\n只有身份。';
    const source = createMockSource('system');
    const sections = extractSections(content, source);
    expect(sections.identity).not.toBeNull();
    expect(sections.capabilities).toBeNull();
    expect(sections.constraints).toBeNull();
    expect(sections.style).toBeNull();
    expect(sections.knowledge).toBeNull();
  });
});

describe('parser - parsePersonality', () => {
  it('解析 cautious 模式', () => {
    expect(parsePersonality('personality: cautious')).toBe('cautious');
  });

  it('解析 efficient 模式', () => {
    expect(parsePersonality('personality: efficient')).toBe('efficient');
  });

  it('解析 balanced 模式', () => {
    expect(parsePersonality('personality: balanced')).toBe('balanced');
  });

  it('无 personality 字段时返回默认值', () => {
    expect(parsePersonality('无相关内容')).toBe(DEFAULT_PERSONALITY);
    expect(DEFAULT_PERSONALITY).toBe('balanced');
  });
});

describe('parser - parseStrategyPreferences', () => {
  it('解析完整策略偏好', () => {
    const content = '`plannerThreshold`: `complex`\n`observerFastPath`: `true`\n`maxTurnsMultiplier`: `1.5`';
    const prefs = parseStrategyPreferences(content);
    expect(prefs.plannerThreshold).toBe('complex');
    expect(prefs.observerFastPath).toBe(true);
    expect(prefs.maxTurnsMultiplier).toBe(1.5);
  });

  it('无策略字段时返回默认值', () => {
    const prefs = parseStrategyPreferences('无相关内容');
    expect(prefs.plannerThreshold).toBe(DEFAULT_STRATEGY.plannerThreshold);
    expect(prefs.observerFastPath).toBe(DEFAULT_STRATEGY.observerFastPath);
    expect(prefs.maxTurnsMultiplier).toBe(DEFAULT_STRATEGY.maxTurnsMultiplier);
  });
});

describe('parser - parseIdentity', () => {
  it('从身份节提取身份描述', () => {
    const content = '## 身份\n\n你是 CrossWMS 测试助手。';
    expect(parseIdentity(content)).toContain('测试助手');
  });

  it('无身份节时返回默认值', () => {
    expect(parseIdentity('无身份内容')).toBe('CrossWMS 智能助手');
  });
});

describe('parser - parseListItems', () => {
  it('提取列表项', () => {
    const content = '## 能力\n\n- 代码生成\n- 代码审查\n- 测试编写';
    const items = parseListItems(content, '能力');
    expect(items).toEqual(['代码生成', '代码审查', '测试编写']);
  });

  it('无列表项时返回空数组', () => {
    const content = '## 能力\n\n纯文本无列表。';
    expect(parseListItems(content, '能力')).toEqual([]);
  });

  it('节不存在时返回空数组', () => {
    expect(parseListItems('内容', '不存在')).toEqual([]);
  });
});

describe('parser - parseSoulMarkdown', () => {
  it('解析完整 SOUL.md', () => {
    const source = createMockSource('system');
    const config = parseSoulMarkdown(SAMPLE_SOUL_MD, source);

    expect(config.source.priority).toBe('system');
    expect(config.identity).toBeDefined();
    expect(config.capabilities).toBeDefined();
    expect(config.constraints).toBeDefined();
    expect(config.style).toBeDefined();
    expect(config.knowledge).toBeDefined();
    expect(config.personality).toBe('efficient');
    expect(config.strategy.plannerThreshold).toBe('complex');
    expect(config.strategy.observerFastPath).toBe(true);
    expect(config.strategy.maxTurnsMultiplier).toBe(1.5);
    expect(config.rawContent).toBe(SAMPLE_SOUL_MD);
  });

  it('无分段内容时分段为 undefined', () => {
    const source = createMockSource('user');
    const config = parseSoulMarkdown('纯文本无分段', source);
    expect(config.identity).toBeUndefined();
    expect(config.capabilities).toBeUndefined();
  });
});

describe('parser - parseUserMarkdown', () => {
  it('将 USER.md 内容作为 knowledge 分段', () => {
    const source = createMockSource('user');
    const content = '---\nname: 用户\n---\n\n用户偏好信息。';
    const config = parseUserMarkdown(content, source);

    expect(config.knowledge).toBeDefined();
    expect(config.knowledge!.content).toContain('用户画像');
    expect(config.knowledge!.content).toContain('用户偏好信息');
  });

  it('空内容时不创建 knowledge 分段', () => {
    const source = createMockSource('user');
    const config = parseUserMarkdown('', source);
    expect(config.knowledge).toBeUndefined();
  });
});

describe('parser - computeHash', () => {
  it('相同内容产生相同哈希', () => {
    expect(computeHash('test')).toBe(computeHash('test'));
  });

  it('不同内容产生不同哈希', () => {
    expect(computeHash('test1')).not.toBe(computeHash('test2'));
  });
});

// ===================== priority.ts 测试 =====================

describe('priority - 常量', () => {
  it('PRIORITY_ORDER 顺序为 system > project > user > session', () => {
    expect(PRIORITY_ORDER).toEqual(['system', 'project', 'user', 'session']);
  });

  it('PRIORITY_WEIGHTS system 最高 session 最低', () => {
    expect(PRIORITY_WEIGHTS.system).toBeGreaterThan(PRIORITY_WEIGHTS.project);
    expect(PRIORITY_WEIGHTS.project).toBeGreaterThan(PRIORITY_WEIGHTS.user);
    expect(PRIORITY_WEIGHTS.user).toBeGreaterThan(PRIORITY_WEIGHTS.session);
  });
});

describe('priority - computePriorityOrder', () => {
  it('按优先级从高到低排序', () => {
    const configs = [
      createMockSoulConfig('session'),
      createMockSoulConfig('system'),
      createMockSoulConfig('user'),
      createMockSoulConfig('project'),
    ];
    const sorted = computePriorityOrder(configs);
    expect(sorted[0].source.priority).toBe('system');
    expect(sorted[1].source.priority).toBe('project');
    expect(sorted[2].source.priority).toBe('user');
    expect(sorted[3].source.priority).toBe('session');
  });

  it('同优先级时后加载的排前面', () => {
    const configs = [
      createMockSoulConfig('user', 1000),
      createMockSoulConfig('user', 2000),
    ];
    const sorted = computePriorityOrder(configs);
    expect(sorted[0].source.loadedAt).toBe(2000);
    expect(sorted[1].source.loadedAt).toBe(1000);
  });
});

describe('priority - resolveSectionConflict', () => {
  it('选择最高优先级的分段', () => {
    const userSection = createMockSection('identity', '用户级身份', createMockSource('user'));
    const systemSection = createMockSection('identity', '系统级身份', createMockSource('system'));
    const resolved = resolveSectionConflict([userSection, systemSection]);
    expect(resolved!.content).toBe('系统级身份');
  });

  it('全部为 null 时返回 null', () => {
    expect(resolveSectionConflict([null, null])).toBeNull();
  });

  it('只有一个有效分段时直接返回', () => {
    const section = createMockSection('style', '风格内容', createMockSource('user'));
    expect(resolveSectionConflict([null, section])).toBe(section);
  });

  it('同优先级时后加载的优先', () => {
    const s1 = createMockSection('identity', '先加载', createMockSource('user', 1000));
    const s2 = createMockSection('identity', '后加载', createMockSource('user', 2000));
    const resolved = resolveSectionConflict([s1, s2]);
    expect(resolved!.content).toBe('后加载');
  });
});

describe('priority - mergeStrategies', () => {
  it('高优先级非默认值覆盖低优先级', () => {
    const strategies: StrategyPreferences[] = [
      { plannerThreshold: 'simple', observerFastPath: false, maxTurnsMultiplier: 0.8 },
      { plannerThreshold: 'complex', observerFastPath: true, maxTurnsMultiplier: 1.2 },
    ];
    const priorities: SoulPriority[] = ['user', 'system'];
    const merged = mergeStrategies(strategies, priorities);
    expect(merged.plannerThreshold).toBe('complex');
    expect(merged.observerFastPath).toBe(true);
    expect(merged.maxTurnsMultiplier).toBe(1.2);
  });

  it('默认值不覆盖非默认值', () => {
    const strategies: StrategyPreferences[] = [
      { plannerThreshold: 'simple', observerFastPath: true, maxTurnsMultiplier: 0.8 },
      { plannerThreshold: 'moderate', observerFastPath: false, maxTurnsMultiplier: 1.0 },
    ];
    const priorities: SoulPriority[] = ['user', 'system'];
    const merged = mergeStrategies(strategies, priorities);
    expect(merged.plannerThreshold).toBe('simple');
    expect(merged.observerFastPath).toBe(true);
    expect(merged.maxTurnsMultiplier).toBe(0.8);
  });

  it('全部为默认值时返回默认值', () => {
    const strategies: StrategyPreferences[] = [
      { plannerThreshold: 'moderate', observerFastPath: false, maxTurnsMultiplier: 1.0 },
    ];
    const priorities: SoulPriority[] = ['system'];
    const merged = mergeStrategies(strategies, priorities);
    expect(merged.plannerThreshold).toBe('moderate');
    expect(merged.observerFastPath).toBe(false);
    expect(merged.maxTurnsMultiplier).toBe(1.0);
  });
});

describe('priority - mergePersonality', () => {
  it('返回最高优先级的非默认值', () => {
    const merged = mergePersonality(['cautious', 'balanced'], ['user', 'system']);
    expect(merged).toBe('cautious');
  });

  it('system 非默认值优先于 user', () => {
    const merged = mergePersonality(['cautious', 'efficient'], ['user', 'system']);
    expect(merged).toBe('efficient');
  });

  it('全为 balanced 返回 balanced', () => {
    const merged = mergePersonality(['balanced', 'balanced'], ['user', 'system']);
    expect(merged).toBe('balanced');
  });
});

describe('priority - mergeSoulConfigs', () => {
  it('合并多个配置，高优先级分段覆盖低优先级', () => {
    const systemSource = createMockSource('system');
    const userSource = createMockSource('user');

    const systemConfig = createMockSoulConfig('system', undefined, {
      identity: createMockSection('identity', '系统级身份', systemSource),
    });

    const userConfig = createMockSoulConfig('user', undefined, {
      identity: createMockSection('identity', '用户级身份', userSource),
      style: createMockSection('style', '用户级风格', userSource),
    });

    const merged = mergeSoulConfigs([userConfig, systemConfig]);

    expect(merged.identity.content).toBe('系统级身份');
    expect(merged.style.content).toBe('用户级风格');
    expect(merged.sources.length).toBe(2);
  });

  it('空配置列表抛出错误', () => {
    expect(() => mergeSoulConfigs([])).toThrow();
  });

  it('缺失分段使用默认内容', () => {
    const config = createMockSoulConfig('system');
    const merged = mergeSoulConfigs([config]);
    expect(merged.identity).toBeDefined();
    expect(merged.capabilities).toBeDefined();
    expect(merged.constraints).toBeDefined();
    expect(merged.style).toBeDefined();
    expect(merged.knowledge).toBeDefined();
  });

  it('合并人格模式和策略', () => {
    const systemConfig = createMockSoulConfig('system', undefined, {
      personality: 'efficient',
      strategy: { plannerThreshold: 'complex', observerFastPath: true, maxTurnsMultiplier: 1.5 },
    });
    const userConfig = createMockSoulConfig('user', undefined, {
      personality: 'cautious',
    });

    const merged = mergeSoulConfigs([userConfig, systemConfig]);
    expect(merged.personality).toBe('efficient');
    expect(merged.strategy.plannerThreshold).toBe('complex');
  });
});

// ===================== builder.ts 测试 =====================

describe('builder - estimateTokenCount', () => {
  it('纯中文文本 token 估算', () => {
    const tokens = estimateTokenCount('你好世界');
    expect(tokens).toBeGreaterThan(0);
  });

  it('纯英文文本 token 估算', () => {
    const tokens = estimateTokenCount('hello world');
    expect(tokens).toBeGreaterThan(0);
  });

  it('空字符串返回 0', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('长文本 token 数大于短文本', () => {
    const shortTokens = estimateTokenCount('短文本');
    const longTokens = estimateTokenCount('这是一段非常长的文本内容用于测试 token 估算功能');
    expect(longTokens).toBeGreaterThan(shortTokens);
  });
});

describe('builder - formatSection', () => {
  it('返回分段内容', () => {
    const source = createMockSource('system');
    const section = createMockSection('identity', '## 身份\n\n你是助手。', source);
    expect(formatSection(section)).toContain('你是助手');
  });

  it('includeMetadata 时包含来源信息', () => {
    const source = createMockSource('system');
    const section = createMockSection('identity', '## 身份\n\n你是助手。', source);
    const formatted = formatSection(section, true);
    expect(formatted).toContain('来源');
    expect(formatted).toContain('系统级');
  });
});

describe('builder - buildSystemPrompt', () => {
  it('包含人格模式标记', () => {
    const config = createMockMergedConfig({ personality: 'efficient' });
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain('[人格模式] efficient');
  });

  it('包含所有分段标题', () => {
    const config = createMockMergedConfig();
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain('[身份定义]');
    expect(prompt).toContain('[能力边界]');
    expect(prompt).toContain('[行为约束]');
    expect(prompt).toContain('[回复风格]');
    expect(prompt).toContain('[领域知识]');
  });

  it('包含策略偏好摘要', () => {
    const config = createMockMergedConfig({
      strategy: { plannerThreshold: 'complex', observerFastPath: true, maxTurnsMultiplier: 1.5 },
    });
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain('[策略偏好]');
    expect(prompt).toContain('complex');
    expect(prompt).toContain('启用');
    expect(prompt).toContain('1.5');
  });

  it('禁用策略时显示禁用', () => {
    const config = createMockMergedConfig({
      strategy: { plannerThreshold: 'moderate', observerFastPath: false, maxTurnsMultiplier: 1.0 },
    });
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain('禁用');
  });

  it('includeMetadata 时包含来源元信息', () => {
    const config = createMockMergedConfig();
    const prompt = buildSystemPrompt(config, { includeMetadata: true });
    expect(prompt).toContain('来源');
  });

  it('maxTokens 限制时裁剪内容', () => {
    const config = createMockMergedConfig();
    const prompt = buildSystemPrompt(config, { maxTokens: 5 });
    expect(prompt).toContain('裁剪');
  });

  it('包含分段内容', () => {
    const source = createMockSource('system');
    const config = createMockMergedConfig({
      identity: createMockSection('identity', '## 身份\n\n你是测试助手。', source),
    });
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain('你是测试助手');
  });
});
