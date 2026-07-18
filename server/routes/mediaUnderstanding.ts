/**
 * Media Understanding REST API — 媒体理解路由
 *
 * 把 server/engine/media-understanding 的分析能力通过 HTTP 暴露。
 *
 * 端点：
 * - POST /api/media-understanding/analyze     — 分析媒体文件（图片/音频/视频/文档）
 * - POST /api/media-understanding/extract-text — OCR 文本提取
 * - POST /api/media-understanding/transcribe   — 音频/视频转录
 * - POST /api/media-understanding/describe     — 生成媒体描述
 * - GET  /api/media-understanding/capabilities — 支持的能力列表
 *
 * 支持两种输入：
 * 1. multipart/form-data 上传文件（field name: 'file'）
 * 2. application/json 提交 { url, fileName?, mime?, options? }
 */

import { Router, type Request, type Response } from 'express';
import {
  createMediaAnalyzerRegistry,
  registerMultimodalProvider,
  defaultMultimodalProvider,
  inferMediaKind,
} from '../engine/media-understanding/index.js';
import type {
  AnalyzeOptions,
  MediaAnalysis,
  MediaInput,
  MediaKind,
} from '../engine/media-understanding/index.js';
import { parseMultipartFormData } from './upload.js';
import { logger } from '../logger.js';

const router = Router();

/** 懒加载的媒体分析器注册表单例 */
let registrySingleton: ReturnType<typeof createMediaAnalyzerRegistry> | null = null;

function getRegistry(): ReturnType<typeof createMediaAnalyzerRegistry> {
  if (!registrySingleton) {
    const registry = createMediaAnalyzerRegistry();
    // 注册默认多模态 Provider（无 describeFn，实际 LLM 调用需调用方注入）
    // 文档分析可通过本地依赖（pdf-parse/mammoth/xlsx）独立工作
    registerMultimodalProvider(registry.providers, defaultMultimodalProvider);
    registrySingleton = registry;
    logger.debug('[media-understanding] 分析器注册表已初始化');
  }
  return registrySingleton;
}

/** 从远端 URL 下载内容到 Buffer */
async function fetchUrlToBuffer(
  url: string,
  timeoutMs = 30_000,
): Promise<{ buffer: Buffer; mime: string; fileName: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`下载失败: HTTP ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = res.headers.get('content-type') || 'application/octet-stream';
    const urlPath = new URL(url).pathname;
    const fileName = urlPath.split('/').pop() || 'download';
    return { buffer, mime, fileName };
  } finally {
    clearTimeout(timer);
  }
}

/** 从请求中提取 MediaInput（支持 multipart 和 JSON 两种方式） */
async function resolveMediaInput(req: Request): Promise<MediaInput & { options?: AnalyzeOptions }> {
  const contentType = req.headers['content-type'] || '';

  // multipart/form-data 上传
  if (contentType.includes('multipart/form-data')) {
    const parsed = await parseMultipartFormData(req);
    if (!parsed) {
      throw new Error('未找到上传文件或请求格式错误');
    }
    return {
      buffer: parsed.data,
      fileName: parsed.fileName,
      mime: parsed.mimeType,
    };
  }

  // JSON 提交（URL 或 base64）
  const { url, fileName, mime, options } = req.body || {};
  if (!url || typeof url !== 'string') {
    throw new Error('请提供 multipart 文件上传或 JSON { url }');
  }

  // URL 输入：直接传递 url，registry 会处理
  // 同时下载内容到 buffer 以支持 OCR/本地文档提取
  const input: MediaInput & { options?: AnalyzeOptions } = { url, fileName, mime, options };
  try {
    const fetched = await fetchUrlToBuffer(url);
    input.buffer = fetched.buffer;
    if (!input.fileName) input.fileName = fetched.fileName;
    if (!input.mime) input.mime = fetched.mime;
  } catch (e) {
    logger.warn(`[media-understanding] 下载 URL 失败，将仅使用 URL 传递给 Provider: ${e instanceof Error ? e.message : String(e)}`);
  }
  return input;
}

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function fail(res: Response, message: string, status = 500): void {
  res.status(status).json({ success: false, error: message });
}

/**
 * POST /api/media-understanding/analyze
 * 分析媒体文件（图片/音频/视频/文档）
 *
 * 返回：类型检测、内容描述、标签、OCR 文本（图片）、转录文本（音频/视频）
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const input = await resolveMediaInput(req);
    const options = input.options;
    const registry = getRegistry();

    const kind = inferMediaKind(input.mime, input.fileName);
    if (!kind) {
      return fail(res, `无法推断媒体类型，请提供有效的 mime/fileName（mime=${input.mime}, fileName=${input.fileName}）`, 400);
    }

    const analysis: MediaAnalysis = await registry.analyze(input, { ...options, kind });
    return ok(res, { kind, result: analysis.result });
  } catch (err) {
    return fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * POST /api/media-understanding/extract-text
 * OCR 文本提取（图片）或文档文本提取
 */
router.post('/extract-text', async (req: Request, res: Response) => {
  try {
    const input = await resolveMediaInput(req);
    const registry = getRegistry();
    const kind = inferMediaKind(input.mime, input.fileName);

    if (kind === 'image') {
      const analysis = await registry.analyze(input, { ocr: true, kind: 'image' });
      if (analysis.kind === 'image') {
        return ok(res, { text: analysis.result.ocrText ?? '', tags: analysis.result.tags });
      }
    }
    if (kind === 'document') {
      const analysis = await registry.analyze(input, { kind: 'document' });
      if (analysis.kind === 'document') {
        return ok(res, { text: analysis.result.text, documentType: analysis.result.documentType });
      }
    }
    return fail(res, `不支持的媒体类型用于文本提取: ${kind ?? 'unknown'}`, 400);
  } catch (err) {
    return fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * POST /api/media-understanding/transcribe
 * 音频/视频转录
 */
router.post('/transcribe', async (req: Request, res: Response) => {
  try {
    const input = await resolveMediaInput(req);
    const registry = getRegistry();
    const kind = inferMediaKind(input.mime, input.fileName);

    if (kind !== 'audio' && kind !== 'video') {
      return fail(res, `转录仅支持音频/视频，当前类型: ${kind ?? 'unknown'}`, 400);
    }

    const analysis = await registry.analyze(input, { kind });
    if (analysis.kind === 'audio') {
      return ok(res, { transcript: analysis.result.transcript ?? '', hasMusic: analysis.result.hasMusic, durationSeconds: analysis.result.durationSeconds });
    }
    if (analysis.kind === 'video') {
      return ok(res, { description: analysis.result.description, keyframes: analysis.result.keyframes, durationSeconds: analysis.result.durationSeconds });
    }
    return fail(res, '转录失败：未知结果类型', 500);
  } catch (err) {
    return fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * POST /api/media-understanding/describe
 * 生成媒体描述
 */
router.post('/describe', async (req: Request, res: Response) => {
  try {
    const input = await resolveMediaInput(req);
    const registry = getRegistry();
    const kind = inferMediaKind(input.mime, input.fileName);

    if (!kind) {
      return fail(res, '无法推断媒体类型', 400);
    }

    const analysis = await registry.analyze(input, { kind });
    let description: string;
    let tags: string[] = [];

    if (analysis.kind === 'image') {
      description = analysis.result.description;
      tags = analysis.result.tags;
    } else if (analysis.kind === 'video') {
      description = analysis.result.description;
    } else if (analysis.kind === 'audio') {
      description = analysis.result.transcript ?? '(无转录文本)';
    } else {
      description = analysis.result.text.slice(0, 500);
    }
    return ok(res, { kind: analysis.kind, description, tags });
  } catch (err) {
    return fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * GET /api/media-understanding/capabilities
 * 支持的能力列表
 */
router.get('/capabilities', (_req: Request, res: Response) => {
  const registry = getRegistry();
  const kinds: MediaKind[] = registry.list();
  const capabilities = kinds.map((kind) => {
    const info: Record<string, unknown> = { kind, supported: true };
    if (kind === 'image') {
      info.features = ['description', 'tags', 'ocr', 'faceDetection', 'safetyDetection'];
    } else if (kind === 'audio') {
      info.features = ['transcript', 'hasMusic', 'emotion'];
    } else if (kind === 'video') {
      info.features = ['description', 'keyframes', 'scenes', 'actions'];
    } else if (kind === 'document') {
      info.features = ['text', 'documentType', 'pageCount'];
    }
    return info;
  });
  // 检查 Provider 可用性
  const multimodalProviders = Array.from(registry.providers.multimodal.values()).map((p) => ({
    id: p.id,
    capabilities: p.capabilities,
  }));
  const ocrProviders = Array.from(registry.providers.ocr.keys());
  return ok(res, {
    analyzers: capabilities,
    providers: { multimodal: multimodalProviders, ocr: ocrProviders },
    note: '多模态 Provider 需注入 describeFn 才能进行图像/音频/视频分析；文档分析可通过本地依赖独立工作。',
  });
});

export default router;
