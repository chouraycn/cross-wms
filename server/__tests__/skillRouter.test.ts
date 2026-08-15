/**
 * Skill Router 单元测试（P2-1b 智能技能路由）
 * 覆盖：routeSkillsForPrompt 关键词保底+语义增强去重、formatRoutedSkillsForPrompt
 *       XML 注入块、extractContextTexts 角色过滤、resolveSkillContext 失败回退。
 *
 * 全部依赖以 vi.mock 替换，零 DB / 零 ONNX 真实调用。
 * 置于 server/__tests__/ 以纳入默认 vitest 套件（server/engine 被默认配置 exclude）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock 外部依赖（相对路径对齐被测模块） =====================

const matchMock = vi.fn();
vi.mock('../services/matchingService.js', () => ({
  match: (...args: any[]) => matchMock(...args),
}));

vi.mock('@src/types/skill-core', () => ({
  BUILTIN_SKILLS: [
    {
      id: 'builtin-inventory',
      name: '库存管理',
      desc: '库龄预警与滞销品处理',
      category: 'core',
      tags: ['库存', '预警'],
    },
    {
      id: 'builtin-outbound',
      name: '出库优化',
      desc: '基于订单优先级优化出库',
      category: 'core',
      tags: ['出库', '优化'],
    },
  ],
}));

vi.mock('../dao/skills.js', () => ({
  getUserSkills: () => [],
}));

vi.mock('../engine/skillRuntimeBridge.js', () => ({
  getFolderSkillsForMatching: () => [],
}));

const getOnnxStatusMock = vi.fn(() => ({ status: 'unavailable' }));
vi.mock('../engine/onnxEmbedding.js', () => ({
  getOnnxStatus: (...args: any[]) => getOnnxStatusMock(...args),
}));

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// 必须在 mock 之后 import 被测模块
import {
  routeSkillsForPrompt,
  formatRoutedSkillsForPrompt,
  extractContextTexts,
  resolveSkillContext,
} from '../engine/skillRouter.js';

beforeEach(() => {
  matchMock.mockReset();
  getOnnxStatusMock.mockReset();
  getOnnxStatusMock.mockReturnValue({ status: 'unavailable' });
});

describe('routeSkillsForPrompt — 关键词保底 + 语义增强', () => {
  it('空 query 返回空数组', async () => {
    expect(await routeSkillsForPrompt('   ')).toEqual([]);
  });

  it('语义不可用时仅关键词召回，不触发 context 匹配', async () => {
    getOnnxStatusMock.mockReturnValue({ status: 'unavailable' });
    matchMock.mockImplementation(async (req: any) => {
      if (req.matchMode === 'keyword') {
        return [{ skillId: 'builtin-inventory', score: 0.9, matchMode: 'keyword' }];
      }
      return [];
    });

    const res = await routeSkillsForPrompt('查看库存', [], { topK: 6, threshold: 0.25 });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('builtin-inventory');
    expect(res[0].matchMode).toBe('keyword');
    // 只调用了一次 match（keyword），未调用 context
    expect(matchMock).toHaveBeenCalledTimes(1);
  });

  it('语义可用时叠加 context 召回并去重（关键词优先保底）', async () => {
    getOnnxStatusMock.mockReturnValue({ status: 'ready' });
    matchMock.mockImplementation(async (req: any) => {
      if (req.matchMode === 'keyword') {
        return [{ skillId: 'builtin-inventory', score: 0.9, matchMode: 'keyword' }];
      }
      // context 补充命中另一个技能
      return [{ skillId: 'builtin-outbound', score: 0.6, matchMode: 'context' }];
    });

    const res = await routeSkillsForPrompt('出库相关', ['历史上下文'], { topK: 6, threshold: 0.25 });
    const ids = res.map((r) => r.id).sort();
    expect(ids).toContain('builtin-inventory');
    expect(ids).toContain('builtin-outbound');
    expect(matchMock).toHaveBeenCalledTimes(2); // keyword + context
  });

  it('命中技能不在索引中时被丢弃（lookup 过滤）', async () => {
    matchMock.mockResolvedValue([{ skillId: 'ghost-skill', score: 0.8, matchMode: 'keyword' }]);
    const res = await routeSkillsForPrompt('xx', []);
    expect(res).toEqual([]);
  });
});

describe('formatRoutedSkillsForPrompt — XML 注入块', () => {
  it('空列表返回空字符串', () => {
    expect(formatRoutedSkillsForPrompt([])).toBe('');
  });

  it('生成 <available_skills> 块并含技能元信息与 usage 指令', () => {
    const xml = formatRoutedSkillsForPrompt([
      { id: 'builtin-inventory', name: '库存管理', description: '库龄预警', group: 'core', tags: ['库存'], score: 0.9, matchMode: 'keyword' },
    ]);
    expect(xml).toContain('<available_skills>');
    expect(xml).toContain('builtin-inventory');
    expect(xml).toContain('库存管理');
    expect(xml).toContain('action="use"');
  });
});

describe('extractContextTexts — 角色过滤与截断', () => {
  it('仅保留 user/assistant 非空文本并取最近 limit 条', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '在的' },
      { role: 'user', content: '' },
      { role: 'user', content: '查库存' },
    ];
    const res = extractContextTexts(msgs as any, 2);
    expect(res).toEqual(['在的', '查库存']);
  });

  it('非数组输入返回空数组', () => {
    expect(extractContextTexts(undefined)).toEqual([]);
  });
});

describe('resolveSkillContext — 合并与失败回退', () => {
  it('上游为空时仅追加自动路由块', async () => {
    matchMock.mockResolvedValue([{ skillId: 'builtin-inventory', score: 0.9, matchMode: 'keyword' }]);
    const ctx = await resolveSkillContext(undefined, '查库存', []);
    expect(ctx).toContain('<available_skills>');
    expect(ctx).toContain('builtin-inventory');
  });

  it('上游非空时与路由块拼接', async () => {
    matchMock.mockResolvedValue([]);
    const ctx = await resolveSkillContext('用户主动选了 X', '查库存', []);
    expect(ctx).toContain('用户主动选了 X');
    // 无命中则不追加路由块（仅上游）
    expect(ctx).toBe('用户主动选了 X');
  });

  it('路由抛错时回退到上游 skillContext，不阻断主链路', async () => {
    matchMock.mockRejectedValue(new Error('match boom'));
    const ctx = await resolveSkillContext('上游保底', '查库存', []);
    expect(ctx).toBe('上游保底');
  });
});
