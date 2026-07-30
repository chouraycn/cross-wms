// 共享的提供商 HTTP 辅助工具。保持通用传输工具在此，避免能力 SDK 互相依赖。
// openclaw 原始实现为 barrel 重导出，依赖 ../agents/provider-http-errors.js、
// ../media-understanding/shared.js、../provider-runtime/operation-retry.js、
// ../agents/provider-attribution.js 等未移植模块。此处提供最小可用实现。

/** 提供商 HTTP 错误。 */
export class ProviderHttpError extends Error {
  readonly status: number;
  readonly detail?: unknown;
  readonly requestId?: string;
  constructor(message: string, status: number, detail?: unknown, requestId?: string) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
    this.detail = detail;
    this.requestId = requestId;
  }
}

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function createProviderHttpError(
  message: string,
  status: number,
  detail?: unknown,
  requestId?: string,
): ProviderHttpError {
  return new ProviderHttpError(message, status, detail, requestId);
}

/** 断言响应状态正常，否则抛出 HTTP 错误。 */
export async function assertOkOrThrowHttpError(response: Response): Promise<void> {
  if (!response.ok) {
    const detail = await extractProviderErrorDetail(response);
    throw new ProviderHttpError(
      `HTTP ${response.status} ${response.statusText}`,
      response.status,
      detail,
      extractProviderRequestId(response),
    );
  }
}

/** 断言响应状态正常，否则抛出提供商错误。 */
export async function assertOkOrThrowProviderError(response: Response): Promise<void> {
  return assertOkOrThrowHttpError(response);
}

/** 断言提供商二进制响应内容有效。 */
export async function assertProviderBinaryResponseContent(
  response: Response,
  _contentType?: string,
): Promise<Uint8Array> {
  return readProviderBinaryResponse(response);
}

/** 从错误响应中提取详情。 */
export async function extractProviderErrorDetail(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return undefined;
  }
}

/** 从响应头中提取提供商请求 ID。 */
export function extractProviderRequestId(response: Response): string | undefined {
  return response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined;
}

/** 格式化提供商错误负载为可读字符串。 */
export function formatProviderErrorPayload(detail: unknown): string {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/** 格式化提供商 HTTP 错误消息。 */
export function formatProviderHttpErrorMessage(error: ProviderHttpError): string {
  const parts = [error.message];
  if (error.requestId) parts.push(`requestId=${error.requestId}`);
  if (error.detail) parts.push(`detail=${formatProviderErrorPayload(error.detail)}`);
  return parts.join(" ");
}

/** 读取提供商二进制响应。 */
export async function readProviderBinaryResponse(response: Response): Promise<Uint8Array> {
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

/** 读取提供商 JSON 数组字段响应。 */
export async function readProviderJsonArrayFieldResponse<T = unknown>(
  response: Response,
  field: string,
): Promise<T[]> {
  const json = (await readProviderJsonResponse(response)) as Record<string, unknown>;
  const value = json[field];
  return Array.isArray(value) ? (value as T[]) : [];
}

/** 读取提供商 JSON 对象响应。 */
export async function readProviderJsonObjectResponse<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await readProviderJsonResponse(response)) as T;
}

/** 读取提供商 JSON 响应。 */
export async function readProviderJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  return JSON.parse(text);
}

/** 读取响应文本（限制最大长度）。 */
export async function readResponseTextLimited(
  response: Response,
  maxChars = 4096,
): Promise<string> {
  const text = await response.text();
  return truncateErrorDetail(text, maxChars);
}

/** 截断错误详情字符串。 */
export function truncateErrorDetail(detail: string, maxChars = 4096): string {
  if (detail.length <= maxChars) return detail;
  return `${detail.slice(0, maxChars)}…[truncated]`;
}

// ---- 操作超时与轮询 ----

/** 提供商操作超时时间（毫秒）。 */
export type ProviderOperationTimeoutMs = number;

/** 提供商操作截止期限。 */
export type ProviderOperationDeadline = {
  /** 截止时间戳（毫秒）。 */
  deadline: number;
};

/** 创建提供商操作超时解析器。 */
export function createProviderOperationTimeoutResolver(
  timeoutMs: ProviderOperationTimeoutMs,
): { deadline: ProviderOperationDeadline; isExpired(): boolean } {
  const deadline = Date.now() + timeoutMs;
  return {
    deadline: { deadline },
    isExpired: () => Date.now() >= deadline,
  };
}

/** 创建提供商操作截止期限。 */
export function createProviderOperationDeadline(
  timeoutMs: ProviderOperationTimeoutMs,
): ProviderOperationDeadline {
  return { deadline: Date.now() + timeoutMs };
}

/** 解析提供商操作超时时间。 */
export function resolveProviderOperationTimeoutMs(
  input?: number,
  defaultMs = 60_000,
): ProviderOperationTimeoutMs {
  return typeof input === "number" && input > 0 ? input : defaultMs;
}

/** 规范化基础 URL，去除尾部斜杠。 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** 解析提供商 HTTP 请求配置。 */
export function resolveProviderHttpRequestConfig(
  options?: { baseUrl?: string; timeoutMs?: number; headers?: Record<string, string> },
): { baseUrl: string; timeoutMs: ProviderOperationTimeoutMs; headers: Record<string, string> } {
  return {
    baseUrl: options?.baseUrl ? normalizeBaseUrl(options.baseUrl) : "",
    timeoutMs: resolveProviderOperationTimeoutMs(options?.timeoutMs),
    headers: options?.headers ?? {},
  };
}

/** 带超时的 Promise 包装。 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string,
): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(errorMessage ?? `Operation timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 带超时的 fetch。 */
export async function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const ms = resolveProviderOperationTimeoutMs(timeoutMs);
  return withTimeout(fetch(input, init), ms, `Request timed out after ${ms}ms`);
}

/** 带超时与 SSRF 守卫的 fetch。 */
export async function fetchWithTimeoutGuarded(
  input: string | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  return fetchWithTimeout(input, init, timeoutMs);
}

/** 发送 JSON POST 请求。 */
export async function postJsonRequest(
  url: string,
  body: unknown,
  options?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<Response> {
  return fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  }, options?.timeoutMs);
}

/** 发送 multipart POST 请求。 */
export async function postMultipartRequest(
  url: string,
  form: FormData,
  options?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<Response> {
  return fetchWithTimeout(url, {
    method: "POST",
    headers: options?.headers,
    body: form,
  }, options?.timeoutMs);
}

/** 轮询提供商操作直到返回 JSON 结果。 */
export async function pollProviderOperationJson<T = unknown>(
  _url: string,
  _options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<T> {
  throw new Error("pollProviderOperationJson: not implemented (dependency not ported)");
}

/** 获取提供商操作响应。 */
export async function fetchProviderOperationResponse(
  url: string,
  options?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<Response> {
  return fetchWithTimeout(url, { headers: options?.headers }, options?.timeoutMs);
}

/** 获取提供商下载响应。 */
export async function fetchProviderDownloadResponse(
  url: string,
  options?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<Uint8Array> {
  const response = await fetchWithTimeout(url, { headers: options?.headers }, options?.timeoutMs);
  return readProviderBinaryResponse(response);
}

/** 等待提供商操作轮询间隔。 */
export async function waitProviderOperationPollInterval(intervalMs = 2000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

/** 清理配置的模型提供商请求。 */
export function sanitizeConfiguredModelProviderRequest(
  body: unknown,
): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

// ---- 音频转录 ----

/** 构建音频转录 multipart 表单数据。 */
export function buildAudioTranscriptionFormData(
  audio: Uint8Array,
  options?: { filename?: string; model?: string },
): FormData {
  const form = new FormData();
  const blob = new Blob([audio as BlobPart]);
  form.append("file", blob, options?.filename ?? "audio.wav");
  if (options?.model) form.append("model", options.model);
  return form;
}

/** 解析音频转录上传文件名。 */
export function resolveAudioTranscriptionUploadFileName(
  input?: string,
): string {
  return input && input.trim() ? input : "audio.wav";
}

/** 发送转录请求。 */
export async function postTranscriptionRequest(
  url: string,
  audio: Uint8Array,
  options?: { filename?: string; model?: string; headers?: Record<string, string>; timeoutMs?: number },
): Promise<Response> {
  const form = buildAudioTranscriptionFormData(audio, options);
  return postMultipartRequest(url, form, { headers: options?.headers, timeoutMs: options?.timeoutMs });
}

/** 从转录响应中提取必需的文本。 */
export function requireTranscriptionText(
  json: unknown,
): string {
  if (json && typeof json === "object" && "text" in json) {
    const text = (json as { text: unknown }).text;
    if (typeof text === "string" && text.length > 0) return text;
  }
  throw new Error("requireTranscriptionText: response missing text field");
}

// ---- 操作重试 ----

/** 提供商操作重试阶段。 */
export type ProviderOperationRetryStage = "initial" | "retry" | "final";

/** 瞬态提供商重试配置。 */
export type TransientProviderRetryConfig = {
  attempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
};

/** 瞬态提供商重试选项。 */
export type TransientProviderRetryOptions = {
  config?: TransientProviderRetryConfig;
  signal?: AbortSignal;
};

/** 瞬态提供商重试参数。 */
export type TransientProviderRetryParams = {
  isRetryable?: (error: unknown) => boolean;
};

/** 提供商操作默认重试配置。 */
export const providerOperationRetryConfig: TransientProviderRetryConfig = {
  attempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  multiplier: 2,
};

/** 带重试地执行提供商操作。 */
export async function executeProviderOperationWithRetry<T>(
  fn: () => Promise<T>,
  options?: TransientProviderRetryOptions & TransientProviderRetryParams,
): Promise<T> {
  const config = options?.config ?? providerOperationRetryConfig;
  let lastError: unknown;
  for (let attempt = 0; attempt < config.attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = options?.isRetryable ?? (() => true);
      if (!isRetryable(error) || attempt === config.attempts - 1) break;
      const delay = Math.min(
        config.initialDelayMs * Math.pow(config.multiplier, attempt),
        config.maxDelayMs,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ---- 归因与端点解析 ----

/** 提供商归因策略。 */
export type ProviderAttributionPolicy = {
  includeRequestId?: boolean;
  includeUsage?: boolean;
};

/** 提供商请求能力输入。 */
export type ProviderRequestCapabilitiesInput = {
  streaming?: boolean;
  toolUse?: boolean;
  vision?: boolean;
};

/** 提供商请求能力。 */
export type ProviderRequestCapability = ProviderRequestCapabilitiesInput & {
  family?: string;
};

/** 提供商请求兼容族。 */
export type ProviderRequestCompatibilityFamily = string;

/** 提供商请求能力集合。 */
export type ProviderRequestCapabilities = {
  family: ProviderRequestCompatibilityFamily;
  capabilities: ProviderRequestCapability[];
};

/** 提供商端点类别。 */
export type ProviderEndpointClass = "chat" | "completions" | "embeddings" | "transcriptions" | "images";

/** 提供商端点解析结果。 */
export type ProviderEndpointResolution = {
  url: string;
  endpointClass: ProviderEndpointClass;
};

/** 提供商请求策略输入。 */
export type ProviderRequestPolicyInput = {
  attribution?: ProviderAttributionPolicy;
  capabilities?: ProviderRequestCapabilitiesInput;
};

/** 提供商请求策略解析结果。 */
export type ProviderRequestPolicyResolution = {
  attribution?: ProviderAttributionPolicy;
  capabilities?: ProviderRequestCapabilities;
};

/** 提供商请求传输方式。 */
export type ProviderRequestTransport = "http" | "websocket";

/** 提供商请求鉴权覆盖。 */
export type ProviderRequestAuthOverride = {
  type: "bearer" | "x-api-key" | "none";
  token?: string;
};

/** 提供商请求代理覆盖。 */
export type ProviderRequestProxyOverride = {
  url?: string;
};

/** 提供商请求 TLS 覆盖。 */
export type ProviderRequestTlsOverride = {
  rejectUnauthorized?: boolean;
};

/** 提供商请求传输覆盖集合。 */
export type ProviderRequestTransportOverrides = {
  auth?: ProviderRequestAuthOverride;
  proxy?: ProviderRequestProxyOverride;
  tls?: ProviderRequestTlsOverride;
};

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveProviderRequestHeaders(
  _input?: ProviderRequestTransportOverrides,
): Record<string, string> {
  return {};
}

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveProviderEndpoint(
  baseUrl: string,
  endpointClass: ProviderEndpointClass,
): ProviderEndpointResolution {
  const pathMap: Record<ProviderEndpointClass, string> = {
    chat: "/chat/completions",
    completions: "/completions",
    embeddings: "/embeddings",
    transcriptions: "/audio/transcriptions",
    images: "/images/generations",
  };
  return { url: `${normalizeBaseUrl(baseUrl)}${pathMap[endpointClass]}`, endpointClass };
}

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveProviderRequestCapabilities(
  input?: ProviderRequestCapabilitiesInput,
): ProviderRequestCapabilities {
  return {
    family: "openai",
    capabilities: input ? [input] : [],
  };
}

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveProviderRequestPolicy(
  input?: ProviderRequestPolicyInput,
): ProviderRequestPolicyResolution {
  return {
    attribution: input?.attribution,
    capabilities: input?.capabilities
      ? resolveProviderRequestCapabilities(input.capabilities)
      : undefined,
  };
}
