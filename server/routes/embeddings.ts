/**
 * Embeddings API Routes — 嵌入向量生成 REST 接口
 *
 * 挂载路径: /api/embeddings
 *
 * 接口列表：
 * - POST /api/embeddings         — 生成文本嵌入向量（单条或批量）
 * - GET  /api/embeddings/providers — 列出已注册的嵌入提供者
 */

import { Router, type Request, type Response } from 'express';
import {
  embedText,
  embedBatch,
  initOnnxEmbedding,
  globalEmbeddingRegistry,
  ONNX_EMBEDDING_DIMENSIONS,
} from '../engine/embedding-providers/index.js';
import { logger } from '../logger.js';

const router = Router();

// ===================== POST /api/embeddings =====================

/**
 * 生成文本嵌入向量
 *
 * Body（二选一）：
 *   { text: string }            — 单条
 *   { texts: string[] }          — 批量
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { text, texts } = req.body as {
      text?: string;
      texts?: string[];
    };

    if (typeof text === 'string') {
      const embedding = await embedText(text);
      res.json({
        success: true,
        data: {
          embedding: Array.from(embedding),
          dimensions: ONNX_EMBEDDING_DIMENSIONS,
          provider: 'onnx',
        },
      });
      return;
    }

    if (Array.isArray(texts)) {
      if (texts.length === 0) {
        res.status(400).json({ success: false, error: 'texts must be a non-empty array' });
        return;
      }
      const embeddings = await embedBatch(texts);
      res.json({
        success: true,
        data: {
          embeddings: embeddings.map((e) => Array.from(e)),
          dimensions: ONNX_EMBEDDING_DIMENSIONS,
          provider: 'onnx',
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
    // 懒初始化
    initOnnxEmbedding();

    const providers = globalEmbeddingRegistry.listProviders();
    const defaultProviderId = globalEmbeddingRegistry.getDefaultProviderId();

    res.json({
      success: true,
      data: {
        defaultProviderId,
        providers,
      },
    });
  } catch (e) {
    logger.error('[Embeddings API] providers error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

export default router;