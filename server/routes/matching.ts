/**
 * Matching API Routes — 语义匹配引擎 REST 接口
 *
 * 挂载路径: /api/matching
 *
 * 接口列表：
 * - POST /api/matching/match       — 执行匹配查询
 * - GET  /api/matching/config      — 获取引擎配置
 * - PUT  /api/matching/config      — 更新引擎配置
 * - POST /api/matching/config/reset — 重置为默认配置
 * - POST /api/matching/feedback    — 提交匹配反馈
 * - GET  /api/matching/feedback    — 获取反馈历史
 * - POST /api/matching/embeddings/rebuild — 重建所有嵌入向量
 * - GET  /api/matching/status      — 获取引擎状态
 */

import { Router, type Request, type Response } from 'express';
import type { MatchMode, MatchQuery, MatchEngineRuntimeConfig } from '../../src/types/semantic.js';
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
import { getAllEmbeddings } from '../services/embeddingService.js';

const router = Router();

// ===================== POST /api/matching/match =====================

/**
 * 执行匹配查询
 *
 * Body: {
 *   query: string;           // 查询文本
 *   matchMode: MatchMode;    // 'semantic' | 'keyword' | 'hybrid' | 'context'
 *   topK?: number;           // 返回数量（默认 10）
 *   threshold?: number;       // 最低阈值（默认 0.3）
 *   categoryFilter?: string[];  // 分类过滤
 *   excludeSkillIds?: string[]; // 排除技能 ID
 *   contextMessages?: string[]; // 上下文消息（context 模式）
 * }
 */
router.post('/match', (req: Request, res: Response) => {
  try {
    const {
      query,
      matchMode,
      topK,
      threshold,
      categoryFilter,
      excludeSkillIds,
      contextMessages,
    } = req.body;

    // 参数校验
    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ success: false, error: 'query is required and must be a non-empty string' });
      return;
    }

    const validModes: MatchMode[] = ['semantic', 'keyword', 'hybrid', 'context'];
    if (!matchMode || !validModes.includes(matchMode)) {
      res.status(400).json({
        success: false,
        error: `matchMode is required and must be one of: ${validModes.join(', ')}`,
      });
      return;
    }

    const matchQuery: MatchQuery = {
      query: query.trim(),
      matchMode,
      topK: topK ?? undefined,
      threshold: threshold ?? undefined,
      categoryFilter: Array.isArray(categoryFilter) && categoryFilter.length > 0 ? categoryFilter : undefined,
      excludeSkillIds: Array.isArray(excludeSkillIds) && excludeSkillIds.length > 0 ? excludeSkillIds : undefined,
    };

    const results = match(matchQuery, contextMessages);

    res.json({ success: true, data: results });
  } catch (e) {
    console.error('[Matching API] match error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== GET /api/matching/config =====================

/**
 * 获取匹配引擎配置
 */
router.get('/config', (_req: Request, res: Response) => {
  try {
    const config = getRuntimeConfig();
    res.json({ success: true, data: config });
  } catch (e) {
    console.error('[Matching API] get config error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== PUT /api/matching/config =====================

/**
 * 更新匹配引擎配置
 *
 * Body: Partial<MatchEngineRuntimeConfig>
 */
router.put('/config', (req: Request, res: Response) => {
  try {
    const updates = req.body as Partial<MatchEngineRuntimeConfig>;

    // 参数校验
    if (updates.semanticWeight !== undefined && (updates.semanticWeight < 0 || updates.semanticWeight > 1)) {
      res.status(400).json({ success: false, error: 'semanticWeight must be between 0 and 1' });
      return;
    }
    if (updates.keywordWeight !== undefined && (updates.keywordWeight < 0 || updates.keywordWeight > 1)) {
      res.status(400).json({ success: false, error: 'keywordWeight must be between 0 and 1' });
      return;
    }
    if (updates.defaultThreshold !== undefined && (updates.defaultThreshold < 0 || updates.defaultThreshold > 1)) {
      res.status(400).json({ success: false, error: 'defaultThreshold must be between 0 and 1' });
      return;
    }
    if (updates.defaultTopK !== undefined && (updates.defaultTopK < 1 || updates.defaultTopK > 100)) {
      res.status(400).json({ success: false, error: 'defaultTopK must be between 1 and 100' });
      return;
    }

    const config = updateRuntimeConfig(updates);
    res.json({ success: true, data: config });
  } catch (e) {
    console.error('[Matching API] update config error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== POST /api/matching/config/reset =====================

/**
 * 重置匹配引擎配置为默认值
 */
router.post('/config/reset', (_req: Request, res: Response) => {
  try {
    const config = resetConfig();
    res.json({ success: true, data: config });
  } catch (e) {
    console.error('[Matching API] reset config error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== POST /api/matching/feedback =====================

/**
 * 提交匹配反馈
 *
 * Body: {
 *   query: string;
 *   skillId: string;
 *   matchMode: MatchMode;
 *   matchScore: number;
 *   isRelevant: boolean;
 *   userFeedback?: number;  // 1=正面, -1=负面, null=未评分
 * }
 */
router.post('/feedback', (req: Request, res: Response) => {
  try {
    const { query, skillId, matchMode, matchScore, isRelevant, userFeedback } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ success: false, error: 'query is required' });
      return;
    }
    if (!skillId || typeof skillId !== 'string') {
      res.status(400).json({ success: false, error: 'skillId is required' });
      return;
    }
    if (!matchMode || typeof matchMode !== 'string') {
      res.status(400).json({ success: false, error: 'matchMode is required' });
      return;
    }
    if (typeof matchScore !== 'number') {
      res.status(400).json({ success: false, error: 'matchScore is required and must be a number' });
      return;
    }
    if (typeof isRelevant !== 'boolean') {
      res.status(400).json({ success: false, error: 'isRelevant is required and must be a boolean' });
      return;
    }

    const id = recordFeedback(
      query,
      skillId,
      matchMode as MatchMode,
      matchScore,
      isRelevant,
      userFeedback
    );

    res.status(201).json({ success: true, data: { id } });
  } catch (e) {
    console.error('[Matching API] feedback error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== GET /api/matching/feedback =====================

/**
 * 获取反馈历史
 *
 * Query params:
 *   skillId?: string
 *   matchMode?: string
 *   limit?: number
 */
router.get('/feedback', (req: Request, res: Response) => {
  try {
    const skillId = req.query.skillId as string | undefined;
    const matchMode = req.query.matchMode as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const feedback = getFeedbackHistory({
      skillId,
      matchMode,
      limit,
    });

    res.json({ success: true, data: feedback });
  } catch (e) {
    console.error('[Matching API] get feedback error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== POST /api/matching/embeddings/rebuild =====================

/**
 * 强制重建所有嵌入向量
 */
router.post('/embeddings/rebuild', (_req: Request, res: Response) => {
  try {
    const stats = rebuildAllEmbeddings();
    res.json({ success: true, data: stats });
  } catch (e) {
    console.error('[Matching API] rebuild embeddings error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== GET /api/matching/status =====================

/**
 * 获取匹配引擎状态
 * 返回嵌入向量数量、缓存状态等信息
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const embeddings = getAllEmbeddings();
    const config = getRuntimeConfig();

    res.json({
      success: true,
      data: {
        embeddingCount: embeddings.size,
        modelName: 'all-MiniLM-L6-v2',
        dimensions: 384,
        engineMode: 'mock', // v1.3.0 使用 mock，v1.3.1 切换为 onnx
        config: {
          semanticWeight: config.semanticWeight,
          keywordWeight: config.keywordWeight,
          defaultThreshold: config.defaultThreshold,
          defaultTopK: config.defaultTopK,
          enableFeedbackLearning: config.enableFeedbackLearning,
          contextWindowSize: config.contextWindowSize,
        },
      },
    });
  } catch (e) {
    console.error('[Matching API] status error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

export default router;
