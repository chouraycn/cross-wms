/**
 * Fal AI 图像生成 Provider
 *
 * 基于 Fal AI API 实现图像生成：
 * - 同步模式：https://fal.run/{model}
 * - 异步队列模式：https://queue.fal.run/{model}（提交 + 轮询）
 * - 支持多种模型（flux、sdxl 等）
 * - 支持 API Key 认证（Authorization: Key {apiKey}）
 * - 支持图像到图像（image_url / image_urls）
 *
 * 参考 openclaw/extensions/fal/image-generation-provider.ts 与 runway provider 模式。
 */

import { logger } from "../../logger.js";
import { registerImageGenerationProvider } from "./provider-registry.js";
import type {
  GeneratedImageAsset,
  ImageGenerationProvider,
  ImageGenerationProviderCapabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageGenerationSourceImage,
} from "./types.js";

/** Fal 同步端点 */
const FAL_RUN_BASE_URL = "https://fal.run";
/** Fal 队列端点 */
const FAL_QUEUE_BASE_URL = "https://queue.fal.run";

/** 默认模型 */
const DEFAULT_FAL_MODEL = "fal-ai/flux/dev";

/** 支持的模型列表 */
const FAL_MODELS = [
  "fal-ai/flux/dev",
  "fal-ai/flux/pro",
  "fal-ai/flux/schnell",
  "fal-ai/fast-sdxl",
  "fal-ai/fast-lightning-sdxl",
] as const;

/** 支持的输出格式 */
const FAL_OUTPUT_FORMATS = ["png", "jpeg"] as const;

/** 支持的尺寸 */
const FAL_SUPPORTED_SIZES = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1024x1792",
  "1792x1024",
] as const;

/** 支持的宽高比 */
const FAL_SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "21:9",
  "4:5",
  "5:4",
] as const;

/** 队列轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3_000;
/** 队列轮询最大尝试次数 */
const MAX_POLL_ATTEMPTS = 100;
/** 默认超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 180_000;
/** 单张生成图最大下载字节数 */
const DEFAULT_MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Fal 图像条目 */
type FalImageEntry = {
  url?: unknown;
  content_type?: unknown;
  base64?: unknown;
};

/** Fal 同步响应 */
type FalImageResponse = {
  images?: unknown;
  prompt?: unknown;
};

/** Fal 队列提交响应 */
type FalQueueSubmitResponse = {
  request_id?: unknown;
  status_url?: unknown;
  response_url?: unknown;
  cancel_url?: unknown;
};

/** Fal 队列状态 */
type FalQueueStatus = {
  status?: unknown;
  logs?: unknown;
  metrics?: unknown;
};

/** Fal Provider 选项 */
export type FalProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  queueBaseUrl?: string;
  apiKeyEnvVar?: string;
  defaultTimeoutMs?: number;
};

const falCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 4,
    supportsSize: true,
    supportsAspectRatio: true,
    supportsResolution: true,
  },
  edit: {
    enabled: true,
    maxCount: 4,
    maxInputImages: 4,
    supportsSize: true,
    supportsAspectRatio: true,
    supportsResolution: true,
  },
  geometry: {
    sizes: [...FAL_SUPPORTED_SIZES],
    aspectRatios: [...FAL_SUPPORTED_ASPECT_RATIOS],
    resolutions: ["1K", "2K", "4K"],
  },
  output: {
    formats: [...FAL_OUTPUT_FORMATS],
  },
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function resolveApiKey(req: ImageGenerationRequest, apiKeyEnvVar: string): string | undefined {
  if (req.apiKey) return req.apiKey;
  if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
    return process.env[apiKeyEnvVar];
  }
  if (process.env.FAL_API_KEY) return process.env.FAL_API_KEY;
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  return undefined;
}

function resolveBaseUrl(req: ImageGenerationRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.FAL_BASE_URL) return process.env.FAL_BASE_URL.replace(/\/+$/, "");
  return defaultBaseUrl;
}

/** 将源图像转为 data URL（Fal 接受 image_url 字段） */
function toImageDataUrl(image: ImageGenerationSourceImage): string {
  const base64 = image.buffer.toString("base64");
  return `data:${image.mimeType};base64,${base64}`;
}

/** 解析 "WxH" 尺寸字符串 */
function parseSize(raw: string | undefined): { width: number; height: number } | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const match = /^(\d{2,5})x(\d{2,5})$/u.exec(trimmed);
  if (!match) return null;
  const width = Number.parseInt(match[1] ?? "", 10);
  const height = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

/** 将宽高比映射为 Fal 枚举值 */
function aspectRatioToEnum(aspectRatio: string | undefined): string | undefined {
  switch (aspectRatio?.trim()) {
    case "1:1":
      return "square_hd";
    case "4:3":
      return "landscape_4_3";
    case "3:4":
      return "portrait_4_3";
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
    default:
      return undefined;
  }
}

/** 根据请求解析 Fal 图像尺寸/宽高比参数 */
function resolveFalImageSize(params: {
  size?: string;
  resolution?: "1K" | "2K" | "4K";
  aspectRatio?: string;
  hasInputImages: boolean;
}): Record<string, unknown> | undefined {
  const parsed = parseSize(params.size);
  if (parsed) {
    return { image_size: parsed };
  }
  const normalizedAspectRatio = params.aspectRatio?.trim();
  if (normalizedAspectRatio) {
    const enumValue = aspectRatioToEnum(normalizedAspectRatio);
    if (enumValue) {
      return { image_size: enumValue };
    }
    // 透传原生宽高比字符串
    return { aspect_ratio: normalizedAspectRatio };
  }
  return undefined;
}

/** 当模型需要追加 image-to-image 子路径时返回调整后的路径 */
function ensureEditModelPath(model: string, hasInputImages: boolean): string {
  if (!hasInputImages) return model;
  if (model.endsWith("/image-to-image") || model.endsWith("/edit")) {
    return model;
  }
  return `${model}/image-to-image`;
}

/** 下载单张生成图 */
async function fetchImageBuffer(
  url: string,
  maxBytes = DEFAULT_MAX_IMAGE_BYTES,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`fal image download failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`);
    }
    const mimeType = response.headers.get("content-type")?.trim() || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > maxBytes) {
      throw new Error(`fal generated image download exceeds ${maxBytes} bytes`);
    }
    return { buffer, mimeType };
  } finally {
    clearTimeout(timeoutId);
  }
}

function imageFileExtension(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpeg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

/** 解析 Fal 图像生成响应，下载远程图片为 Buffer */
async function parseFalImageResponse(payload: FalImageResponse): Promise<{
  images: GeneratedImageAsset[];
  prompt?: string;
}> {
  if (!payload || typeof payload !== "object") {
    throw new Error("fal image generation response malformed");
  }
  const rawImages = payload.images;
  if (rawImages === undefined || rawImages === null) {
    return { images: [], prompt: normalizeString(payload.prompt) };
  }
  if (!Array.isArray(rawImages)) {
    throw new Error("fal image generation response malformed");
  }

  const images: GeneratedImageAsset[] = [];
  let index = 0;
  for (const entry of rawImages) {
    if (!entry || typeof entry !== "object") {
      throw new Error("fal image generation response malformed");
    }
    const imageEntry = entry as FalImageEntry;
    index += 1;

    if (imageEntry.base64 && typeof imageEntry.base64 === "string") {
      const mimeType = normalizeString(imageEntry.content_type) || "image/png";
      images.push({
        buffer: Buffer.from(imageEntry.base64, "base64"),
        mimeType,
        fileName: `image-${index}.${imageFileExtension(mimeType)}`,
      });
      continue;
    }

    const url = normalizeString(imageEntry.url);
    if (!url) {
      throw new Error("fal image generation response missing image url");
    }
    const downloaded = await fetchImageBuffer(url);
    const mimeType = downloaded.mimeType || normalizeString(imageEntry.content_type) || "image/png";
    images.push({
      buffer: downloaded.buffer,
      mimeType,
      fileName: `image-${index}.${imageFileExtension(mimeType)}`,
    });
  }

  return { images, prompt: normalizeString(payload.prompt) };
}

/**
 * 队列模式：提交请求并轮询结果。
 *
 * @param queueBaseUrl 队列端点根
 * @param model        模型路径
 * @param headers      请求头
 * @param body         请求体
 * @param timeoutMs    总超时
 */
async function submitAndPollQueue(params: {
  queueBaseUrl: string;
  model: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<FalImageResponse> {
  const { queueBaseUrl, model, headers, body, timeoutMs } = params;
  const submitUrl = `${queueBaseUrl}/${model}`;

  logger.debug(`[fal] queue submit -> ${submitUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const submitResponse = await fetch(submitUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text().catch(() => "");
      throw new Error(`fal queue submit failed (HTTP ${submitResponse.status}): ${errorText.slice(0, 200)}`);
    }

    const submitData = (await submitResponse.json()) as FalQueueSubmitResponse;
    const requestId = normalizeString(submitData.request_id);
    const statusUrl = normalizeString(submitData.status_url) ?? (requestId ? `${queueBaseUrl}/${model}/requests/${requestId}/status` : undefined);
    const responseUrl = normalizeString(submitData.response_url) ?? (requestId ? `${queueBaseUrl}/${model}/requests/${requestId}` : undefined);

    if (!statusUrl || !responseUrl) {
      throw new Error("fal queue submit response missing status_url/response_url");
    }

    logger.debug(`[fal] queue submitted, request_id=${requestId ?? "unknown"}, polling...`);

    // 轮询状态
    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
      attempts += 1;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const statusResponse = await fetch(statusUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      if (!statusResponse.ok) {
        const errorText = await statusResponse.text().catch(() => "");
        throw new Error(`fal queue status check failed (HTTP ${statusResponse.status}): ${errorText.slice(0, 200)}`);
      }

      const statusData = (await statusResponse.json()) as FalQueueStatus;
      const status = normalizeString(statusData.status);

      if (status === "COMPLETED") {
        logger.debug(`[fal] queue completed after ${attempts} polls, fetching result`);
        break;
      }
      if (status === "FAILED") {
        throw new Error("fal queue request failed during processing");
      }
      // IN_QUEUE / IN_PROGRESS 继续轮询
    }

    // 获取结果
    const resultResponse = await fetch(responseUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!resultResponse.ok) {
      const errorText = await resultResponse.text().catch(() => "");
      throw new Error(`fal queue result fetch failed (HTTP ${resultResponse.status}): ${errorText.slice(0, 200)}`);
    }

    return (await resultResponse.json()) as FalImageResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createFalProvider(
  options: FalProviderOptions = {},
): ImageGenerationProvider {
  const {
    id = "fal",
    label = "Fal AI",
    aliases = ["fal-ai", "falai"],
    defaultModel = DEFAULT_FAL_MODEL,
    models = [...FAL_MODELS],
    baseUrl: defaultBaseUrl = FAL_RUN_BASE_URL,
    queueBaseUrl: defaultQueueBaseUrl = FAL_QUEUE_BASE_URL,
    apiKeyEnvVar = "FAL_API_KEY",
    defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const provider: ImageGenerationProvider = {
    id,
    label,
    aliases,
    defaultModel,
    models,
    capabilities: falCapabilities,
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

      const hasInputImages = (req.inputImages?.length ?? 0) > 0;
      const requestedModel = req.model?.trim() || defaultModel;
      const model = ensureEditModelPath(requestedModel, hasInputImages);
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);
      const queueBaseUrl = defaultQueueBaseUrl;
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const count = Math.min(req.count ?? 1, 4);
      const outputFormat = req.outputFormat ?? "png";

      const headers: Record<string, string> = {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      };

      // 构建请求体
      const requestBody: Record<string, unknown> = {
        prompt: req.prompt,
        num_images: count,
        output_format: outputFormat,
      };

      const sizeParams = resolveFalImageSize({
        size: req.size,
        resolution: req.resolution,
        aspectRatio: req.aspectRatio,
        hasInputImages,
      });
      if (sizeParams) {
        Object.assign(requestBody, sizeParams);
      }

      // 图像到图像：附加输入图像
      if (hasInputImages && req.inputImages) {
        const inputImages = req.inputImages.slice(0, 4);
        const dataUrls = inputImages.map(toImageDataUrl);
        if (dataUrls.length === 1) {
          requestBody.image_url = dataUrls[0];
        } else {
          requestBody.image_urls = dataUrls;
        }
      }

      logger.debug(
        `[fal] generating image with ${model}, count=${count}, queueMode`,
      );

      // 优先使用异步队列模式（更可靠，支持长耗时模型）
      const useQueue = (req.providerOptions?.fal as Record<string, unknown> | undefined)?.sync !== true;

      let payload: FalImageResponse;
      if (useQueue) {
        payload = await submitAndPollQueue({
          queueBaseUrl,
          model,
          headers,
          body: requestBody,
          timeoutMs,
        });
      } else {
        // 同步模式
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const syncUrl = `${baseUrl}/${model}`;
          const response = await fetch(syncUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(`fal image generation failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`);
          }
          payload = (await response.json()) as FalImageResponse;
        } catch (err) {
          clearTimeout(timeoutId);
          if (err instanceof DOMException && err.name === "AbortError") {
            throw new Error(`fal: request timed out after ${timeoutMs}ms`);
          }
          throw err;
        }
      }

      const { images, prompt } = await parseFalImageResponse(payload);
      if (images.length === 0) {
        throw new Error("fal image generation response missing image data");
      }

      return {
        images,
        model,
        metadata: {
          provider: id,
          count,
          outputFormat,
          ...(prompt ? { prompt } : {}),
          queueMode: useQueue,
          createdAt: Date.now(),
        },
      };
    },
  };

  return provider;
}

/** 默认 Fal Provider 实例 */
export const falProvider = createFalProvider();

/** 注册到全局 Provider 注册表（优先级 8） */
registerImageGenerationProvider(falProvider, 8);

export default falProvider;
