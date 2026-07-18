/**
 * Image Generator Core — 图像生成器核心
 *
 * 提供图像生成的高级封装，整合 Prompt 优化、样式预设、尺寸预设、历史记录等功能。
 */

import { logger } from "../../logger.js";
import { generateImage as runtimeGenerateImage, type GenerateImageParams, type GenerateImageRuntimeResult } from "./runtime.js";
import { enhancePrompt, type PromptEnhanceOptions } from "./prompt-engineering.js";
import { getSizePreset, parseSizeString, type ImageSizePreset } from "./size-preset.js";
import { getStylePreset, type ImageStylePreset } from "./style-preset.js";
import { addToGenerationHistory, type GenerationHistoryRecord } from "./generation-history.js";
import type { GeneratedImageAsset, ImageGenerationBackground, ImageGenerationOutputFormat, ImageGenerationQuality, ImageGenerationResolution } from "./types.js";

export type GenerateWithPresetsParams = {
  prompt: string;
  sizePreset?: string;
  stylePreset?: string;
  count?: number;
  quality?: ImageGenerationQuality;
  outputFormat?: ImageGenerationOutputFormat;
  background?: ImageGenerationBackground;
  modelOverride?: string;
  autoProviderFallback?: boolean;
  timeoutMs?: number;
  promptEnhanceOptions?: PromptEnhanceOptions;
  saveToHistory?: boolean;
  customSize?: string;
  negativePrompt?: string;
};

export type GenerateWithPresetsResult = {
  images: GeneratedImageAsset[];
  provider: string;
  model: string;
  originalPrompt: string;
  enhancedPrompt: string;
  negativePrompt?: string;
  sizePreset?: ImageSizePreset;
  stylePreset?: ImageStylePreset;
  width?: number;
  height?: number;
  attempts: Array<{
    provider: string;
    model: string;
    error?: string;
  }>;
  metadata?: Record<string, unknown>;
  historyId?: string;
};

function resolveSize(params: {
  sizePreset?: string;
  customSize?: string;
}): { size?: string; width?: number; height?: number; preset?: ImageSizePreset } {
  if (params.sizePreset) {
    const preset = getSizePreset(params.sizePreset);
    if (preset) {
      return {
        size: `${preset.width}*${preset.height}`,
        width: preset.width,
        height: preset.height,
        preset,
      };
    }
  }

  if (params.customSize) {
    const parsed = parseSizeString(params.customSize);
    if (parsed) {
      return {
        size: `${parsed.width}*${parsed.height}`,
        width: parsed.width,
        height: parsed.height,
      };
    }
  }

  return {};
}

export async function generateWithPresets(
  params: GenerateWithPresetsParams,
): Promise<GenerateWithPresetsResult> {
  const startTime = Date.now();

  const { size, width, height, preset: sizePreset } = resolveSize({
    sizePreset: params.sizePreset,
    customSize: params.customSize,
  });

  const stylePreset = params.stylePreset ? getStylePreset(params.stylePreset) : undefined;

  const promptEnhanceOptions: PromptEnhanceOptions = {
    ...params.promptEnhanceOptions,
    style: params.promptEnhanceOptions?.style || params.stylePreset,
  };

  const enhanced = enhancePrompt(params.prompt, promptEnhanceOptions);

  const negativePrompt = params.negativePrompt || enhanced.negativePrompt;

  logger.debug(
    `[ImageGenerator] Generating ${params.count || 1} image(s) with prompt: ${params.prompt.slice(0, 100)}...`,
  );

  const runtimeParams: GenerateImageParams = {
    prompt: enhanced.enhancedPrompt,
    modelOverride: params.modelOverride,
    count: params.count,
    size,
    quality: params.quality,
    outputFormat: params.outputFormat,
    background: params.background,
    autoProviderFallback: params.autoProviderFallback,
    timeoutMs: params.timeoutMs,
    providerOptions: {
      ...(negativePrompt ? { negativePrompt } : {}),
    },
  };

  const result = await runtimeGenerateImage(runtimeParams);

  const durationMs = Date.now() - startTime;
  logger.debug(
    `[ImageGenerator] Generation completed in ${durationMs}ms using ${result.provider}/${result.model}`,
  );

  let historyId: string | undefined;
  if (params.saveToHistory !== false) {
    const historyRecord: Omit<GenerationHistoryRecord, "id" | "createdAt"> = {
      prompt: params.prompt,
      enhancedPrompt: enhanced.enhancedPrompt,
      negativePrompt,
      provider: result.provider,
      model: result.model,
      imageCount: result.images.length,
      size,
      width,
      height,
      style: params.stylePreset,
      sizePreset: params.sizePreset,
      quality: params.quality,
      outputFormat: params.outputFormat,
      durationMs,
      success: true,
      imageUrls: result.images.map((img) => img.fileName || ""),
      metadata: {
        ...result.metadata,
        attempts: result.attempts,
      },
    };
    const saved = addToGenerationHistory(historyRecord);
    historyId = saved.id;
  }

  return {
    images: result.images,
    provider: result.provider,
    model: result.model,
    originalPrompt: params.prompt,
    enhancedPrompt: enhanced.enhancedPrompt,
    negativePrompt,
    sizePreset,
    stylePreset,
    width,
    height,
    attempts: result.attempts,
    metadata: result.metadata,
    historyId,
  };
}

export type GenerateVariantParams = {
  sourceImage: Buffer;
  sourceMimeType?: string;
  prompt?: string;
  count?: number;
  strength?: number;
  modelOverride?: string;
  size?: string;
  autoProviderFallback?: boolean;
  timeoutMs?: number;
  saveToHistory?: boolean;
};

export async function generateVariants(
  params: GenerateVariantParams,
): Promise<GenerateWithPresetsResult> {
  const prompt = params.prompt || "variation of the input image";

  logger.debug(`[ImageGenerator] Generating ${params.count || 1} variant(s)`);

  const result = await generateWithPresets({
    ...params,
    prompt,
    customSize: params.size,
  });

  return result;
}

export type GenerateWithMultipleStylesParams = {
  prompt: string;
  styles: string[];
  sizePreset?: string;
  count?: number;
  modelOverride?: string;
  saveToHistory?: boolean;
};

export type MultiStyleResult = {
  style: string;
  result?: GenerateWithPresetsResult;
  error?: string;
};

export async function generateWithMultipleStyles(
  params: GenerateWithMultipleStylesParams,
): Promise<MultiStyleResult[]> {
  const results: MultiStyleResult[] = [];

  for (const style of params.styles) {
    try {
      const result = await generateWithPresets({
        prompt: params.prompt,
        stylePreset: style,
        sizePreset: params.sizePreset,
        count: params.count,
        modelOverride: params.modelOverride,
        saveToHistory: params.saveToHistory,
      });
      results.push({ style, result });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[ImageGenerator] Style ${style} failed: ${errorMsg}`);
      results.push({ style, error: errorMsg });
    }
  }

  return results;
}

export function estimateGenerationCost(
  params: GenerateWithPresetsParams,
): {
  estimatedCredits: number;
  estimatedTimeMs: number;
  provider?: string;
  model?: string;
} {
  const count = params.count || 1;
  const baseCredits = 1;
  const baseTimeMs = 10000;

  let multiplier = 1;

  if (params.sizePreset) {
    const preset = getSizePreset(params.sizePreset);
    if (preset) {
      const pixels = preset.width * preset.height;
      multiplier = Math.max(1, pixels / (1024 * 1024));
    }
  }

  if (params.stylePreset) {
    multiplier *= 1.1;
  }

  const qualityMultiplier = params.quality === "high" ? 2 : params.quality === "medium" ? 1.5 : 1;
  multiplier *= qualityMultiplier;

  return {
    estimatedCredits: Math.ceil(count * baseCredits * multiplier * 10) / 10,
    estimatedTimeMs: Math.ceil(count * baseTimeMs * multiplier),
  };
}
