/**
 * Stable Audio Provider — Stable Audio 音乐生成
 *
 * 基于 Stability AI Stable Audio API 的音乐/音效生成 Provider。
 */

import { logger } from "../../../logger.js";
import type {
  AudioFormat,
  GeneratedMusicAsset,
  MusicGenerationProvider,
  MusicProviderCapabilities,
  MusicRequest,
  MusicResult,
} from "../types.js";

export type StableAudioModel = "stable-audio-2.0" | "stable-audio-open";

export type StableAudioProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKeyEnvVar?: string;
  defaultTimeoutMs?: number;
  defaultDurationSeconds?: number;
  defaultSteps?: number;
};

const SUPPORTED_FORMATS: readonly AudioFormat[] = ["wav", "mp3"];

const defaultCapabilities: MusicProviderCapabilities = {
  generate: {
    maxTracks: 1,
    maxDurationSeconds: 180,
    supportsLyrics: false,
    supportsInstrumental: true,
    supportsDuration: true,
    supportsFormat: true,
    supportedFormats: SUPPORTED_FORMATS,
    supportsStyle: true,
    supportsMood: true,
  },
  edit: {
    enabled: false,
  },
};

function resolveApiKey(req: MusicRequest, apiKeyEnvVar: string): string | undefined {
  if (req.apiKey) return req.apiKey;
  if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
    return process.env[apiKeyEnvVar];
  }
  if (process.env.STABLE_AUDIO_API_KEY) {
    return process.env.STABLE_AUDIO_API_KEY;
  }
  if (process.env.STABILITY_API_KEY) {
    return process.env.STABILITY_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(req: MusicRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.STABLE_AUDIO_BASE_URL) {
    return process.env.STABLE_AUDIO_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createStableAudioProvider(
  options: StableAudioProviderOptions = {},
): MusicGenerationProvider {
  const {
    id = "stable-audio",
    label = "Stable Audio",
    aliases = ["stable-audio-open", "stability-audio"],
    defaultModel = "stable-audio-2.0",
    models = ["stable-audio-2.0", "stable-audio-open"],
    baseUrl: defaultBaseUrl = "https://api.stability.ai",
    apiKeyEnvVar = "STABLE_AUDIO_API_KEY",
    defaultTimeoutMs = 180000,
    defaultDurationSeconds = 30,
    defaultSteps = 100,
  } = options;

  const provider: MusicGenerationProvider = {
    id,
    label,
    aliases,
    defaultModel,
    models,
    capabilities: defaultCapabilities,
    defaultTimeoutMs,

    isConfigured(): boolean {
      return !!resolveApiKey(
        { provider: id, model: defaultModel, prompt: "" },
        apiKeyEnvVar,
      );
    },

    async generateMusic(req: MusicRequest): Promise<MusicResult> {
      const apiKey = resolveApiKey(req, apiKeyEnvVar);
      if (!apiKey) {
        throw new Error(`API key not configured for provider: ${id}`);
      }

      const model = req.model || defaultModel;
      const durationSeconds = Math.min(
        req.durationSeconds ?? defaultDurationSeconds,
        defaultCapabilities.generate?.maxDurationSeconds ?? 180,
      );
      const format: AudioFormat = req.format ?? "wav";
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);

      logger.debug(
        `[StableAudio] Generating audio with ${model}, duration ${durationSeconds}s`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          model,
          prompt: req.prompt,
          duration: durationSeconds,
          steps: defaultSteps,
          output_format: format,
        };

        const endpoint = `${baseUrl}/v2beta/stable-audio/generate`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(`${id} API error (HTTP ${response.status}): ${errorText}`);
        }

        const data = (await response.json()) as {
          artifacts?: Array<{
            base64?: string;
            duration?: number;
          }>;
        };

        const tracks: GeneratedMusicAsset[] = [];
        for (const item of data.artifacts ?? []) {
          if (item.base64) {
            try {
              const buffer = Buffer.from(item.base64, "base64");
              tracks.push({
                buffer,
                mimeType: `audio/${format}`,
                durationSeconds: item.duration ?? durationSeconds,
              });
            } catch {
              // 跳过无效 base64
            }
          }
        }

        if (tracks.length === 0) {
          throw new Error(`${id}: No tracks returned from API`);
        }

        return {
          tracks,
          model,
          metadata: {
            provider: id,
            format,
            durationSeconds,
            steps: defaultSteps,
            createdAt: Date.now(),
          },
        };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error(`${id}: Request timed out after ${timeoutMs}ms`);
        }
        throw err;
      }
    },
  };

  return provider;
}

export const stableAudioProvider = createStableAudioProvider();

export default stableAudioProvider;
