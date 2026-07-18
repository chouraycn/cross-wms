/**
 * OpenAI Sora Provider — Sora 视频生成
 *
 * 基于 OpenAI Sora API 的视频生成 Provider。
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

export type SoraModel = "sora-2" | "sora-1";

export type SoraProviderOptions = {
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
    maxDurationSeconds: 20,
    supportedDurationSeconds: [5, 10, 15, 20],
    supportsSize: true,
    supportsAspectRatio: true,
    supportsResolution: true,
    supportsAudio: true,
    supportsWatermark: false,
    aspectRatios: ["16:9", "9:16", "1:1"],
  },
  imageToVideo: {
    enabled: true,
    maxInputImages: 1,
    maxVideos: 1,
    maxDurationSeconds: 20,
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
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  if (process.env.SORA_API_KEY) {
    return process.env.SORA_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(req: VideoRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.OPENAI_BASE_URL) {
    return process.env.OPENAI_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createSoraProvider(
  options: SoraProviderOptions = {},
): VideoGenerationProvider {
  const {
    id = "sora",
    label = "OpenAI Sora",
    aliases = ["openai-sora", "openai"],
    defaultModel = "sora-2",
    models = ["sora-2", "sora-1"],
    baseUrl: defaultBaseUrl = "https://api.openai.com",
    apiKeyEnvVar = "OPENAI_API_KEY",
    defaultTimeoutMs = 600000,
    defaultDurationSeconds = 10,
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
        defaultCapabilities.generate?.maxDurationSeconds ?? 20,
      );
      const format: VideoFormat = "mp4";
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);

      logger.debug(
        `[Sora] Generating video with ${model}, duration ${durationSeconds}s`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          model,
          prompt: req.prompt,
          duration: durationSeconds,
          format,
        };
        if (req.size) body.size = req.size;
        if (req.audio !== undefined) body.audio = req.audio;

        const endpoint = `${baseUrl}/v1/videos/generations`;
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
            url?: string;
            b64_json?: string;
            revised_prompt?: string;
          }>;
        };

        const videos: GeneratedVideoAsset[] = [];
        for (const item of data.data ?? []) {
          if (item.b64_json) {
            try {
              videos.push({
                buffer: Buffer.from(item.b64_json, "base64"),
                mimeType: `video/${format}`,
                durationSeconds,
                metadata: { revisedPrompt: item.revised_prompt },
              });
            } catch {
              // 跳过无效 base64
            }
          } else if (item.url) {
            videos.push({
              url: item.url,
              mimeType: `video/${format}`,
              durationSeconds,
              metadata: { revisedPrompt: item.revised_prompt },
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

export const soraProvider = createSoraProvider();

export default soraProvider;
