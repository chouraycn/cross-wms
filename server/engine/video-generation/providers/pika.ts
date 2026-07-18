/**
 * Pika Provider — Pika 视频生成
 *
 * 基于 Pika Labs API 的视频生成 Provider。
 */

import { logger } from "../../../logger.js";
import type {
  GeneratedVideoAsset,
  VideoFormat,
  VideoGenerationProvider,
  VideoProviderCapabilities,
  VideoRequest,
  VideoResult,
} from "../types.js";

export type PikaModel = "pika-1.5" | "pika-1.0";

export type PikaProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKeyEnvVar?: string;
  defaultTimeoutMs?: number;
  defaultDurationSeconds?: number;
};

const defaultCapabilities: VideoProviderCapabilities = {
  generate: {
    maxVideos: 1,
    maxDurationSeconds: 5,
    supportedDurationSeconds: [3, 5],
    supportsSize: true,
    supportsAspectRatio: true,
    supportsResolution: true,
    supportsAudio: false,
    supportsWatermark: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
  },
  imageToVideo: {
    enabled: true,
    maxInputImages: 1,
    maxVideos: 1,
    maxDurationSeconds: 5,
  },
  videoToVideo: {
    enabled: false,
  },
};

function resolveApiKey(req: VideoRequest, apiKeyEnvVar: string): string | undefined {
  if (req.apiKey) return req.apiKey;
  if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
    return process.env[apiKeyEnvVar];
  }
  if (process.env.PIKA_API_KEY) {
    return process.env.PIKA_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(req: VideoRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.PIKA_BASE_URL) {
    return process.env.PIKA_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createPikaProvider(
  options: PikaProviderOptions = {},
): VideoGenerationProvider {
  const {
    id = "pika",
    label = "Pika",
    aliases = ["pika-labs"],
    defaultModel = "pika-1.5",
    models = ["pika-1.5", "pika-1.0"],
    baseUrl: defaultBaseUrl = "https://api.pika.art",
    apiKeyEnvVar = "PIKA_API_KEY",
    defaultTimeoutMs = 300000,
    defaultDurationSeconds = 3,
  } = options;

  const provider: VideoGenerationProvider = {
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

    async generateVideo(req: VideoRequest): Promise<VideoResult> {
      const apiKey = resolveApiKey(req, apiKeyEnvVar);
      if (!apiKey) {
        throw new Error(`API key not configured for provider: ${id}`);
      }

      const model = req.model || defaultModel;
      const durationSeconds = Math.min(
        req.durationSeconds ?? defaultDurationSeconds,
        defaultCapabilities.generate?.maxDurationSeconds ?? 5,
      );
      const format: VideoFormat = "mp4";
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);

      logger.debug(
        `[Pika] Generating video with ${model}, duration ${durationSeconds}s`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          model,
          promptText: req.prompt,
          duration: durationSeconds,
          format,
        };
        if (req.aspectRatio) body.aspectRatio = req.aspectRatio;

        const endpoint = `${baseUrl}/v1/generate`;
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
          videos?: Array<{ url?: string; base64?: string }>;
        };

        const videos: GeneratedVideoAsset[] = [];
        for (const item of data.videos ?? []) {
          if (item.base64) {
            try {
              videos.push({
                buffer: Buffer.from(item.base64, "base64"),
                mimeType: `video/${format}`,
                durationSeconds,
              });
            } catch {
              // 跳过无效 base64
            }
          } else if (item.url) {
            videos.push({
              url: item.url,
              mimeType: `video/${format}`,
              durationSeconds,
            });
          }
        }

        if (videos.length === 0) {
          throw new Error(`${id}: No videos returned from API`);
        }

        return {
          videos,
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

export const pikaProvider = createPikaProvider();

export default pikaProvider;
