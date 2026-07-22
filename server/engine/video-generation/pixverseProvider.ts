/**
 * PixVerse 视频生成 Provider
 *
 * 基于 PixVerse API 实现视频生成：
 * - API 端点：https://api.pixverse.ai（国际）/ https://app-api.pixverseai.cn（国内）
 * - 支持文本到视频生成（/video/text/generate）
 * - 支持图像到视频生成（先 /image/upload 再 /video/img/generate）
 * - 异步轮询结果（GET /video/result/{video_id}）
 * - API Key 认证（API-KEY 请求头）
 *
 * 参考 openclaw/extensions/pixverse/video-generation-provider.ts 与 runway provider 模式。
 */

import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import { registerVideoProvider } from "./provider-registry.js";
import type {
  GeneratedVideoAsset,
  VideoGenerationProvider,
  VideoProviderCapabilities,
  VideoRequest,
  VideoResult,
  VideoSourceAsset,
} from "./types.js";

/** PixVerse Provider ID */
export const PIXVERSE_PROVIDER_ID = "pixverse";

/** 国际端点 */
const PIXVERSE_INTL_BASE_URL = "https://app-api.pixverse.ai/openapi/v2";
/** 国内端点 */
const PIXVERSE_CN_BASE_URL = "https://app-api.pixverseai.cn/openapi/v2";

/** 默认模型 */
const DEFAULT_PIXVERSE_MODEL = "v6";

/** 支持的模型 */
const PIXVERSE_MODELS = ["v6", "c1"] as const;

/** 文生视频支持的宽高比 */
const PIXVERSE_TEXT_ASPECT_RATIOS = [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "2:3",
  "3:2",
  "21:9",
] as const;

/** 支持的质量档位 */
const PIXVERSE_QUALITIES = ["360p", "540p", "720p", "1080p"] as const;

/** 默认质量 */
const DEFAULT_PIXVERSE_QUALITY = "540p";

/** 默认超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 300_000;
/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 5_000;
/** 最大轮询次数 */
const MAX_POLL_ATTEMPTS = 180;
/** 最大时长（秒） */
const MAX_DURATION_SECONDS = 15;
/** PixVerse 种子最大值 */
const PIXVERSE_SEED_MAX = 2_147_483_647;

/** PixVerse API 区域 */
export type PixVerseApiRegion = "international" | "cn";

/** PixVerse Provider 选项 */
export type PixVerseProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKeyEnvVar?: string;
  defaultTimeoutMs?: number;
  defaultDurationSeconds?: number;
  region?: PixVerseApiRegion;
};

/** PixVerse 统一响应信封 */
type PixVerseEnvelope<T> = {
  ErrCode?: unknown;
  ErrMsg?: unknown;
  Resp?: T;
};

type PixVerseUploadImageResponse = {
  img_id?: unknown;
  img_url?: unknown;
};

type PixVerseVideoCreateResponse = {
  video_id?: unknown;
};

type PixVerseVideoResultResponse = {
  id?: unknown;
  status?: unknown;
  url?: unknown;
  outputWidth?: unknown;
  outputHeight?: unknown;
  seed?: unknown;
  size?: unknown;
};

const pixverseCapabilities: VideoProviderCapabilities = {
  generate: {
    maxVideos: 1,
    maxDurationSeconds: MAX_DURATION_SECONDS,
    supportedDurationSeconds: Array.from(
      { length: MAX_DURATION_SECONDS },
      (_, index) => index + 1,
    ),
    aspectRatios: [...PIXVERSE_TEXT_ASPECT_RATIOS],
    resolutions: ["360P", "540P", "720P", "1080P"],
    supportsAspectRatio: true,
    supportsResolution: true,
    supportsAudio: true,
  },
  imageToVideo: {
    enabled: true,
    maxVideos: 1,
    maxInputImages: 1,
    maxDurationSeconds: MAX_DURATION_SECONDS,
    supportedDurationSeconds: Array.from(
      { length: MAX_DURATION_SECONDS },
      (_, index) => index + 1,
    ),
    resolutions: ["360P", "540P", "720P", "1080P"],
    supportsResolution: true,
    supportsAudio: true,
  },
  videoToVideo: {
    enabled: false,
  },
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function asSafeIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const integer = Math.trunc(value);
  if (integer < min || integer > max) return undefined;
  return integer;
}

function resolveApiKey(req: VideoRequest, apiKeyEnvVar: string): string | undefined {
  if (req.apiKey) return req.apiKey;
  if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
    return process.env[apiKeyEnvVar];
  }
  if (process.env.PIXVERSE_API_KEY) return process.env.PIXVERSE_API_KEY;
  return undefined;
}

function resolveBaseUrl(req: VideoRequest, defaultBaseUrl: string): string {
  if (req.baseUrl) return req.baseUrl.replace(/\/+$/, "");
  if (process.env.PIXVERSE_BASE_URL) {
    return process.env.PIXVERSE_BASE_URL.replace(/\/+$/, "");
  }
  return defaultBaseUrl;
}

/** 根据区域解析默认端点 */
function resolveDefaultBaseUrl(region: PixVerseApiRegion): string {
  return region === "cn" ? PIXVERSE_CN_BASE_URL : PIXVERSE_INTL_BASE_URL;
}

/** 归一化模型名（去掉 pixverse/ 前缀） */
function normalizeModel(model: string | undefined): string {
  const normalized = normalizeString(model)?.replace(/^pixverse\//iu, "");
  return normalized?.toLowerCase() || DEFAULT_PIXVERSE_MODEL;
}

/** 解析质量档位 */
function resolveQuality(req: VideoRequest): string {
  const options = req.providerOptions ?? {};
  const requested =
    normalizeString(options.quality) ??
    normalizeString(req.resolution) ??
    normalizeString(req.size);
  if (!requested) return DEFAULT_PIXVERSE_QUALITY;
  // 480p 归一化为 540p
  const normalized = requested.toLowerCase() === "480p" ? "540p" : requested.toLowerCase();
  return (PIXVERSE_QUALITIES as readonly string[]).includes(normalized)
    ? normalized
    : DEFAULT_PIXVERSE_QUALITY;
}

/** 解析时长（秒），限制在 1..15 */
function resolveDurationSeconds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(MAX_DURATION_SECONDS, Math.round(value)));
}

/** 读取 PixVerse 成功响应，否则抛出错误 */
function readPixVerseSuccess<T>(payload: PixVerseEnvelope<T>, label: string): T {
  if (!payload || typeof payload !== "object") {
    throw new Error(`${label}: malformed JSON response`);
  }
  const code = asFiniteNumber(payload.ErrCode);
  if (code !== 0) {
    const message =
      normalizeString(payload.ErrMsg) ?? `ErrCode ${String(payload.ErrCode)}`;
    throw new Error(`${label}: ${message}`);
  }
  if (payload.Resp === undefined || payload.Resp === null) {
    throw new Error(`${label}: response missing Resp`);
  }
  return payload.Resp;
}

async function readPixVerseJson<T>(
  response: Pick<Response, "json">,
  label: string,
): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new Error(`${label}: malformed JSON response`, { cause });
  }
  return readPixVerseSuccess(payload as PixVerseEnvelope<T>, label);
}

function readVideoId(payload: PixVerseVideoCreateResponse): number {
  const videoId = asSafeIntegerInRange(payload.video_id, 0, Number.MAX_SAFE_INTEGER);
  if (videoId == null) {
    throw new Error("PixVerse video generation response missing video_id");
  }
  return videoId;
}

function readImageId(payload: PixVerseUploadImageResponse): number {
  const imageId = asSafeIntegerInRange(payload.img_id, 0, Number.MAX_SAFE_INTEGER);
  if (imageId == null) {
    throw new Error("PixVerse image upload response missing img_id");
  }
  return imageId;
}

function readStatus(payload: PixVerseVideoResultResponse): number {
  const status = asSafeIntegerInRange(payload.status, 0, Number.MAX_SAFE_INTEGER);
  if (status == null) {
    throw new Error("PixVerse video status response missing status");
  }
  return status;
}

/** 状态码 6/7/8 视为失败 */
function readFailureMessage(payload: PixVerseVideoResultResponse): string | undefined {
  switch (readStatus(payload)) {
    case 7:
      return "PixVerse video generation failed content moderation";
    case 8:
      return "PixVerse video generation failed";
    case 6:
      return "PixVerse video generation was deleted before completion";
    default:
      return undefined;
  }
}

/** 构建带 Ai-trace-id 的请求头 */
function buildHeaders(apiKey: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "API-KEY": apiKey,
    "Ai-trace-id": randomUUID(),
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

/** 构建图像上传 multipart 表单 */
function buildUploadImageForm(asset: VideoSourceAsset): FormData {
  const form = new FormData();
  const url = normalizeString(asset.url);
  if (url) {
    form.set("image_url", url);
    return form;
  }
  if (!asset.buffer) {
    throw new Error("PixVerse image-to-video input is missing image data.");
  }
  const mimeType = normalizeString(asset.mimeType) ?? "image/png";
  const extension = mimeType.split("/")[1]?.split(";")[0] ?? "png";
  const fileName = normalizeString(asset.fileName) ?? `image.${extension}`;
  const bytes = new Uint8Array(asset.buffer.byteLength);
  bytes.set(asset.buffer);
  form.set("image", new File([bytes], fileName, { type: mimeType }));
  return form;
}

/** 构建视频生成请求体 */
function buildVideoBody(
  req: VideoRequest,
  model: string,
  imageId?: number,
): Record<string, unknown> {
  const options = req.providerOptions ?? {};
  const body: Record<string, unknown> = {
    duration: resolveDurationSeconds(req.durationSeconds),
    model,
    prompt: req.prompt,
    quality: resolveQuality(req),
  };
  if (imageId !== undefined) {
    body.img_id = imageId;
    body.motion_mode =
      normalizeString(options.motion_mode) ??
      normalizeString(options.motionMode) ??
      "normal";
  } else {
    body.aspect_ratio = normalizeString(req.aspectRatio) ?? "16:9";
  }

  const negativePrompt =
    normalizeString(options.negative_prompt) ??
    normalizeString(options.negativePrompt);
  if (negativePrompt) body.negative_prompt = negativePrompt;

  const cameraMovement =
    normalizeString(options.camera_movement) ??
    normalizeString(options.cameraMovement);
  if (cameraMovement) body.camera_movement = cameraMovement;

  const templateId =
    asFiniteNumber(options.template_id) ?? asFiniteNumber(options.templateId);
  if (templateId != null) body.template_id = templateId;

  const seed = asSafeIntegerInRange(options.seed, 0, PIXVERSE_SEED_MAX);
  if (seed !== undefined) body.seed = seed;

  if (req.audio !== undefined) {
    body.generate_audio_switch = req.audio;
  }
  return body;
}

/** 提取完成的视频资产 */
function extractVideo(payload: PixVerseVideoResultResponse): GeneratedVideoAsset {
  const url = normalizeString(payload.url);
  if (!url) {
    throw new Error("PixVerse video generation completed without output URL");
  }
  return {
    url,
    mimeType: "video/mp4",
    fileName: "video-1.mp4",
    metadata: {
      sourceUrl: url,
      outputWidth: asFiniteNumber(payload.outputWidth),
      outputHeight: asFiniteNumber(payload.outputHeight),
    },
  };
}

/**
 * 轮询视频生成结果直至完成或失败。
 */
async function pollVideoResult(params: {
  videoId: number;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}): Promise<PixVerseVideoResultResponse> {
  const { videoId, baseUrl, apiKey, timeoutMs } = params;
  const statusUrl = `${baseUrl}/video/result/${videoId}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
      attempts += 1;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await fetch(statusUrl, {
        method: "GET",
        headers: buildHeaders(apiKey),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `PixVerse video status request failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
        );
      }

      const payload = (await response.json()) as PixVerseEnvelope<PixVerseVideoResultResponse>;
      const result = readPixVerseSuccess(payload, "PixVerse video status request failed");
      const status = readStatus(result);

      if (status === 1) {
        logger.debug(`[pixverse] video ${videoId} completed after ${attempts} polls`);
        return result;
      }

      const failureMessage = readFailureMessage(result);
      if (failureMessage) {
        throw new Error(failureMessage);
      }
      // 其他状态继续轮询
    }
    throw new Error(
      `PixVerse video generation task ${videoId} did not finish in time`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createPixVerseProvider(
  options: PixVerseProviderOptions = {},
): VideoGenerationProvider {
  const {
    id = PIXVERSE_PROVIDER_ID,
    label = "PixVerse",
    aliases = ["pixverse-ai"],
    defaultModel = DEFAULT_PIXVERSE_MODEL,
    models = [...PIXVERSE_MODELS],
    baseUrl: optionBaseUrl,
    apiKeyEnvVar = "PIXVERSE_API_KEY",
    defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
    defaultDurationSeconds = 5,
    region = "international",
  } = options;

  const defaultBaseUrl = optionBaseUrl ?? resolveDefaultBaseUrl(region);

  const provider: VideoGenerationProvider = {
    id,
    label,
    aliases,
    defaultModel,
    models,
    capabilities: pixverseCapabilities,
    defaultTimeoutMs,

    isConfigured(): boolean {
      return !!resolveApiKey(
        { provider: id, model: defaultModel, prompt: "" },
        apiKeyEnvVar,
      );
    },

    async generateVideo(req: VideoRequest): Promise<VideoResult> {
      if ((req.inputVideos?.length ?? 0) > 0) {
        throw new Error("PixVerse video generation does not support video reference inputs.");
      }
      if ((req.inputImages?.length ?? 0) > 1) {
        throw new Error("PixVerse image-to-video supports at most one input image.");
      }

      const apiKey = resolveApiKey(req, apiKeyEnvVar);
      if (!apiKey) {
        throw new Error(`API key not configured for provider: ${id}`);
      }

      const model = normalizeModel(req.model);
      const baseUrl = resolveBaseUrl(req, defaultBaseUrl);
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;

      logger.debug(
        `[pixverse] generating video with model=${model}, duration=${resolveDurationSeconds(req.durationSeconds)}s`,
      );

      // 图生视频：先上传图像
      const inputImage = req.inputImages?.[0];
      let imageId: number | undefined;
      if (inputImage) {
        const uploadUrl = `${baseUrl}/image/upload`;
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: buildHeaders(apiKey),
          body: buildUploadImageForm(inputImage),
        });
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text().catch(() => "");
          throw new Error(
            `PixVerse image upload failed (HTTP ${uploadResponse.status}): ${errorText.slice(0, 200)}`,
          );
        }
        const uploadPayload = await readPixVerseJson<PixVerseUploadImageResponse>(
          uploadResponse,
          "PixVerse image upload failed",
        );
        imageId = readImageId(uploadPayload);
        logger.debug(`[pixverse] image uploaded, img_id=${imageId}`);
      }

      // 创建视频生成任务
      const endpoint = imageId === undefined ? "/video/text/generate" : "/video/img/generate";
      const createUrl = `${baseUrl}${endpoint}`;
      const createResponse = await fetch(createUrl, {
        method: "POST",
        headers: buildHeaders(apiKey, "application/json"),
        body: JSON.stringify(buildVideoBody(req, model, imageId)),
      });
      if (!createResponse.ok) {
        const errorText = await createResponse.text().catch(() => "");
        throw new Error(
          `PixVerse video generation failed (HTTP ${createResponse.status}): ${errorText.slice(0, 200)}`,
        );
      }

      const createPayload = await readPixVerseJson<PixVerseVideoCreateResponse>(
        createResponse,
        "PixVerse video generation failed",
      );
      const videoId = readVideoId(createPayload);
      logger.debug(`[pixverse] video task created, video_id=${videoId}, polling...`);

      // 轮询结果
      const completed = await pollVideoResult({
        videoId,
        baseUrl,
        apiKey,
        timeoutMs,
      });

      return {
        videos: [extractVideo(completed)],
        model,
        metadata: {
          provider: id,
          endpoint,
          videoId,
          status: readStatus(completed),
          seed: asSafeIntegerInRange(completed.seed, 0, PIXVERSE_SEED_MAX),
          size: asFiniteNumber(completed.size),
          createdAt: Date.now(),
        },
      };
    },
  };

  return provider;
}

/** 默认 PixVerse Provider 实例 */
export const pixverseProvider = createPixVerseProvider();

/** 注册到全局 Provider 注册表（优先级 10） */
registerVideoProvider(pixverseProvider, 10);

export default pixverseProvider;
