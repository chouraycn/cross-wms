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
import type { MatchMode, MatchQuery, MatchEngineRuntimeConfig } from '@src/types/semantic';
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
import { logger } from '../logger.js';
import { ok, created, fail, serverError, BizCode } from './_shared/respond.js';

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
router.post('/match', async (req: Request, res: Response) => {
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
      return fail(res, BizCode.BAD_REQUEST, 'query is required and must be a non-empty string', 400);
    }

    const validModes: MatchMode[] = ['semantic', 'keyword', 'hybrid', 'context'];
    if (!matchMode || !validModes.includes(matchMode)) {
      return fail(res, BizCode.BAD_REQUEST, `matchMode is required and must be one of: ${validModes.join(', ')}`, 400);
    }

    const matchQuery: MatchQuery = {
      query: query.trim(),
      matchMode,
      topK: topK ?? undefined,
      threshold: threshold ?? undefined,
      categoryFilter: Array.isArray(categoryFilter) && categoryFilter.length > 0 ? categoryFilter : undefined,
      excludeSkillIds: Array.isArray(excludeSkillIds) && excludeSkillIds.length > 0 ? excludeSkillIds : undefined,
    };

    const results = await match(matchQuery, contextMessages);

    return ok(res, results);
  } catch (e) {
    logger.error('[Matching API] match error:', e);
    return serverError(res, (e as Error).message);
  }
});

// ===================== GET /api/matching/config =====================

/**
 * 获取匹配引擎配置
 */
router.get('/config', (_req: Request, res: Response) => {
  try {
    const config = getRuntimeConfig();
    return ok(res, config);
  } catch (e) {
    logger.error('[Matching API] get config error:', e);
    return serverError(res, (e as Error).message);
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
      return fail(res, BizCode.BAD_REQUEST, 'semanticWeight must be between 0 and 1', 400);
    }
    if (updates.keywordWeight !== undefined && (updates.keywordWeight < 0 || updates.keywordWeight > 1)) {
      return fail(res, BizCode.BAD_REQUEST, 'keywordWeight must be between 0 and 1', 400);
    }
    if (updates.defaultThreshold !== undefined && (updates.defaultThreshold < 0 || updates.defaultThreshold > 1)) {
      return fail(res, BizCode.BAD_REQUEST, 'defaultThreshold must be between 0 and 1', 400);
    }
    if (updates.defaultTopK !== undefined && (updates.defaultTopK < 1 || updates.defaultTopK > 100)) {
      return fail(res, BizCode.BAD_REQUEST, 'defaultTopK must be between 1 and 100', 400);
    }

    const config = updateRuntimeConfig(updates);
    return ok(res, config);
  } catch (e) {
    logger.error('[Matching API] update config error:', e);
    return serverError(res, (e as Error).message);
  }
});

// ===================== POST /api/matching/config/reset =====================

/**
 * 重置匹配引擎配置为默认值
 */
router.post('/config/reset', (_req: Request, res: Response) => {
  try {
    const config = resetConfig();
    return ok(res, config);
  } catch (e) {
    logger.error('[Matching API] reset config error:', e);
    return serverError(res, (e as Error).message);
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
      return fail(res, BizCode.BAD_REQUEST, 'query is required', 400);
    }
    if (!skillId || typeof skillId !== 'string') {
      return fail(res, BizCode.BAD_REQUEST, 'skillId is required', 400);
    }
    if (!matchMode || typeof matchMode !== 'string') {
      return fail(res, BizCode.BAD_REQUEST, 'matchMode is required', 400);
    }
    if (typeof matchScore !== 'number') {
      return fail(res, BizCode.BAD_REQUEST, 'matchScore is required and must be a number', 400);
    }
    if (typeof isRelevant !== 'boolean') {
      return fail(res, BizCode.BAD_REQUEST, 'isRelevant is required and must be a boolean', 400);
    }

    const id = recordFeedback(
      query,
      skillId,
      matchMode as MatchMode,
      matchScore,
      isRelevant,
      userFeedback
    );

    return created(res, { id });
  } catch (e) {
    logger.error('[Matching API] feedback error:', e);
    return serverError(res, (e as Error).message);
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

    return ok(res, feedback);
  } catch (e) {
    logger.error('[Matching API] get feedback error:', e);
    return serverError(res, (e as Error).message);
  }
});

// ===================== POST /api/matching/embeddings/rebuild =====================

/**
 * 强制重建所有嵌入向量
 */
router.post('/embeddings/rebuild', async (_req: Request, res: Response) => {
  try {
    const stats = await rebuildAllEmbeddings();
    return ok(res, stats);
  } catch (e) {
    logger.error('[Matching API] rebuild embeddings error:', e);
    return serverError(res, (e as Error).message);
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

    return ok(res, {
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
    });
  } catch (e) {
    logger.error('[Matching API] status error:', e);
    return serverError(res, (e as Error).message);
  }
});

export default router;
