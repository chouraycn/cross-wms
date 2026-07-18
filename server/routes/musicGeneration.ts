/**
 * Music Generation Routes — 音乐生成 API 路由
 *
 * 提供音乐生成相关的 REST API：
 *   GET  /api/music-generation/styles    — 列出音乐风格类别
 *   GET  /api/music-generation/providers — 列出已注册的 Provider
 *   GET  /api/music-generation/history   — 获取生成历史
 *   POST /api/music-generation/generate  — 生成音乐
 */

import { Router, type Request, type Response } from 'express';
import {
  listMusicProviders,
  listConfiguredMusicProviders,
  listStyleCategories,
  generateMusic,
  getMusicHistory,
  clearMusicHistory,
} from '../engine/music-generation/index.js';
import type { AudioFormat, MusicStyle } from '../engine/music-generation/types.js';
import { logger } from '../logger.js';

const router = Router();

/** 将 buffer 资产转换为可直接播放的 data URL */
function bufferToDataUrl(
  buffer: Buffer,
  mimeType: string,
): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/** 计算 buffer 大小（字节） */
function getBufferSize(buffer?: Buffer): number | undefined {
  return buffer ? buffer.length : undefined;
}

// GET /api/music-generation/styles
router.get('/styles', (_req: Request, res: Response) => {
  try {
    const categories = listStyleCategories().map((c) => ({
      ...c,
      // 前端期望的 presetId 字段：与 engine/style-preset.ts 中第一个该类别的 preset id 一致
      // 这里通过 listStyleCategories 仅返回 id/label/description，presetId 由前端常量镜像维护
    }));
    res.json({ success: true, data: categories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[MusicGen] Failed to list styles:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/music-generation/providers
router.get('/providers', (_req: Request, res: Response) => {
  try {
    const configured = listConfiguredMusicProviders();
    const configuredIds = new Set(configured.map((p) => p.id));

    const providers = listMusicProviders().map((p) => ({
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
    logger.error('[MusicGen] Failed to list providers:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/music-generation/history
router.get('/history', (_req: Request, res: Response) => {
  try {
    // 引擎历史仅保存元数据，不保留音频 buffer；这里整形为 MusicGenerationResult 形态，
    // tracks 为空数组（历史项不可回放，仅展示元信息）。
    const data = getMusicHistory().map((h) => ({
      tracks: [],
      provider: h.provider,
      model: h.model,
      originalPrompt: h.prompt,
      enhancedPrompt: h.enhancedPrompt,
      attempts: [],
      historyId: h.id,
      createdAt: h.createdAt,
      metadata: {
        trackCount: h.trackCount,
        durationMs: h.durationMs,
        success: h.success,
      },
    }));
    res.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[MusicGen] Failed to load history:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// DELETE /api/music-generation/history — 清空历史（辅助用，可选）
router.delete('/history', (_req: Request, res: Response) => {
  try {
    clearMusicHistory();
    res.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/music-generation/generate
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      stylePreset,
      style,
      durationSeconds,
      format,
      instrumental,
      lyrics,
      provider,
      model,
    } = req.body ?? {};

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ success: false, error: 'prompt is required' });
      return;
    }

    const result = await generateMusic({
      prompt,
      stylePreset: stylePreset as string | undefined,
      style: style as MusicStyle | undefined,
      durationSeconds: durationSeconds ? Number(durationSeconds) : undefined,
      format: format as AudioFormat | undefined,
      instrumental: instrumental === true ? true : undefined,
      lyrics: lyrics as string | undefined,
      providerOverride: provider as string | undefined,
      modelOverride: model as string | undefined,
      autoProviderFallback: true,
      saveToHistory: true,
    });

    const tracks = result.tracks.map((asset) => ({
      url: asset.buffer
        ? bufferToDataUrl(asset.buffer, asset.mimeType)
        : '',
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      durationSeconds: asset.durationSeconds,
      size: getBufferSize(asset.buffer),
      metadata: asset.metadata,
    }));

    res.json({
      success: true,
      data: {
        tracks,
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
    logger.error('[MusicGen] Generation failed:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
