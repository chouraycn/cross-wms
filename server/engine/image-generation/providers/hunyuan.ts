/**
 * Hunyuan Provider — 腾讯混元图像生成
 *
 * 基于腾讯混元 API 的图像生成 Provider。
 */

import { logger } from "../../../logger.js";
import type {
  ImageGenerationProvider,
  ImageGenerationProviderCapabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
  GeneratedImageAsset,
} from "../types.js";

export type HunyuanModel = "hunyuan-v1" | "hunyuan-v2";

export type HunyuanProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKeyEnvVar?: string;
  baseUrlEnvVar?: string;
  secretIdEnvVar?: string;
  secretKeyEnvVar?: string;
  defaultTimeoutMs?: number;
  defaultN?: number;
  defaultSize?: string;
  defaultSteps?: number;
  defaultCfgScale?: number;
  defaultSampler?: string;
  enableSafetyCheck?: boolean;
};

const HUNYUAN_SIZES = [
  "768:768",
  "768:1024",
  "1024:768",
  "1024:1024",
  "1024:1280",
  "1280:1024",
  "1280:720",
  "720:1280",
];

const hunyuanCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 4,
    supportsSize: true,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: false,
  },
  geometry: {
    sizes: HUNYUAN_SIZES,
  },
  output: {
    qualities: ["auto"],
    formats: ["png", "jpeg"],
    backgrounds: ["opaque", "auto"],
  },
};

function resolveApiKey(req: ImageGenerationRequest, apiKeyEnvVar?: string): string | undefined {
  if (req.apiKey) return req.apiKey;
  if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
    return process.env[apiKeyEnvVar];
  }
  if (process.env.HUNYUAN_API_KEY) {
    return process.env.HUNYUAN_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(
  req: ImageGenerationRequest,
  baseUrlEnvVar: string | undefined,
  defaultBaseUrl: string,
): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (baseUrlEnvVar && process.env[baseUrlEnvVar]) {
    return process.env[baseUrlEnvVar]!.replace(/\/+$/, "");
  }
  if (process.env.HUNYUAN_BASE_URL) {
    return process.env.HUNYUAN_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createHunyuanProvider(
  options: HunyuanProviderOptions = {},
): ImageGenerationProvider {
  const {
    id = "hunyuan",
    label = "混元",
    aliases = ["tencent", "tencentcloud", "hunyuan-tencent", "腾讯混元"],
    defaultModel = "hunyuan-v1",
    models = ["hunyuan-v1", "hunyuan-v2"],
    baseUrl: defaultBaseUrl = "https://api.hunyuan.cloud.tencent.com",
    apiKeyEnvVar = "HUNYUAN_API_KEY",
    baseUrlEnvVar = "HUNYUAN_BASE_URL",
    defaultTimeoutMs = 120000,
    defaultN = 1,
    defaultSize = "1024:1024",
    defaultSteps = 30,
    defaultCfgScale = 7,
    defaultSampler = "DPM++ 2M",
    enableSafetyCheck = true,
  } = options;

  const provider: ImageGenerationProvider = {
    id,
    label,
    aliases,
    defaultModel,
    models,
    capabilities: hunyuanCapabilities,
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

      if (!req.prompt || req.prompt.trim().length === 0) {
        throw new Error("提示词不能为空");
      }

      const model = req.model || defaultModel;
      const count = Math.max(1, Math.min(req.count || defaultN, 4));
      const size = req.size || defaultSize;
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, baseUrlEnvVar, defaultBaseUrl);

      const hunyuanOptions = req.providerOptions?.hunyuan as Record<string, unknown> | undefined;
      const steps = hunyuanOptions?.steps || defaultSteps;
      const cfgScale = hunyuanOptions?.cfgScale || defaultCfgScale;
      const seed = hunyuanOptions?.seed as number | undefined;
      const sampler = hunyuanOptions?.sampler || defaultSampler;
      const negativePrompt = hunyuanOptions?.negativePrompt as string | undefined;
      const style = hunyuanOptions?.style as string | undefined;

      const [width, height] = size.split(":").map((s) => parseInt(s, 10));

      logger.debug(
        `[Hunyuan] Generating ${count} image(s) with model ${model}, size ${size}`,
      );

      const endpoint = `${baseUrl}/v1/images/generations`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          model,
          prompt: req.prompt,
          width: width || 1024,
          height: height || 1024,
          n: count,
          response_format: "base64",
        };

        if (seed !== undefined) {
          body.seed = seed;
        }
        if (negativePrompt) {
          body.negative_prompt = negativePrompt;
        }
        if (style) {
          body.style = style;
        }

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
          throw new Error(
            `${id} API error (HTTP ${response.status}): ${errorText}`,
          );
        }

        const data = (await response.json()) as {
          data?: Array<{
            b64_json?: string;
            url?: string;
            revised_prompt?: string;
          }>;
        };

        const images: GeneratedImageAsset[] = [];
        const dataArray = data.data || [];

        for (const item of dataArray) {
          if (item.b64_json) {
            try {
              const buffer = Buffer.from(item.b64_json, "base64");
              images.push({
                buffer,
                mimeType: "image/png",
                revisedPrompt: item.revised_prompt,
                metadata: {
                  seed,
                  steps,
                  cfgScale,
                  sampler,
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
            sampler,
            style,
            safetyCheck: enableSafetyCheck,
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

export const hunyuanProvider = createHunyuanProvider();

export default hunyuanProvider;
