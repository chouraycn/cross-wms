/**
 * Music Generator Core — 音乐生成器核心
 *
 * 整合 Prompt 优化、风格预设、Provider 调度，提供高级音乐生成 API。
 */

import { logger } from "../../logger.js";
import {
  enhancePrompt,
  type MusicPromptEnhanceOptions,
} from "./prompt-engineering.js";
import { getStylePreset, type MusicStylePreset } from "./style-preset.js";
import {
  getDefaultMusicProvider,
  getMusicProvider,
  listConfiguredMusicProviders,
} from "./provider-registry.js";
import type {
  AudioFormat,
  GeneratedMusicAsset,
  MusicMood,
  MusicRequest,
  MusicResult,
  MusicStyle,
  MusicTempo,
} from "./types.js";

export type GenerateMusicParams = {
  prompt: string;
  stylePreset?: string;
  style?: MusicStyle;
  mood?: MusicMood;
  tempo?: MusicTempo;
  instruments?: string[];
  lyrics?: string;
  instrumental?: boolean;
  durationSeconds?: number;
  format?: AudioFormat;
  modelOverride?: string;
  providerOverride?: string;
  autoProviderFallback?: boolean;
  timeoutMs?: number;
  promptEnhanceOptions?: MusicPromptEnhanceOptions;
  saveToHistory?: boolean;
};

export type GenerateMusicResult = {
  tracks: GeneratedMusicAsset[];
  provider: string;
  model: string;
  originalPrompt: string;
  enhancedPrompt: string;
  stylePreset?: MusicStylePreset;
  mood?: MusicMood;
  tempo?: MusicTempo;
  instruments?: string[];
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
  trackCount: number;
  durationMs: number;
  success: boolean;
  createdAt: number;
}> = [];

export function clearMusicHistory(): void {
  history.length = 0;
}

export function getMusicHistory() {
  return [...history];
}

function resolveProviderCandidates(params: GenerateMusicParams): Array<{
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
    const provider = getMusicProvider(params.providerOverride);
    if (provider) {
      addCandidate(provider.id, provider.defaultModel || params.modelOverride?.split("/")[1] || "default");
    }
  }
  if (params.autoProviderFallback !== false) {
    for (const provider of listConfiguredMusicProviders()) {
      addCandidate(provider.id, provider.defaultModel || "default");
    }
  } else {
    const def = getDefaultMusicProvider();
    if (def) {
      addCandidate(def.id, def.defaultModel || "default");
    }
  }

  return candidates;
}

export function parseModelRef(ref: string): [string, string] {
  if (!ref) return ["", ""];
  const parts = ref.split("/");
  if (parts.length >= 2) {
    return [parts[0].trim(), parts.slice(1).join("/").trim()];
  }
  return ["", parts[0].trim()];
}

export async function generateMusic(
  params: GenerateMusicParams,
): Promise<GenerateMusicResult> {
  const startTime = Date.now();

  const stylePreset = params.stylePreset ? getStylePreset(params.stylePreset) : undefined;

  const enhanceOptions: MusicPromptEnhanceOptions = {
    ...params.promptEnhanceOptions,
    style: params.promptEnhanceOptions?.style || params.stylePreset,
    mood: params.mood,
    tempo: params.tempo,
    instruments: params.instruments,
  };

  const enhanced = enhancePrompt(params.prompt, enhanceOptions);

  logger.debug(
    `[MusicGenerator] Generating music with prompt: ${params.prompt.slice(0, 100)}...`,
  );

  const candidates = resolveProviderCandidates(params);
  if (candidates.length === 0) {
    throw new Error("No music generation provider available");
  }

  const attempts: GenerateMusicResult["attempts"] = [];
  let lastError: Error | undefined;
  let result: MusicResult | undefined;
  let usedProvider = "";
  let usedModel = "";

  for (const candidate of candidates) {
    const provider = getMusicProvider(candidate.providerId);
    if (!provider) {
      attempts.push({
        provider: candidate.providerId,
        model: candidate.model,
        error: "provider not registered",
      });
      continue;
    }
    try {
      const req: MusicRequest = {
        provider: provider.id,
        model: candidate.model,
        prompt: enhanced.enhancedPrompt,
        timeoutMs: params.timeoutMs,
        lyrics: params.lyrics,
        instrumental: params.instrumental,
        durationSeconds: params.durationSeconds,
        format: params.format,
        style: params.style,
        mood: params.mood,
        tempo: params.tempo,
        instruments: params.instruments,
      };
      result = await provider.generateMusic(req);
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
    throw lastError || new Error("Music generation failed with no provider");
  }

  const durationMs = Date.now() - startTime;
  logger.debug(
    `[MusicGenerator] Generation completed in ${durationMs}ms using ${usedProvider}/${usedModel}`,
  );

  let historyId: string | undefined;
  if (params.saveToHistory !== false) {
    historyId = `music_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    history.push({
      id: historyId,
      prompt: params.prompt,
      enhancedPrompt: enhanced.enhancedPrompt,
      provider: usedProvider,
      model: usedModel,
      trackCount: result.tracks.length,
      durationMs,
      success: true,
      createdAt: Date.now(),
    });
  }

  return {
    tracks: result.tracks,
    provider: usedProvider,
    model: usedModel,
    originalPrompt: params.prompt,
    enhancedPrompt: enhanced.enhancedPrompt,
    stylePreset,
    mood: params.mood,
    tempo: params.tempo,
    instruments: params.instruments,
    attempts,
    metadata: result.metadata,
    historyId,
  };
}

export type GenerateWithMultipleStylesParams = {
  prompt: string;
  styles: string[];
  durationSeconds?: number;
  format?: AudioFormat;
  modelOverride?: string;
  saveToHistory?: boolean;
};

export type MultiStyleMusicResult = {
  style: string;
  result?: GenerateMusicResult;
  error?: string;
};

export async function generateWithMultipleStyles(
  params: GenerateWithMultipleStylesParams,
): Promise<MultiStyleMusicResult[]> {
  const results: MultiStyleMusicResult[] = [];
  for (const style of params.styles) {
    try {
      const result = await generateMusic({
        prompt: params.prompt,
        stylePreset: style,
        durationSeconds: params.durationSeconds,
        format: params.format,
        modelOverride: params.modelOverride,
        saveToHistory: params.saveToHistory,
      });
      results.push({ style, result });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[MusicGenerator] Style ${style} failed: ${errorMsg}`);
      results.push({ style, error: errorMsg });
    }
  }
  return results;
}

export function estimateGenerationCost(
  params: GenerateMusicParams,
): {
  estimatedCredits: number;
  estimatedTimeMs: number;
} {
  const baseCredits = 5;
  const baseTimeMs = 30000;

  let multiplier = 1;
  if (params.durationSeconds) {
    multiplier *= Math.max(1, params.durationSeconds / 30);
  }
  if (params.stylePreset) multiplier *= 1.05;
  if (params.lyrics) multiplier *= 1.2;

  return {
    estimatedCredits: Math.ceil(baseCredits * multiplier * 10) / 10,
    estimatedTimeMs: Math.ceil(baseTimeMs * multiplier),
  };
}
