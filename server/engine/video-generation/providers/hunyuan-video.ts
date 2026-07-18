/**
 * Hunyuan Video Provider — 腾讯混元视频生成
 *
 * 基于腾讯混元视频 API 的视频生成 Provider。
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

export type HunyuanVideoModel = "hunyuan-video" | "hunyuan-video-pro";

export type HunyuanVideoProviderOptions = {
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
  if (process.env.HUNYUAN_VIDEO_API_KEY) {
    return process.env.HUNYUAN_VIDEO_API_KEY;
  }
  if (process.env.TENCENT_VIDEO_API_KEY) {
    return process.env.TENCENT_VIDEO_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(req: VideoRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.HUNYUAN_VIDEO_BASE_URL) {
    return process.env.HUNYUAN_VIDEO_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createHunyuanVideoProvider(
  options: HunyuanVideoProviderOptions = {},
): VideoGenerationProvider {
  const {
    id = "hunyuan-video",
    label = "腾讯混元视频",
    aliases = ["hunyuan", "tencent-video"],
    defaultModel = "hunyuan-video",
    models = ["hunyuan-video", "hunyuan-video-pro"],
    baseUrl: defaultBaseUrl = "https://hunyuan.tencentcloudapi.com",
    apiKeyEnvVar = "HUNYUAN_VIDEO_API_KEY",
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
        defaultCapabilities.generate?.maxDurationSeconds ?? 5,
      );
      const format: VideoFormat = "mp4";
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);

      logger.debug(
        `[HunyuanVideo] Generating video with ${model}, duration ${durationSeconds}s`,
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
        if (req.inputImages && req.inputImages.length > 0) {
          body.imageUrl = req.inputImages[0].url;
        }

        const endpoint = `${baseUrl}/v1/video/generate`;
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
          data?: Array<{ url?: string; base64?: string }>;
        };

        const videos: GeneratedVideoAsset[] = [];
        for (const item of data.data ?? []) {
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

export const hunyuanVideoProvider = createHunyuanVideoProvider();

export default hunyuanVideoProvider;
