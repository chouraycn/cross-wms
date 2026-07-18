/**
 * Midjourney Provider — Midjourney 图像生成
 *
 * 基于 Midjourney API 的图像生成 Provider。
 */

import { logger } from "../../../logger.js";
import type {
  ImageGenerationProvider,
  ImageGenerationProviderCapabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
  GeneratedImageAsset,
} from "../types.js";

export type MidjourneyAction = "imagine" | "upscale" | "variation" | "reroll" | "blend" | "describe";

export type MidjourneyAspectRatio =
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16"
  | "3:2"
  | "2:3"
  | "7:4"
  | "4:7";

export type MidjourneyModel = "v6" | "v5.2" | "v5.1" | "v5" | "niji-6" | "niji-5";

export type MidjourneyProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKeyEnvVar?: string;
  defaultTimeoutMs?: number;
  defaultAspectRatio?: MidjourneyAspectRatio;
  defaultStylize?: number;
  defaultQuality?: number;
  defaultChaos?: number;
};

const MJ_SIZES = [
  "1024*1024",
  "1280*960",
  "960*1280",
  "1792*1024",
  "1024*1792",
  "1536*1024",
  "1024*1536",
];

const defaultCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 4,
    supportsSize: true,
    supportsAspectRatio: true,
    supportsResolution: false,
  },
  edit: {
    enabled: false,
  },
  geometry: {
    sizes: MJ_SIZES,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
  },
  output: {
    qualities: ["low", "medium", "high", "auto"],
    formats: ["png", "jpeg"],
    backgrounds: ["opaque"],
  },
};

function resolveApiKey(req: ImageGenerationRequest, apiKeyEnvVar?: string): string | undefined {
  if (req.apiKey) return req.apiKey;
  if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
    return process.env[apiKeyEnvVar];
  }
  if (process.env.MIDJOURNEY_API_KEY) {
    return process.env.MIDJOURNEY_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(req: ImageGenerationRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.MIDJOURNEY_BASE_URL) {
    return process.env.MIDJOURNEY_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createMidjourneyProvider(
  options: MidjourneyProviderOptions = {},
): ImageGenerationProvider {
  const {
    id = "midjourney",
    label = "Midjourney",
    aliases = ["mj", "midjourney-ai"],
    defaultModel = "v6",
    models = ["v6", "v5.2", "v5.1", "v5", "niji-6", "niji-5"],
    baseUrl: defaultBaseUrl = "https://api.midjourney.com",
    apiKeyEnvVar = "MIDJOURNEY_API_KEY",
    defaultTimeoutMs = 180000,
    defaultAspectRatio = "1:1",
    defaultStylize = 100,
    defaultQuality = 1,
    defaultChaos = 0,
  } = options;

  const provider: ImageGenerationProvider = {
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

    async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
      const apiKey = resolveApiKey(req, apiKeyEnvVar);
      if (!apiKey) {
        throw new Error(`API key not configured for provider: ${id}`);
      }

      const model = req.model || defaultModel;
      const count = Math.max(1, Math.min(req.count || 1, 4));
      const size = req.size;
      const aspectRatio = req.aspectRatio || defaultAspectRatio;
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);

      const mjOptions = req.providerOptions?.midjourney as Record<string, unknown> | undefined;
      const stylize = mjOptions?.stylize || defaultStylize;
      const quality = mjOptions?.quality || defaultQuality;
      const chaos = (mjOptions?.chaos as number | undefined) || defaultChaos;
      const seed = mjOptions?.seed as number | undefined;
      const style = mjOptions?.style as string | undefined;

      let prompt = req.prompt;

      if (size) {
        const [w, h] = size.split(/[*xX:]/).map((s) => parseInt(s, 10));
        if (w && h) {
          const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
          const d = gcd(w, h);
          prompt = `${prompt} --ar ${w / d}:${h / d}`;
        }
      } else if (aspectRatio) {
        prompt = `${prompt} --ar ${aspectRatio}`;
      }

      prompt = `${prompt} --stylize ${stylize}`;
      prompt = `${prompt} --quality ${quality}`;
      if (chaos > 0) {
        prompt = `${prompt} --chaos ${chaos}`;
      }
      if (seed !== undefined) {
        prompt = `${prompt} --seed ${seed}`;
      }
      if (style) {
        prompt = `${prompt} --style ${style}`;
      }
      if (model.startsWith("niji")) {
        prompt = `${prompt} --niji`;
      }

      logger.debug(`[Midjourney] Generating ${count} image(s) with model ${model}`);

      const endpoint = `${baseUrl}/api/v2/imagine`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            prompt,
            model,
            count,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(
            `${id} API error (HTTP ${response.status}): ${errorText}`,
          );
        }

        const data = (await response.json()) as {
          taskId?: string;
          status?: string;
          images?: Array<{
            url: string;
            proxyUrl?: string;
            index?: number;
          }>;
        };

        const images: GeneratedImageAsset[] = [];

        if (data.images) {
          for (const img of data.images) {
            if (img.url) {
              images.push({
                buffer: Buffer.alloc(0),
                mimeType: "image/png",
                metadata: {
                  url: img.url,
                  proxyUrl: img.proxyUrl,
                  index: img.index,
                  taskId: data.taskId,
                },
              });
            }
          }
        }

        return {
          images,
          model,
          metadata: {
            provider: id,
            taskId: data.taskId,
            stylize,
            quality,
            chaos,
            seed,
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

export const midjourneyProvider = createMidjourneyProvider();

export default midjourneyProvider;
