/**
 * Stability AI Provider — Stability AI 图像生成
 *
 * 基于 Stability AI API 的图像生成 Provider。
 * 支持 Stable Diffusion XL、Stable Image 等模型。
 */

import { logger } from "../../../logger.js";
import type {
  ImageGenerationProvider,
  ImageGenerationProviderCapabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
  GeneratedImageAsset,
} from "../types.js";

export type StabilityAIModel =
  | "stable-diffusion-xl-1024-v1-0"
  | "stable-diffusion-xl-1024-v0-9"
  | "stable-diffusion-v1-6"
  | "stable-image-ultra"
  | "stable-image-core"
  | "stable-image-fast";

export type StabilityAIProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKeyEnvVar?: string;
  defaultTimeoutMs?: number;
  defaultSteps?: number;
  defaultCfgScale?: number;
};

const STABILITY_SIZES = [
  "1024*1024",
  "1152*896",
  "896*1152",
  "1216*832",
  "832*1216",
  "1344*768",
  "768*1344",
  "1536*640",
  "640*1536",
];

const defaultCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 4,
    supportsSize: true,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: true,
    maxCount: 4,
    maxInputImages: 1,
    supportsSize: true,
  },
  geometry: {
    sizes: STABILITY_SIZES,
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
  if (process.env.STABILITY_API_KEY) {
    return process.env.STABILITY_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(req: ImageGenerationRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.STABILITY_BASE_URL) {
    return process.env.STABILITY_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createStabilityAIProvider(
  options: StabilityAIProviderOptions = {},
): ImageGenerationProvider {
  const {
    id = "stability",
    label = "Stability AI",
    aliases = ["stability-ai", "sdxl", "stable-diffusion-xl"],
    defaultModel = "stable-diffusion-xl-1024-v1-0",
    models = [
      "stable-diffusion-xl-1024-v1-0",
      "stable-diffusion-xl-1024-v0-9",
      "stable-diffusion-v1-6",
      "stable-image-ultra",
      "stable-image-core",
      "stable-image-fast",
    ],
    baseUrl: defaultBaseUrl = "https://api.stability.ai",
    apiKeyEnvVar = "STABILITY_API_KEY",
    defaultTimeoutMs = 120000,
    defaultSteps = 30,
    defaultCfgScale = 7,
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
      const size = req.size || "1024*1024";
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);

      const stabilityOptions = req.providerOptions?.stability as Record<string, unknown> | undefined;
      const steps = stabilityOptions?.steps || defaultSteps;
      const cfgScale = stabilityOptions?.cfgScale || defaultCfgScale;
      const seed = stabilityOptions?.seed as number | undefined;
      const stylePreset = stabilityOptions?.stylePreset as string | undefined;
      const negativePrompt = stabilityOptions?.negativePrompt as string | undefined;

      const [width, height] = size.split(/[*xX:]/).map((s) => parseInt(s, 10));

      logger.debug(
        `[StabilityAI] Generating ${count} image(s) with ${model}, size ${size}`,
      );

      const endpoint = `${baseUrl}/v1/generation/${encodeURIComponent(model)}/text-to-image`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          text_prompts: [
            {
              text: req.prompt,
              weight: 1,
            },
          ],
          width,
          height,
          samples: count,
          steps,
          cfg_scale: cfgScale,
        };

        if (seed !== undefined) {
          body.seed = seed;
        }
        if (stylePreset) {
          body.style_preset = stylePreset;
        }
        if (negativePrompt) {
          (body.text_prompts as Array<Record<string, unknown>>).push({
            text: negativePrompt,
            weight: -1,
          });
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
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
          artifacts?: Array<{
            base64: string;
            seed: number;
            finishReason: string;
          }>;
        };

        const images: GeneratedImageAsset[] = [];
        const artifacts = data.artifacts || [];

        for (const artifact of artifacts) {
          if (artifact.base64) {
            try {
              const buffer = Buffer.from(artifact.base64, "base64");
              images.push({
                buffer,
                mimeType: "image/png",
                metadata: {
                  seed: artifact.seed,
                  finishReason: artifact.finishReason,
                },
              });
            } catch {
              // Skip invalid base64
            }
          }
        }

        if (images.length === 0) {
          throw new Error(`${id}: No images returned from API`);
        }

        return {
          images,
          model,
          metadata: {
            provider: id,
            steps,
            cfgScale,
            stylePreset,
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

export const stabilityAIProvider = createStabilityAIProvider();

export default stabilityAIProvider;
