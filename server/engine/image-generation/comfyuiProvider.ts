/**
 * ComfyUI 图像生成 Provider。
 *
 * 通过 ComfyUI API 提交 workflow 并轮询结果，生成图像。
 * 支持本地 ComfyUI 实例连接（默认 http://127.0.0.1:8188）、
 * 自定义 workflow 配置和异步轮询。
 *
 * 参考 openclaw/extensions/comfy/image-generation-provider.ts 和
 * workflow-runtime.ts 的实现逻辑，适配为 server/engine/image-generation
 * 的 ImageGenerationProvider 接口。
 */

import { logger } from "../../logger.js";
import type {
  GeneratedImageAsset,
  ImageGenerationProvider,
  ImageGenerationProviderCapabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageGenerationSourceImage,
} from "./types.js";

// ============================================================================
// 常量
// ============================================================================

const DEFAULT_BASE_URL = "http://127.0.0.1:8188";
const DEFAULT_MODEL = "workflow";
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_PROMPT_INPUT_NAME = "text";
const DEFAULT_INPUT_IMAGE_INPUT_NAME = "image";
const DEFAULT_MAX_OUTPUT_BYTES = 6 * 1024 * 1024;

// ============================================================================
// 类型
// ============================================================================

/** ComfyUI workflow JSON 对象。 */
type ComfyWorkflow = Record<string, unknown>;

/** ComfyUI /prompt 响应。 */
interface ComfyPromptResponse {
  prompt_id?: string;
}

/** ComfyUI 输出文件信息。 */
interface ComfyOutputFile {
  filename?: string;
  name?: string;
  subfolder?: string;
  type?: string;
}

/** ComfyUI history 条目。 */
interface ComfyHistoryEntry {
  outputs?: Record<string, Partial<Record<"images" | "gifs" | "videos" | "audio", ComfyOutputFile[]>>>;
}

/** ComfyUI Provider 配置选项。 */
export interface ComfyuiProviderOptions {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKey?: string;
  defaultTimeoutMs?: number;
  /** prompt 文本输入节点 ID（必需）。 */
  promptNodeId?: string;
  /** prompt 文本输入字段名（默认 "text"）。 */
  promptInputName?: string;
  /** 输入图像节点 ID（可选，用于图生图）。 */
  inputImageNodeId?: string;
  /** 输入图像字段名（默认 "image"）。 */
  inputImageInputName?: string;
  /** 输出节点 ID（可选，不指定则取全部输出）。 */
  outputNodeId?: string;
  /** 自定义 workflow JSON 对象。 */
  workflow?: ComfyWorkflow;
  /** workflow JSON 文件路径。 */
  workflowPath?: string;
  /** 轮询间隔（ms）。 */
  pollIntervalMs?: number;
}

// ============================================================================
// 内部工具函数
// ============================================================================

function normalizeBaseUrl(url?: string): string {
  const trimmed = url?.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_BASE_URL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 设置 workflow 节点的输入值。 */
function setWorkflowInput(
  workflow: ComfyWorkflow,
  nodeId: string,
  inputName: string,
  value: unknown,
): void {
  const node = workflow[nodeId];
  if (!isRecord(node)) {
    throw new Error(`Comfy workflow missing node "${nodeId}"`);
  }
  const inputs = node.inputs;
  if (!isRecord(inputs)) {
    throw new Error(`Comfy workflow node "${nodeId}" is missing an inputs object`);
  }
  inputs[inputName] = value;
}

/** 从文件扩展名或 MIME 类型推断扩展名。 */
function resolveFileExtension(params: { fileName?: string; mimeType?: string }): string {
  const mimeMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  if (params.mimeType && mimeMap[params.mimeType]) {
    return mimeMap[params.mimeType];
  }
  const fileName = params.fileName?.trim();
  if (fileName) {
    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex >= 0 && dotIndex < fileName.length - 1) {
      return fileName.slice(dotIndex + 1);
    }
  }
  return "png";
}

// ============================================================================
// HTTP 请求
// ============================================================================

/** 执行 HTTP 请求并返回 JSON。 */
async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ComfyUI HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 执行 HTTP 请求并返回 Buffer。 */
async function fetchBuffer(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
  maxBytes?: number,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const controller = new AbortController();
  const timeout = timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ComfyUI download HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const mimeType = res.headers.get("content-type") ?? "image/png";
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const limit = maxBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    if (buffer.byteLength > limit) {
      throw new Error(`ComfyUI output download exceeds ${limit} bytes`);
    }
    return { buffer, mimeType };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// ComfyUI 工作流执行
// ============================================================================

/** 提交 workflow 到 ComfyUI。 */
async function submitWorkflow(
  baseUrl: string,
  workflow: ComfyWorkflow,
  timeoutMs: number,
): Promise<string> {
  const res = await fetchJson<ComfyPromptResponse>(
    `${baseUrl}/prompt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    },
    timeoutMs,
  );
  if (!res.prompt_id) {
    throw new Error("ComfyUI submit response missing prompt_id");
  }
  return res.prompt_id;
}

/** 轮询 history 直到结果可用或超时。 */
async function pollHistory(
  baseUrl: string,
  promptId: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<ComfyHistoryEntry> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`ComfyUI workflow did not finish within ${Math.ceil(timeoutMs / 1000)}s`);
    }

    const history = await fetchJson<Record<string, ComfyHistoryEntry>>(
      `${baseUrl}/history/${promptId}`,
      { method: "GET" },
      Math.min(30_000, remaining),
    );

    const entry = history[promptId];
    if (entry?.outputs && Object.keys(entry.outputs).length > 0) {
      return entry;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

/** 从 history 条目中收集输出文件。 */
function collectOutputFiles(
  history: ComfyHistoryEntry,
  outputNodeId?: string,
): Array<{ nodeId: string; file: ComfyOutputFile }> {
  const outputs = history.outputs;
  if (!outputs) return [];

  const nodeIds = outputNodeId ? [outputNodeId] : Object.keys(outputs);
  const files: Array<{ nodeId: string; file: ComfyOutputFile }> = [];
  for (const nodeId of nodeIds) {
    const entry = outputs[nodeId];
    if (!entry) continue;
    const bucket = entry.images;
    if (Array.isArray(bucket)) {
      for (const file of bucket) {
        files.push({ nodeId, file });
      }
    }
  }
  return files;
}

/** 下载输出文件。 */
async function downloadOutputFile(
  baseUrl: string,
  file: ComfyOutputFile,
  timeoutMs: number,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const fileName = file.filename || file.name;
  if (!fileName) {
    throw new Error("ComfyUI output entry missing filename");
  }
  const query = new URLSearchParams({
    filename: fileName,
    subfolder: file.subfolder ?? "",
    type: file.type ?? "output",
  });
  return fetchBuffer(
    `${baseUrl}/view?${query.toString()}`,
    { method: "GET" },
    timeoutMs,
  );
}

// ============================================================================
// Provider 工厂
// ============================================================================

const defaultCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 1,
    supportsSize: false,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: true,
    maxCount: 1,
    maxInputImages: 1,
    supportsSize: false,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
};

/**
 * 创建 ComfyUI 图像生成 Provider。
 *
 * @param options - Provider 配置选项
 */
export function createComfyuiProvider(
  options: ComfyuiProviderOptions = {},
): ImageGenerationProvider {
  const {
    id = "comfyui",
    label = "ComfyUI",
    aliases = ["comfy"],
    defaultModel = DEFAULT_MODEL,
    models = [DEFAULT_MODEL],
    baseUrl,
    defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
    promptNodeId,
    promptInputName = DEFAULT_PROMPT_INPUT_NAME,
    inputImageNodeId,
    inputImageInputName = DEFAULT_INPUT_IMAGE_INPUT_NAME,
    outputNodeId,
    workflow,
    workflowPath,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
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
      return Boolean(workflow || workflowPath);
    },

    async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
      if ((req.inputImages?.length ?? 0) > 1) {
        throw new Error("ComfyUI image generation currently supports at most one reference image");
      }

      const base = normalizeBaseUrl(req.baseUrl ?? baseUrl);
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;

      // 使用请求级 workflow 或 provider 级 workflow
      let wf: ComfyWorkflow | undefined =
        (req.providerOptions?.comfyui as ComfyWorkflow | undefined) ?? workflow;

      if (!wf && workflowPath) {
        const fs = await import("node:fs/promises");
        const raw = await fs.readFile(workflowPath, "utf8");
        wf = JSON.parse(raw) as ComfyWorkflow;
      }

      if (!wf) {
        throw new Error(
          "ComfyUI workflow not configured: provide workflow or workflowPath in provider options",
        );
      }

      // 克隆 workflow 避免修改原始对象
      const workflowCopy: ComfyWorkflow = structuredClone(wf);

      // 设置 prompt 文本
      const pNodeId = (req.providerOptions?.comfyui as Record<string, unknown> | undefined)?.promptNodeId as string | undefined ?? promptNodeId;
      if (!pNodeId) {
        throw new Error("ComfyUI promptNodeId is required");
      }
      const pInputName = (req.providerOptions?.comfyui as Record<string, unknown> | undefined)?.promptInputName as string | undefined ?? promptInputName;
      setWorkflowInput(workflowCopy, pNodeId, pInputName, req.prompt);

      // 上传并设置输入图像（图生图）
      if (req.inputImages && req.inputImages.length > 0) {
        const imgNodeId = (req.providerOptions?.comfyui as Record<string, unknown> | undefined)?.inputImageNodeId as string | undefined ?? inputImageNodeId;
        if (!imgNodeId) {
          throw new Error(
            "ComfyUI edit requests require inputImageNodeId to be configured",
          );
        }
        const imgInputName = (req.providerOptions?.comfyui as Record<string, unknown> | undefined)?.inputImageInputName as string | undefined ?? inputImageInputName;
        const inputImage = req.inputImages[0] as ImageGenerationSourceImage;
        const uploadedName = await uploadInputImage(base, inputImage, timeoutMs);
        setWorkflowInput(workflowCopy, imgNodeId, imgInputName, uploadedName);
      }

      logger.debug(
        `[ComfyUI] Submitting workflow with prompt: ${req.prompt.slice(0, 100)}`,
      );

      // 提交 workflow
      const promptId = await submitWorkflow(base, workflowCopy, timeoutMs);

      // 轮询结果
      const history = await pollHistory(base, promptId, timeoutMs, pollIntervalMs);

      // 收集输出文件
      const outNodeId = (req.providerOptions?.comfyui as Record<string, unknown> | undefined)?.outputNodeId as string | undefined ?? outputNodeId;
      const outputFiles = collectOutputFiles(history, outNodeId);
      if (outputFiles.length === 0) {
        throw new Error(`ComfyUI workflow ${promptId} completed without image outputs`);
      }

      // 下载输出
      const images: GeneratedImageAsset[] = [];
      let assetIndex = 0;
      for (const output of outputFiles) {
        const downloaded = await downloadOutputFile(base, output.file, timeoutMs);
        assetIndex += 1;
        const originalName = output.file.filename || output.file.name;
        images.push({
          buffer: downloaded.buffer,
          mimeType: downloaded.mimeType,
          fileName:
            originalName ||
            `comfyui-${assetIndex}.${resolveFileExtension({ mimeType: downloaded.mimeType })}`,
          metadata: {
            nodeId: output.nodeId,
            promptId,
          },
        });
      }

      return {
        images,
        model: req.model || defaultModel,
        metadata: {
          provider: id,
          promptId,
          outputNodeIds: outputFiles.map((f) => f.nodeId),
        },
      };
    },
  };

  return provider;
}

// ============================================================================
// 输入图像上传
// ============================================================================

/** 上传输入图像到 ComfyUI 的 /upload/image 端点。 */
async function uploadInputImage(
  baseUrl: string,
  image: ImageGenerationSourceImage,
  timeoutMs: number,
): Promise<string> {
  const form = new FormData();
  const ab = new ArrayBuffer(image.buffer.byteLength);
  new Uint8Array(ab).set(image.buffer);
  const blob = new Blob([ab], { type: image.mimeType });
  form.set("image", blob, image.fileName || `input.${resolveFileExtension({ mimeType: image.mimeType })}`);
  form.set("type", "input");
  form.set("overwrite", "true");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ComfyUI image upload failed ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { name?: string; filename?: string };
    const uploadedName = data.filename || data.name;
    if (!uploadedName) {
      throw new Error("ComfyUI image upload response missing filename");
    }
    return uploadedName;
  } finally {
    clearTimeout(timer);
  }
}

export const comfyuiProvider = createComfyuiProvider();
export default comfyuiProvider;
