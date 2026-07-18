/**
 * Tencent Music Provider — 腾讯音乐生成
 *
 * 基于腾讯云音乐生成 API 的 Provider。
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

export type TencentMusicModel = "tme-v1" | "tme-v2";

export type TencentMusicProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKeyEnvVar?: string;
  secretIdEnvVar?: string;
  secretKeyEnvVar?: string;
  defaultTimeoutMs?: number;
  defaultDurationSeconds?: number;
};

const SUPPORTED_FORMATS: readonly AudioFormat[] = ["mp3", "wav"];

const defaultCapabilities: MusicProviderCapabilities = {
  generate: {
    maxTracks: 1,
    maxDurationSeconds: 60,
    supportsLyrics: true,
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
  if (process.env.TENCENT_MUSIC_API_KEY) {
    return process.env.TENCENT_MUSIC_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(req: MusicRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.TENCENT_MUSIC_BASE_URL) {
    return process.env.TENCENT_MUSIC_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createTencentMusicProvider(
  options: TencentMusicProviderOptions = {},
): MusicGenerationProvider {
  const {
    id = "tencent-music",
    label = "腾讯音乐",
    aliases = ["tme", "tencent", "腾讯音乐"],
    defaultModel = "tme-v2",
    models = ["tme-v2", "tme-v1"],
    baseUrl: defaultBaseUrl = "https://tme.tencentcloudapi.com",
    apiKeyEnvVar = "TENCENT_MUSIC_API_KEY",
    defaultTimeoutMs = 180000,
    defaultDurationSeconds = 30,
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
        defaultCapabilities.generate?.maxDurationSeconds ?? 60,
      );
      const format: AudioFormat = req.format ?? "mp3";
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);

      logger.debug(
        `[TencentMusic] Generating music with ${model}, duration ${durationSeconds}s`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          model,
          prompt: req.prompt,
          duration: durationSeconds,
          format,
          instrumental: req.instrumental ?? false,
        };
        if (req.lyrics) {
          body.lyrics = req.lyrics;
        }
        if (req.style) {
          body.style = req.style;
        }

        const endpoint = `${baseUrl}/v1/music/generate`;
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
          data?: Array<{
            audio_url?: string;
            audio_base64?: string;
            duration?: number;
          }>;
        };

        const tracks: GeneratedMusicAsset[] = [];
        for (const item of data.data ?? []) {
          if (item.audio_base64) {
            try {
              const buffer = Buffer.from(item.audio_base64, "base64");
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

export const tencentMusicProvider = createTencentMusicProvider();

export default tencentMusicProvider;
