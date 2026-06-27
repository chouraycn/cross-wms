/**
 * Image Generation Routes — 图片生成 API 路由
 *
 * 提供图片生成相关的 REST API：
 *   GET  /api/image-generation/providers — 列出可用的 Provider
 *   GET  /api/image-generation/config    — 获取图片生成配置
 *   PUT  /api/image-generation/config    — 更新图片生成配置
 *   POST /api/image-generation/generate  — 生成图片（测试用）
 */

import { Router, type Request, type Response } from 'express';
import {
  listRuntimeImageGenerationProviders,
  generateImage,
} from '../engine/image-generation/runtime.js';
import {
  getAppSettings as dbGet,
  setAppSettings as dbSet,
} from '../dao/settings.js';
import { logger } from '../logger.js';
import type {
  ImageGenerationOutputFormat,
  ImageGenerationQuality,
  ImageGenerationResolution,
  ImageGenerationBackground,
} from '../engine/image-generation/types.js';

const router = Router();
const SETTINGS_KEY = 'image_generation_config';

type ImageGenerationConfig = {
  defaultModel?: string;
  defaultSize?: string;
  defaultQuality?: string;
  defaultCount?: number;
  defaultOutputFormat?: string;
  providers?: Record<string, { apiKey?: string; baseUrl?: string }>;
};

function loadConfig(): ImageGenerationConfig {
  try {
    const raw = dbGet(SETTINGS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    logger.warn('[ImageGen] Failed to load config:', e);
  }
  return {};
}

function saveConfig(config: ImageGenerationConfig): void {
  try {
    dbSet(SETTINGS_KEY, JSON.stringify(config));
  } catch (e) {
    logger.error('[ImageGen] Failed to save config:', e);
    throw e;
  }
}

// GET /api/image-generation/providers
router.get('/providers', (_req: Request, res: Response) => {
  try {
    const providers = listRuntimeImageGenerationProviders({
      includeUnavailable: true,
    });

    const result = providers.map((p) => ({
      id: p.id,
      label: p.label || p.id,
      aliases: p.aliases || [],
      available: p.isConfigured ? p.isConfigured() : true,
      default_model: p.defaultModel || '',
      models: p.models || [],
      default_timeout_ms: p.defaultTimeoutMs,
      capabilities: {
        generate: {
          max_count: p.capabilities.generate.maxCount || 1,
          supports_size: p.capabilities.generate.supportsSize || false,
          supports_aspect_ratio:
            p.capabilities.generate.supportsAspectRatio || false,
          supports_resolution:
            p.capabilities.generate.supportsResolution || false,
        },
        edit: {
          enabled: p.capabilities.edit.enabled,
          max_input_images: p.capabilities.edit.maxInputImages || 0,
        },
        supported_sizes: p.capabilities.geometry?.sizes || [],
        supported_sizes_by_model:
          p.capabilities.geometry?.sizesByModel || {},
        supported_aspect_ratios:
          p.capabilities.geometry?.aspectRatios || [],
        supported_resolutions:
          p.capabilities.geometry?.resolutions || [],
        supported_qualities: p.capabilities.output?.qualities || [],
        supported_formats: p.capabilities.output?.formats || [],
        supported_backgrounds: p.capabilities.output?.backgrounds || [],
      },
    }));

    res.json({
      success: true,
      providers: result,
      total: result.length,
      available_count: result.filter((p) => p.available).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[ImageGen] Failed to list providers:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/image-generation/config
router.get('/config', (_req: Request, res: Response) => {
  try {
    const config = loadConfig();
    res.json({ success: true, data: config });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ success: false, error: msg });
  }
});

// PUT /api/image-generation/config
router.put('/config', (req: Request, res: Response) => {
  try {
    const config = req.body as ImageGenerationConfig;
    saveConfig(config);
    res.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[ImageGen] Failed to save config:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/image-generation/generate (测试/预览用)
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      model,
      count,
      size,
      aspect_ratio,
      resolution,
      quality,
      output_format,
      background,
      timeout_ms,
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ success: false, error: 'prompt is required' });
      return;
    }

    const result = await generateImage({
      prompt,
      modelOverride: model,
      count: count ? Number(count) : undefined,
      size: size as string | undefined,
      aspectRatio: aspect_ratio as string | undefined,
      resolution: resolution as ImageGenerationResolution | undefined,
      quality: quality as ImageGenerationQuality | undefined,
      outputFormat: output_format as ImageGenerationOutputFormat | undefined,
      background: background as ImageGenerationBackground | undefined,
      timeoutMs: timeout_ms ? Number(timeout_ms) : undefined,
      autoProviderFallback: true,
    });

    // 返回图片信息（不直接返回图片数据，由工具自己处理保存）
    res.json({
      success: true,
      provider: result.provider,
      model: result.model,
      image_count: result.images.length,
      attempts: result.attempts,
      ignored_overrides: result.ignoredOverrides,
      normalization: result.normalization,
      revised_prompts: result.images
        .map((img) => img.revisedPrompt)
        .filter(Boolean),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[ImageGen] Generation failed:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
