/**
 * Video Generation Routes — 视频生成 API 路由
 *
 * 提供视频生成相关的 REST API：
 *   GET  /api/video-generation/styles    — 列出视频风格类别
 *   GET  /api/video-generation/providers — 列出已注册的 Provider
 *   GET  /api/video-generation/history   — 获取生成历史
 *   POST /api/video-generation/generate  — 生成视频
 */

import { Router, type Request, type Response } from 'express';
import {
  listVideoProviders,
  listConfiguredVideoProviders,
  listStyleCategories,
  generateVideo,
  getVideoHistory,
  clearVideoHistory,
} from '../engine/video-generation/index.js';
import type { VideoResolution, VideoStyle } from '../engine/video-generation/types.js';
import { logger } from '../logger.js';

const router = Router();

/** 将 buffer 资产转换为可直接播放的 data URL */
function bufferToDataUrl(
  buffer: Buffer,
  mimeType: string,
): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

// GET /api/video-generation/styles
router.get('/styles', (_req: Request, res: Response) => {
  try {
    const data = listStyleCategories();
    res.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[VideoGen] Failed to list styles:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/video-generation/providers
router.get('/providers', (_req: Request, res: Response) => {
  try {
    const configured = listConfiguredVideoProviders();
    const configuredIds = new Set(configured.map((p) => p.id));

    const providers = listVideoProviders().map((p) => ({
      id: p.id,
      label: p.label || p.id,
      aliases: p.aliases || [],
      available: configuredIds.has(p.id),
      defaultModel: p.defaultModel || '',
      models: p.models || [],
      defaultTimeoutMs: p.defaultTimeoutMs,
    }));

    res.json({
      success: true,
      data: providers,
      total: providers.length,
      available_count: providers.filter((p) => p.available).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[VideoGen] Failed to list providers:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/video-generation/history
router.get('/history', (_req: Request, res: Response) => {
  try {
    // 引擎历史仅保存元数据，不保留视频 buffer；这里整形为 VideoGenerationResult 形态，
    // videos 为空数组（历史项不可回放，仅展示元信息）。
    const data = getVideoHistory().map((h) => ({
      videos: [],
      provider: h.provider,
      model: h.model,
      originalPrompt: h.prompt,
      enhancedPrompt: h.enhancedPrompt,
      attempts: [],
      historyId: h.id,
      createdAt: h.createdAt,
      metadata: {
        videoCount: h.videoCount,
        durationMs: h.durationMs,
        success: h.success,
      },
    }));
    res.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[VideoGen] Failed to load history:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// DELETE /api/video-generation/history — 清空历史（辅助用，可选）
router.delete('/history', (_req: Request, res: Response) => {
  try {
    clearVideoHistory();
    res.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/video-generation/generate
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      stylePreset,
      style,
      size,
      aspectRatio,
      resolution,
      durationSeconds,
      fps,
      audio,
      watermark,
      provider,
      model,
    } = req.body ?? {};

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ success: false, error: 'prompt is required' });
      return;
    }

    const result = await generateVideo({
      prompt,
      stylePreset: stylePreset as string | undefined,
      style: style as VideoStyle | undefined,
      size: size as string | undefined,
      aspectRatio: aspectRatio as string | undefined,
      resolution: resolution as VideoResolution | undefined,
      durationSeconds: durationSeconds ? Number(durationSeconds) : undefined,
      fps: fps ? Number(fps) : undefined,
      audio: typeof audio === 'boolean' ? audio : undefined,
      watermark: typeof watermark === 'boolean' ? watermark : undefined,
      providerOverride: provider as string | undefined,
      modelOverride: model as string | undefined,
      autoProviderFallback: true,
      saveToHistory: true,
    });

    const videos = result.videos.map((asset) => ({
      url: asset.buffer
        ? bufferToDataUrl(asset.buffer, asset.mimeType)
        : asset.url || '',
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      durationSeconds: asset.durationSeconds,
      width: asset.width,
      height: asset.height,
      size: asset.buffer ? asset.buffer.length : undefined,
      metadata: asset.metadata,
    }));

    res.json({
      success: true,
      data: {
        videos,
        provider: result.provider,
        model: result.model,
        originalPrompt: result.originalPrompt,
        enhancedPrompt: result.enhancedPrompt,
        attempts: result.attempts,
        historyId: result.historyId,
        metadata: result.metadata,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[VideoGen] Generation failed:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
