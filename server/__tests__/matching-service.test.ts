/**
 * Matching Service 单元测试
 * 覆盖：match() 4 种模式、keywordMatch()、fuzzyMatch()、降级策略、配置读写
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock 外部依赖（使用从测试文件的相对路径） =====================

vi.mock('../db.js', () => ({
  initDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
    transaction: vi.fn((fn) => fn),
  })),
  createUserSkill: vi.fn(),
  getUserSkills: vi.fn(() => []),
  createSkillAudit: vi.fn(),
}));

vi.mock('../../src/types/skill.js', () => ({
  getBuiltinSkillsSync: () => [
    {
      id: 'builtin-inventory',
      name: '库存管理',
      desc: '库龄预警、滞销处理、周转优化与保质期管理',
      icon: 'Inventory',
      category: 'core',
      path: '/inventory',
      trigger: '查看库存 / 库龄分析',
      detail: '库龄预警与滞销品处理',
      tags: ['库存', '预警'],
      status: 'active',
      version: '1.0',
      source: 'builtin',
      executionMode: 'hybrid',
    },
    {
      id: 'builtin-inbound',
      name: '入库规划',
      desc: '优化入库流程，提升仓库入库效率',
      icon: 'Input',
      category: 'core',
      path: '/',
      trigger: '入库规划 / 安排入库',
      detail: '智能规划入库流程',
      tags: ['入库', '规划'],
      status: 'active',
      version: '1.0',
      source: 'builtin',
      executionMode: 'chat',
    },
    {
      id: 'builtin-outbound',
      name: '出库优化',
      desc: '优化出库流程，降低出库错误率',
      icon: 'Output',
      category: 'core',
      path: '/',
      trigger: '出库优化 / 出库调度',
      detail: '基于订单优先级优化出库',
      tags: ['出库', '优化'],
      status: 'active',
      version: '1.0',
      source: 'builtin',
      executionMode: 'chat',
    },
    {
      id: 'builtin-inactive',
      name: '已停用技能',
      desc: '这个技能已经停用',
      icon: 'Disabled',
      category: 'deprecated',
      path: '/',
      trigger: '停用',
      tags: ['停用'],
      status: 'inactive',
      version: '1.0',
      source: 'builtin',
      executionMode: 'chat',
    },
  ],
  loadBuiltinSkills: () => Promise.resolve([
    {
      id: 'builtin-inventory',
      name: '库存管理',
      desc: '库龄预警、滞销处理、周转优化与保质期管理',
      icon: 'Inventory',
      category: 'core',
      path: '/inventory',
      trigger: '查看库存 / 库龄分析',
    },
  ]),
}));

vi.mock('../../src/types/semantic.js', () => ({
  EMBEDDING_DIMENSIONS: 384,
  DEFAULT_EMBEDDING_MODEL: 'all-MiniLM-L6-v2',
  DEFAULT_MATCH_ENGINE_CONFIG: {
    semanticWeight: 0.6,
    keywordWeight: 0.4,
    defaultThreshold: 0.3,
    defaultTopK: 10,
    cacheTtlMs: 300000,
    enableFeedbackLearning: true,
    contextWindowSize: 5,
  },
}));

vi.mock('../../src/services/skill/embeddingUtils.js', () => ({
  mergeHybridResults: vi.fn((semanticResults, keywordResults, semW, kwW) => {
    const scoreMap = new Map<string, { semanticScore: number; keywordScore: number; finalScore: number }>();
    for (const r of semanticResults) {
      scoreMap.set(r.skillId, { semanticScore: Math.max(0, r.similarity), keywordScore: 0, finalScore: 0 });
    }
    const maxKw = keywordResults.reduce((m: number, r: { score: number }) => Math.max(m, r.score), 1);
    for (const r of keywordResults) {
      const norm = r.score / maxKw;
      const existing = scoreMap.get(r.skillId);
      if (existing) {
        existing.keywordScore = norm;
      } else {
        scoreMap.set(r.skillId, { semanticScore: 0, keywordScore: norm, finalScore: 0 });
      }
    }
    const results: Array<{ skillId: string; finalScore: number; semanticScore: number; keywordScore: number }> = [];
    for (const [skillId, scores] of scoreMap) {
      results.push({
        skillId,
        finalScore: semW * scores.semanticScore + kwW * scores.keywordScore,
        semanticScore: scores.semanticScore,
        keywordScore: scores.keywordScore,
      });
    }
    results.sort((a, b) => b.finalScore - a.finalScore);
    return results;
  }),
}));

const mockSemanticSearch = vi.fn<() => Promise<Array<{ skillId: string; similarity: number }>>>();
const mockBatchGenerateEmbeddings = vi.fn(() => ({
  total: 4,
  newCount: 4,
  updatedCount: 0,
  skippedCount: 0,
  errorCount: 0,
  errors: [],
}));

vi.mock('../services/embeddingService.js', () => ({
  semanticSearch: (...args: any[]) => (mockSemanticSearch as any)(...args),
  generateEmbedding: vi.fn(() => ({
    skillId: 'test',
    embedding: new Float32Array(384),
    contentHash: 'abc',
    modelName: 'all-MiniLM-L6-v2',
    dimensions: 384,
    isNew: true,
    updated: false,
  })),
  invalidateCache: vi.fn(),
  batchGenerateEmbeddings: (...args: any[]) => (mockBatchGenerateEmbeddings as any)(...args),
}));

const mockCreateMatchFeedback = vi.fn(() => 1);
const mockGetMatchEngineConfigValue = vi.fn((key: string) => {
  const defaults: Record<string, string> = {
    semantic_weight: '0.6',
    keyword_weight: '0.4',
    default_threshold: '0.3',
    default_top_k: '10',
    cache_ttl_ms: '300000',
    enable_feedback_learning: '1',
    context_window_size: '5',
  };
  return defaults[key] ?? null;
});
const mockBatchUpdateMatchEngineConfig = vi.fn();
const mockResetMatchEngineConfig = vi.fn();
const mockGetAverageFeedbackScore = vi.fn(() => 0.5);
const mockGetMatchFeedback = vi.fn(() => []);

vi.mock('../dao/matchingDao.js', () => ({
  createMatchFeedback: (...args: any[]) => (mockCreateMatchFeedback as any)(...args),
  getMatchEngineConfigValue: (...args: any[]) => (mockGetMatchEngineConfigValue as any)(...args),
  setMatchEngineConfigValue: vi.fn(),
  getAverageFeedbackScore: (...args: any[]) => (mockGetAverageFeedbackScore as any)(...args),
  batchUpdateMatchEngineConfig: (...args: any[]) => (mockBatchUpdateMatchEngineConfig as any)(...args),
  resetMatchEngineConfig: (...args: any[]) => (mockResetMatchEngineConfig as any)(...args),
  getMatchFeedback: (...args: any[]) => (mockGetMatchFeedback as any)(...args),
}));

// ===================== 导入被测模块 =====================

import {
  match,
  getRuntimeConfig,
  updateRuntimeConfig,
  resetConfig,
  recordFeedback,
  getFeedbackHistory,
  initMatchingEngine,
  rebuildAllEmbeddings,
} from '../services/matchingService.js';

describe('Matching Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置配置 mock 为默认值
    mockGetMatchEngineConfigValue.mockImplementation((key: string) => {
      const defaults: Record<string, string> = {
        semantic_weight: '0.6',
        keyword_weight: '0.4',
        default_threshold: '0.3',
        default_top_k: '10',
        cache_ttl_ms: '300000',
        enable_feedback_learning: '1',
        context_window_size: '5',
      };
      return defaults[key] ?? null;
    });
    mockGetAverageFeedbackScore.mockReturnValue(0.5);
    // semanticSearch 默认返回空 Promise
    mockSemanticSearch.mockResolvedValue([]);
  });

  // ===================== 配置读写 =====================

  describe('getRuntimeConfig', () => {
    it('应返回默认配置', () => {
      const config = getRuntimeConfig();
      expect(config.semanticWeight).toBe(0.6);
      expect(config.keywordWeight).toBe(0.4);
      expect(config.defaultThreshold).toBe(0.3);
      expect(config.defaultTopK).toBe(10);
      expect(config.cacheTtlMs).toBe(300000);
      expect(config.enableFeedbackLearning).toBe(true);
      expect(config.contextWindowSize).toBe(5);
    });
  });

  describe('updateRuntimeConfig', () => {
    it('应更新指定配置项', () => {
      updateRuntimeConfig({ semanticWeight: 0.8, keywordWeight: 0.2 });
      expect(mockBatchUpdateMatchEngineConfig).toHaveBeenCalled();
    });

    it('不传参数时不应调用批量更新', () => {
      updateRuntimeConfig({});
      expect(mockBatchUpdateMatchEngineConfig).not.toHaveBeenCalled();
    });
  });

  describe('resetConfig', () => {
    it('应重置配置为默认值', () => {
      resetConfig();
      expect(mockResetMatchEngineConfig).toHaveBeenCalled();
    });
  });

  // ===================== keyword 模式匹配 =====================

  describe('match() - keyword 模式', () => {
    it('输入匹配 trigger 时应返回对应技能', async () => {
      const results = await match({
        query: '查看库存',
        matchMode: 'keyword',
        topK: 5,
        threshold: 0,
      });
      expect(results.length).toBeGreaterThan(0);
      const inventoryMatch = results.find(r => r.skillId === 'builtin-inventory');
      expect(inventoryMatch).toBeDefined();
      expect(inventoryMatch!.matchMode).toBe('keyword');
    });

    it('输入匹配 name 时应返回对应技能', async () => {
      const results = await match({
        query: '库存管理',
        matchMode: 'keyword',
        topK: 5,
        threshold: 0,
      });
      expect(results.length).toBeGreaterThan(0);
      const inventoryMatch = results.find(r => r.skillId === 'builtin-inventory');
      expect(inventoryMatch).toBeDefined();
    });

    it('空查询应返回空结果', async () => {
      const results = await match({
        query: '   ',
        matchMode: 'keyword',
        topK: 5,
        threshold: 0,
      });
      expect(results.length).toBe(0);
    });

    it('不相关的查询应返回空或低分结果', async () => {
      const results = await match({
        query: 'xyz不存在的技能abc',
        matchMode: 'keyword',
        topK: 5,
        threshold: 0,
      });
      for (const r of results) {
        expect(r.score).toBeLessThan(0.5);
      }
    });

    it('结果应包含 skillName', async () => {
      const results = await match({
        query: '库存',
        matchMode: 'keyword',
        topK: 5,
        threshold: 0,
      });
      for (const r of results) {
        expect(r.skillName).toBeDefined();
        expect(r.skillName.length).toBeGreaterThan(0);
      }
    });

    it('结果应包含 reasons', async () => {
      const results = await match({
        query: '库存',
        matchMode: 'keyword',
        topK: 5,
        threshold: 0,
      });
      for (const r of results) {
        expect(Array.isArray(r.reasons)).toBe(true);
      }
    });
  });

  // ===================== semantic 模式匹配 =====================

  describe('match() - semantic 模式', () => {
    it('应调用 semanticSearch 并返回结果', async () => {
      mockSemanticSearch.mockResolvedValueOnce([
        { skillId: 'builtin-inventory', similarity: 0.85 },
      ]);

      const results = await match({
        query: '查询库存状态',
        matchMode: 'semantic',
        topK: 5,
        threshold: 0.3,
      });

      expect(mockSemanticSearch).toHaveBeenCalledWith('查询库存状态', 5, 0.3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].skillId).toBe('builtin-inventory');
      expect(results[0].matchMode).toBe('semantic');
      expect(results[0].score).toBeCloseTo(0.85, 3);
    });

    it('语义搜索无结果时应返回空', async () => {
      mockSemanticSearch.mockResolvedValueOnce([]);

      const results = await match({
        query: '不存在的查询',
        matchMode: 'semantic',
        topK: 5,
        threshold: 0.3,
      });

      expect(results.length).toBe(0);
    });
  });

  // ===================== hybrid 模式匹配 =====================

  describe('match() - hybrid 模式', () => {
    it('应融合语义和关键词搜索结果', async () => {
      mockSemanticSearch.mockResolvedValueOnce([
        { skillId: 'builtin-inventory', similarity: 0.85 },
        { skillId: 'builtin-inbound', similarity: 0.4 },
      ]);

      const results = await match({
        query: '库存',
        matchMode: 'hybrid',
        topK: 5,
        threshold: 0,
      });

      expect(mockSemanticSearch).toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchMode).toBe('hybrid');
    });

    it('应支持反馈学习', async () => {
      mockSemanticSearch.mockResolvedValueOnce([
        { skillId: 'builtin-inventory', similarity: 0.8 },
      ]);

      await match({
        query: '库存',
        matchMode: 'hybrid',
        topK: 5,
        threshold: 0,
      });

      expect(mockGetAverageFeedbackScore).toHaveBeenCalled();
    });
  });

  // ===================== context 模式匹配 =====================

  describe('match() - context 模式', () => {
    it('应使用上下文增强搜索', async () => {
      mockSemanticSearch.mockResolvedValueOnce([
        { skillId: 'builtin-inventory', similarity: 0.75 },
      ]);

      const results = await match(
        {
          query: '查看状态',
          matchMode: 'context',
          topK: 5,
          threshold: 0.3,
        },
        ['之前讨论了库存', '需要查看库存预警']
      );

      expect(mockSemanticSearch).toHaveBeenCalled();
      const callArgs: any[] = (mockSemanticSearch.mock.calls[0] || []) as any[];
      expect(callArgs[0]).toContain('之前讨论了库存');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchMode).toBe('context');
    });

    it('无上下文消息时应仍可正常查询', async () => {
      mockSemanticSearch.mockResolvedValueOnce([
        { skillId: 'builtin-inventory', similarity: 0.7 },
      ]);

      const results = await match(
        {
          query: '库存',
          matchMode: 'context',
          topK: 5,
          threshold: 0.3,
        },
        []
      );

      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ===================== 降级策略 =====================

  describe('match() - 降级策略', () => {
    it('未知匹配模式应降级到 hybrid', async () => {
      mockSemanticSearch.mockResolvedValueOnce([
        { skillId: 'builtin-inventory', similarity: 0.8 },
      ]);

      const results = await match({
        query: '库存',
        matchMode: 'unknown' as any,
        topK: 5,
        threshold: 0,
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ===================== 过滤和排除 =====================

  describe('match() - 过滤与排除', () => {
    it('excludeSkillIds 应排除指定技能', async () => {
      const results = await match({
        query: '库存',
        matchMode: 'keyword',
        topK: 10,
        threshold: 0,
        excludeSkillIds: ['builtin-inventory'],
      });
      const excluded = results.find(r => r.skillId === 'builtin-inventory');
      expect(excluded).toBeUndefined();
    });

    it('categoryFilter 应只保留指定分类', async () => {
      const results = await match({
        query: '库存',
        matchMode: 'keyword',
        topK: 10,
        threshold: 0,
        categoryFilter: ['core'],
      });
      for (const r of results) {
        expect(r.skillId).toContain('builtin-');
      }
    });
  });

  // ===================== 匹配反馈 =====================

  describe('recordFeedback', () => {
    it('应记录匹配反馈', () => {
      const id = recordFeedback('库存查询', 'builtin-inventory', 'keyword', 0.8, true, 5);
      expect(id).toBeDefined();
    });
  });

  describe('getFeedbackHistory', () => {
    it('应返回反馈历史', () => {
      const history = getFeedbackHistory({ skillId: 'builtin-inventory' });
      expect(Array.isArray(history)).toBe(true);
    });
  });

  // ===================== 初始化 =====================

  describe('initMatchingEngine', () => {
    it('应返回嵌入统计', async () => {
      const stats = await initMatchingEngine();
      expect(stats.embeddingStats).toBeDefined();
      expect(stats.embeddingStats.total).toBe(4); // 4 个 mock BUILTIN_SKILLS
    });
  });

  describe('rebuildAllEmbeddings', () => {
    it('应强制重建嵌入向量', async () => {
      const stats = await rebuildAllEmbeddings();
      expect(stats).toBeDefined();
      expect(stats.total).toBe(4); // 4 个 mock BUILTIN_SKILLS
    });
  });
});
