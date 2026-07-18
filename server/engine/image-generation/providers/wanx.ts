/**
 * Wanxiang Provider — 阿里万相图像生成
 *
 * 基于阿里云 DashScope 万相 API 的图像生成 Provider。
 * 提供更丰富的功能和更好的中文支持。
 */

import { logger } from "../../../logger.js";
import type {
  ImageGenerationProvider,
  ImageGenerationProviderCapabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
  GeneratedImageAsset,
} from "../types.js";

export type WanxiangStyle =
  | ""
  | "<auto>"
  | "3d"
  | "anime"
  | "photo"
  | "flat"
  | "oil painting"
  | "watercolor"
  | "sketch"
  | "chinese painting"
  | "cyberpunk"
  | "pixel art"
  | "isometric";

export type WanxiangSize =
  | "1024*1024"
  | "720*1280"
  | "1280*720"
  | "768*1344"
  | "1344*768"
  | "1440*1440"
  | "1440*720"
  | "720*1440";

export type WanxiangProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKeyEnvVar?: string;
  baseUrlEnvVar?: string;
  defaultTimeoutMs?: number;
  defaultN?: number;
  defaultSize?: WanxiangSize;
  defaultStyle?: WanxiangStyle;
  defaultSeed?: number;
};

const WANXIANG_SIZES: string[] = [
  "1024*1024",
  "720*1280",
  "1280*720",
  "768*1344",
  "1344*768",
  "1440*1440",
  "1440*720",
  "720*1440",
];

const wanxiangCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 6,
    supportsSize: true,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: false,
  },
  geometry: {
    sizes: WANXIANG_SIZES,
  },
  output: {
    qualities: ["auto"],
    formats: ["png"],
    backgrounds: ["opaque", "auto"],
  },
};

function resolveApiKey(req: ImageGenerationRequest, apiKeyEnvVar?: string): string | undefined {
  if (req.apiKey) return req.apiKey;
  if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
    return process.env[apiKeyEnvVar];
  }
  if (process.env.DASHSCOPE_API_KEY) {
    return process.env.DASHSCOPE_API_KEY;
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
  if (process.env.DASHSCOPE_BASE_URL) {
    return process.env.DASHSCOPE_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

export function createWanxiangProvider(
  options: WanxiangProviderOptions = {},
): ImageGenerationProvider {
  const {
    id = "wanx",
    label = "通义万相",
    aliases = ["dashscope", "aliyun", "tongyi", "wanxiang", "阿里万相"],
    defaultModel = "wanx-v1",
    models = ["wanx-v1"],
    baseUrl: defaultBaseUrl = "https://dashscope.aliyuncs.com/api/v1",
    apiKeyEnvVar = "DASHSCOPE_API_KEY",
    baseUrlEnvVar = "DASHSCOPE_BASE_URL",
    defaultTimeoutMs = 120000,
    defaultN = 1,
    defaultSize = "1024*1024",
  } = options;

  const provider: ImageGenerationProvider = {
    id,
    label,
    aliases,
    defaultModel,
    models,
    capabilities: wanxiangCapabilities,
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
      const count = Math.max(1, Math.min(req.count || defaultN, 6));
      const size = req.size || defaultSize;
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const baseUrl = resolveBaseUrl(req, baseUrlEnvVar, defaultBaseUrl);

      const wanxOptions = req.providerOptions?.wanx as Record<string, unknown> | undefined;
      const seed = wanxOptions?.seed as number | undefined;
      const style = wanxOptions?.style as string | undefined;
      const refImage = wanxOptions?.ref_image as string | undefined;
      const negativePrompt = wanxOptions?.negative_prompt as string | undefined;

      logger.debug(
        `[Wanxiang] Generating ${count} image(s) with model ${model}, size ${size}`,
      );

      const endpoint = `${baseUrl}/services/aigc/text2image/image-synthesis`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          model,
          input: {
            prompt: req.prompt,
          },
          parameters: {
            n: count,
            size,
          },
        };

        if (seed !== undefined) {
          (body.parameters as Record<string, unknown>).seed = seed;
        }
        if (style) {
          (body.parameters as Record<string, unknown>).style = style;
        }
        if (refImage) {
          (body.input as Record<string, unknown>).ref_image = refImage;
        }
        if (negativePrompt) {
          (body.input as Record<string, unknown>).negative_prompt = negativePrompt;
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-DashScope-Async": "enable",
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
          output?: {
            task_id?: string;
            task_status?: string;
            results?: Array<{
              url?: string;
            }>;
          };
        };

        const taskId = data.output?.task_id;

        const images: GeneratedImageAsset[] = [];

        if (data.output?.results) {
          for (const result of data.output.results) {
            if (result.url) {
              images.push({
                buffer: Buffer.alloc(0),
                mimeType: "image/png",
                metadata: {
                  url: result.url,
                  taskId,
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
            taskId,
            taskStatus: data.output?.task_status,
            style,
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

export function listWanxiangStyles(): { id: WanxiangStyle; label: string }[] {
  return [
    { id: "<auto>", label: "自动" },
    { id: "photo", label: "写实照片" },
    { id: "3d", label: "3D 风格" },
    { id: "anime", label: "动漫风格" },
    { id: "flat", label: "扁平插画" },
    { id: "oil painting", label: "油画" },
    { id: "watercolor", label: "水彩" },
    { id: "sketch", label: "素描" },
    { id: "chinese painting", label: "中国画" },
    { id: "cyberpunk", label: "赛博朋克" },
    { id: "pixel art", label: "像素艺术" },
    { id: "isometric", label: "等轴测" },
  ];
}

export const wanxiangProvider = createWanxiangProvider();

export default wanxiangProvider;
