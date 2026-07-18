/**
 * Runway Gen-3 Provider — Runway 视频生成
 *
 * 基于 Runway Gen-3 Alpha API 的视频生成 Provider。
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

export type RunwayModel = "gen-3-alpha" | "gen-2";

export type RunwayProviderOptions = {
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

const SUPPORTED_SIZES: readonly string[] = [
  "1280x768",
  "768x1280",
  "1024x1024",
];

const defaultCapabilities: VideoProviderCapabilities = {
  generate: {
    maxVideos: 1,
    maxDurationSeconds: 10,
    supportedDurationSeconds: [5, 10],
    sizes: SUPPORTED_SIZES,
    supportsSize: true,
    supportsAspectRatio: true,
    supportsResolution: true,
    supportsAudio: false,
    supportsWatermark: true,
  },
  imageToVideo: {
    enabled: true,
    maxInputImages: 1,
    maxVideos: 1,
    maxDurationSeconds: 10,
    supportedDurationSeconds: [5, 10],
    sizes: SUPPORTED_SIZES,
    supportsSize: true,
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
  if (process.env.RUNWAY_API_KEY) {
    return process.env.RUNWAY_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(req: VideoRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.RUNWAY_BASE_URL) {
    return process.env.RUNWAY_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createRunwayProvider(
  options: RunwayProviderOptions = {},
): VideoGenerationProvider {
  const {
    id = "runway",
    label = "Runway Gen-3",
    aliases = ["runway-gen3", "gen3"],
    defaultModel = "gen-3-alpha",
    models = ["gen-3-alpha", "gen-2"],
    baseUrl: defaultBaseUrl = "https://api.runwayml.com",
    apiKeyEnvVar = "RUNWAY_API_KEY",
    defaultTimeoutMs = 300000,
    defaultDurationSeconds = 5,
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
        defaultCapabilities.generate?.maxDurationSeconds ?? 10,
      );
      const format: VideoFormat = "mp4";
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);

      logger.debug(
        `[Runway] Generating video with ${model}, duration ${durationSeconds}s`,
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
        if (req.size) body.size = req.size;
        if (req.inputImages && req.inputImages.length > 0) {
          body.promptImage = req.inputImages[0].url;
        }

        const endpoint = `${baseUrl}/v1/image_to_video`;
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
          output?: Array<{ url?: string; base64?: string }>;
        };

        const videos: GeneratedVideoAsset[] = [];
        for (const item of data.output ?? []) {
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

export const runwayProvider = createRunwayProvider();

export default runwayProvider;
