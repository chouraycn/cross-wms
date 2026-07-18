/**
 * Video Generator Core — 视频生成器核心
 *
 * 整合 Prompt 优化、风格预设、Provider 调度，提供高级视频生成 API。
 */

import { logger } from "../../logger.js";
import {
  enhancePrompt,
  type VideoPromptEnhanceOptions,
} from "./prompt-engineering.js";
import { getStylePreset, type VideoStylePreset } from "./style-preset.js";
import {
  getDefaultVideoProvider,
  getVideoProvider,
  listConfiguredVideoProviders,
} from "./provider-registry.js";
import type {
  GeneratedVideoAsset,
  VideoRequest,
  VideoResolution,
  VideoResult,
  VideoStyle,
} from "./types.js";

export type GenerateVideoParams = {
  prompt: string;
  stylePreset?: string;
  style?: VideoStyle;
  size?: string;
  aspectRatio?: string;
  resolution?: VideoResolution;
  durationSeconds?: number;
  fps?: number;
  audio?: boolean;
  watermark?: boolean;
  modelOverride?: string;
  providerOverride?: string;
  autoProviderFallback?: boolean;
  timeoutMs?: number;
  promptEnhanceOptions?: VideoPromptEnhanceOptions;
  saveToHistory?: boolean;
};

export type GenerateVideoResult = {
  videos: GeneratedVideoAsset[];
  provider: string;
  model: string;
  originalPrompt: string;
  enhancedPrompt: string;
  stylePreset?: VideoStylePreset;
  attempts: Array<{
    provider: string;
    model: string;
    error?: string;
  }>;
  metadata?: Record<string, unknown>;
  historyId?: string;
};

const history: Array<{
  id: string;
  prompt: string;
  enhancedPrompt: string;
  provider: string;
  model: string;
  videoCount: number;
  durationMs: number;
  success: boolean;
  createdAt: number;
}> = [];

export function clearVideoHistory(): void {
  history.length = 0;
}

export function getVideoHistory() {
  return [...history];
}

export function parseModelRef(ref: string): [string, string] {
  if (!ref) return ["", ""];
  const parts = ref.split("/");
  if (parts.length >= 2) {
    return [parts[0].trim(), parts.slice(1).join("/").trim()];
  }
  return ["", parts[0].trim()];
}

function resolveProviderCandidates(params: GenerateVideoParams): Array<{
  providerId: string;
  model: string;
}> {
  const candidates: Array<{ providerId: string; model: string }> = [];
  const seen = new Set<string>();

  const addCandidate = (providerId: string, model: string) => {
    const key = `${providerId}/${model}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({ providerId, model });
    }
  };

  if (params.modelOverride) {
    const [providerId, model] = parseModelRef(params.modelOverride);
    if (providerId) addCandidate(providerId, model);
  }
  if (params.providerOverride) {
    const provider = getVideoProvider(params.providerOverride);
    if (provider) {
      addCandidate(
        provider.id,
        provider.defaultModel || params.modelOverride?.split("/")[1] || "default",
      );
    }
  }
  if (params.autoProviderFallback !== false) {
    for (const provider of listConfiguredVideoProviders()) {
      addCandidate(provider.id, provider.defaultModel || "default");
    }
  } else {
    const def = getDefaultVideoProvider();
    if (def) {
      addCandidate(def.id, def.defaultModel || "default");
    }
  }

  return candidates;
}

export async function generateVideo(
  params: GenerateVideoParams,
): Promise<GenerateVideoResult> {
  const startTime = Date.now();

  const stylePreset = params.stylePreset ? getStylePreset(params.stylePreset) : undefined;

  const enhanceOptions: VideoPromptEnhanceOptions = {
    ...params.promptEnhanceOptions,
    style: params.promptEnhanceOptions?.style || params.stylePreset,
  };

  const enhanced = enhancePrompt(params.prompt, enhanceOptions);

  logger.debug(
    `[VideoGenerator] Generating video with prompt: ${params.prompt.slice(0, 100)}...`,
  );

  const candidates = resolveProviderCandidates(params);
  if (candidates.length === 0) {
    throw new Error("No video generation provider available");
  }

  const attempts: GenerateVideoResult["attempts"] = [];
  let lastError: Error | undefined;
  let result: VideoResult | undefined;
  let usedProvider = "";
  let usedModel = "";

  for (const candidate of candidates) {
    const provider = getVideoProvider(candidate.providerId);
    if (!provider) {
      attempts.push({
        provider: candidate.providerId,
        model: candidate.model,
        error: "provider not registered",
      });
      continue;
    }
    try {
      const req: VideoRequest = {
        provider: provider.id,
        model: candidate.model,
        prompt: enhanced.enhancedPrompt,
        timeoutMs: params.timeoutMs,
        size: params.size,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        durationSeconds: params.durationSeconds,
        fps: params.fps,
        audio: params.audio,
        watermark: params.watermark,
      };
      result = await provider.generateVideo(req);
      usedProvider = provider.id;
      usedModel = result.model || candidate.model;
      attempts.push({ provider: usedProvider, model: usedModel });
      break;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      attempts.push({
        provider: candidate.providerId,
        model: candidate.model,
        error: errorMsg,
      });
      lastError = err instanceof Error ? err : new Error(errorMsg);
    }
  }

  if (!result) {
    throw lastError || new Error("Video generation failed with no provider");
  }

  const durationMs = Date.now() - startTime;
  logger.debug(
    `[VideoGenerator] Generation completed in ${durationMs}ms using ${usedProvider}/${usedModel}`,
  );

  let historyId: string | undefined;
  if (params.saveToHistory !== false) {
    historyId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    history.push({
      id: historyId,
      prompt: params.prompt,
      enhancedPrompt: enhanced.enhancedPrompt,
      provider: usedProvider,
      model: usedModel,
      videoCount: result.videos.length,
      durationMs,
      success: true,
      createdAt: Date.now(),
    });
  }

  return {
    videos: result.videos,
    provider: usedProvider,
    model: usedModel,
    originalPrompt: params.prompt,
    enhancedPrompt: enhanced.enhancedPrompt,
    stylePreset,
    attempts,
    metadata: result.metadata,
    historyId,
  };
}

export type GenerateWithMultipleStylesParams = {
  prompt: string;
  styles: string[];
  durationSeconds?: number;
  modelOverride?: string;
  saveToHistory?: boolean;
};

export type MultiStyleVideoResult = {
  style: string;
  result?: GenerateVideoResult;
  error?: string;
};

export async function generateWithMultipleStyles(
  params: GenerateWithMultipleStylesParams,
): Promise<MultiStyleVideoResult[]> {
  const results: MultiStyleVideoResult[] = [];
  for (const style of params.styles) {
    try {
      const result = await generateVideo({
        prompt: params.prompt,
        stylePreset: style,
        durationSeconds: params.durationSeconds,
        modelOverride: params.modelOverride,
        saveToHistory: params.saveToHistory,
      });
      results.push({ style, result });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[VideoGenerator] Style ${style} failed: ${errorMsg}`);
      results.push({ style, error: errorMsg });
    }
  }
  return results;
}

export function estimateGenerationCost(
  params: GenerateVideoParams,
): {
  estimatedCredits: number;
  estimatedTimeMs: number;
} {
  const baseCredits = 10;
  const baseTimeMs = 60000;

  let multiplier = 1;
  if (params.durationSeconds) {
    multiplier *= Math.max(1, params.durationSeconds / 5);
  }
  if (params.resolution === "1080P") multiplier *= 2;
  if (params.resolution === "4K") multiplier *= 4;
  if (params.stylePreset) multiplier *= 1.1;

  return {
    estimatedCredits: Math.ceil(baseCredits * multiplier * 10) / 10,
    estimatedTimeMs: Math.ceil(baseTimeMs * multiplier),
  };
}
