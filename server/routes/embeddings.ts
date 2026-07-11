/**
 * Embeddings API Routes — 嵌入向量生成 REST 接口
 *
 * 挂载路径: /api/embeddings
 *
 * 接口列表：
 * - POST /api/embeddings         — 生成文本嵌入向量（单条或批量）
 * - GET  /api/embeddings/providers — 列出已注册的嵌入提供者
 *
 * 委托给 engine/embedding-providers 集群（ONNX 本地推理 + 注册中心）。
 * 提供者为懒加载：首次调用时自动 initEmbeddingProviders()。
 */

import { Router, type Request, type Response } from 'express';
import {
  embedText,
  embedTextBatch,
  globalEmbeddingRegistry,
  initEmbeddingProviders,
} from '../engine/embedding-providers/index.js';
import { logger } from '../logger.js';

const router = Router();

// ===================== POST /api/embeddings =====================

/**
 * 生成文本嵌入向量
 *
 * Body（二选一）：
 *   { text: string; provider?: string }            — 单条
 *   { texts: string[]; provider?: string }          — 批量
 *
 * 返回：
 *   - 单条: { embedding: number[], dimensions, provider, model, cached?, durationMs? }
 *   - 批量: { embeddings: number[][], dimensions, provider, model, cachedCount, durationMs? }
 *
 * 注意：Float32Array 不可直接 JSON 序列化，此处转换为 number[]。
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { text, texts, provider } = req.body as {
      text?: string;
      texts?: string[];
      provider?: string;
    };

    if (typeof text === 'string') {
      const result = await embedText(text, provider);
      res.json({
        success: true,
        data: {
          embedding: Array.from(result.embedding),
          dimensions: result.dimensions,
          provider: result.provider,
          model: result.model,
          cached: result.cached,
          durationMs: result.durationMs,
        },
      });
      return;
    }

    if (Array.isArray(texts)) {
      if (texts.length === 0) {
        res.status(400).json({ success: false, error: 'texts must be a non-empty array' });
        return;
      }
      const result = await embedTextBatch(texts, provider);
      res.json({
        success: true,
        data: {
          embeddings: result.embeddings.map((e) => Array.from(e)),
          dimensions: result.dimensions,
          provider: result.provider,
          model: result.model,
          cachedCount: result.cachedCount,
          durationMs: result.durationMs,
        },
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: 'Either "text" (string) or "texts" (string[]) is required',
    });
  } catch (e) {
    logger.error('[Embeddings API] generate error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== GET /api/embeddings/providers =====================

/**
 * 列出已注册的嵌入提供者及其配置
 */
router.get('/providers', (_req: Request, res: Response) => {
  try {
    if (!globalEmbeddingRegistry.has('onnx')) {
      // 懒初始化，确保 providers 列表完整
      initEmbeddingProviders();
    }

    const providers = globalEmbeddingRegistry.listProviders();
    const defaultProviderId = globalEmbeddingRegistry.getDefaultProviderId();
    const stats = globalEmbeddingRegistry.getAllStats();

    res.json({
      success: true,
      data: {
        defaultProviderId,
        providers,
        stats,
      },
    });
  } catch (e) {
    logger.error('[Embeddings API] providers error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

export default router;
