/**
 * Provider/runtime 失败分类与 assistant 面向错误文本格式化。
 *
 * 完整的 openclaw 版本（1767 行）依赖较深的 oauth-refresh-failure、sandbox/runtime-status
 * 等模块，此处采用「重导出已有 + stub 缺失」的策略，保证 barrel 的 38 个导出都能解析。
 *
 * 已有实现位于：
 *  - ./sanitize-user-facing-text.ts（formatBillingErrorMessage、getApiErrorPayloadFingerprint 等）
 *  - ../../shared/assistant-error-format.ts（parseApiErrorInfo、formatRawAssistantErrorForUi 等）
 */
import { normalizeLowercaseStringOrEmpty } from "../../infra/string-coerce.js";

// 重导出已有实现（来自 sanitize-user-facing-text.ts）
export {
  BILLING_ERROR_USER_MESSAGE,
  formatBillingErrorMessage,
  formatRateLimitOrOverloadedErrorCopy,
  getApiErrorPayloadFingerprint,
  isRawApiErrorPayload,
} from "./sanitize-user-facing-text.js";

// 重导出已有实现（来自 shared/assistant-error-format.ts）
export {
  formatRawAssistantErrorForUi,
  isCloudflareOrHtmlErrorPage,
  parseApiErrorInfo,
} from "../../shared/assistant-error-format.js";

// ============================================================================
// 以下为 openclaw errors.ts 中存在、但 cross-wms 未移植的 API。
// 提供最小可运行 stub：分类函数返回 undefined / false，格式化函数返回原始文本。
// ============================================================================

export type ProviderRuntimeFailureKind =
  | "auth"
  | "billing"
  | "rate_limit"
  | "overloaded"
  | "context_overflow"
  | "transient"
  | "timeout"
  | "image"
  | "compaction"
  | "failover"
  | "unknown";

export type FailoverReason =
  | "auth"
  | "billing"
  | "rate_limit"
  | "overloaded"
  | "context_overflow"
  | "transient"
  | "timeout"
  | "image"
  | "compaction"
  | "unknown"
  | null;

export const GENERIC_ASSISTANT_ERROR_TEXT =
  "I encountered an error while processing your request. Please try again.";

/** Detect provider errors that require reasoning to stay enabled. */
export function isReasoningConstraintErrorMessage(raw: string): boolean {
  if (!raw) {
    return false;
  }
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("reasoning is mandatory") ||
    lower.includes("reasoning is required") ||
    lower.includes("requires reasoning") ||
    (lower.includes("reasoning") && lower.includes("cannot be disabled"))
  );
}

/** Classify the failover reason from an assistant error. Stub: returns null. */
export function classifyAssistantFailoverReason(
  _error: unknown,
): FailoverReason {
  return null;
}

/** Classify the provider runtime failure kind from an error. Stub: returns "unknown". */
export function classifyProviderRuntimeFailureKind(
  _error: unknown,
): ProviderRuntimeFailureKind {
  return "unknown";
}

/** Classify failover reason from an error message string. Stub: returns null. */
export function classifyFailoverReason(_raw: string): FailoverReason {
  return null;
}

/** Classify failover reason from an HTTP status code. Stub: returns null. */
export function classifyFailoverReasonFromHttpStatus(
  _status: number,
): FailoverReason {
  return null;
}

/**
 * Classify the failover reason from a failover signal emitted by the embedded
 * agent runtime. Stub: returns null (no failover classification).
 *
 * 对应 openclaw 版本的 classifyFailoverSignal，由 agents/failover-error.ts 引用。
 */
export function classifyFailoverSignal(_signal: unknown): FailoverReason {
  return null;
}

/** Format assistant error text. Stub: returns the raw error string. */
export function formatAssistantErrorText(raw?: string): string {
  return raw ?? GENERIC_ASSISTANT_ERROR_TEXT;
}

/** Format user-facing assistant error text. Stub: returns the raw error string. */
export function formatUserFacingAssistantErrorText(raw?: string): string {
  return raw ?? GENERIC_ASSISTANT_ERROR_TEXT;
}

/** Check if an assistant error is an auth error. */
export function isAuthAssistantError(error: unknown): boolean {
  if (!error) return false;
  const raw = typeof error === "string" ? error : String(error?.["message"] ?? error);
  return isAuthErrorMessage(raw);
}

/** Check if an error message is an auth error. */
export function isAuthErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("unauthorized") ||
    lower.includes("authentication") ||
    lower.includes("invalid api key") ||
    lower.includes("permission denied")
  );
}

/** Check if an auth error is permanent (not retryable). */
export function isAuthPermanentErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("invalid api key") ||
    lower.includes("authentication failed") ||
    lower.includes("permission denied")
  );
}

/** Check if an assistant error is a billing error. */
export function isBillingAssistantError(error: unknown): boolean {
  if (!error) return false;
  const raw = typeof error === "string" ? error : String(error?.["message"] ?? error);
  return isBillingErrorMessage(raw);
}

/** Check if an error message is a billing error. */
export function isBillingErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("billing") ||
    lower.includes("payment") ||
    lower.includes("credit") ||
    lower.includes("quota") ||
    lower.includes("exceeded your current quota")
  );
}

/** Extract observed overflow token count from an error message. Stub: returns null. */
export function extractObservedOverflowTokenCount(_raw: string): number | null {
  return null;
}

/** Check if an error is a Cloud Code Assist format error. */
export function isCloudCodeAssistFormatError(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return lower.includes("cloud code assist") && lower.includes("format");
}

/** Check if an error is a compaction failure. */
export function isCompactionFailureError(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return lower.includes("compaction") && lower.includes("fail");
}

/** Check if an error is a context overflow error. */
export function isContextOverflowError(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("context length exceeded") ||
    lower.includes("maximum context length") ||
    lower.includes("too many tokens")
  );
}

/** Check if an error is likely a context overflow error (heuristic). */
export function isLikelyContextOverflowError(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("context") &&
    (lower.includes("overflow") || lower.includes("length") || lower.includes("tokens"))
  );
}

/** Check if an assistant error is a failover error. Stub: returns false. */
export function isFailoverAssistantError(_error: unknown): boolean {
  return false;
}

/** Check if an error message is a failover error message. Stub: returns false. */
export function isFailoverErrorMessage(_raw: string): boolean {
  return false;
}

/** Check if an error is a generic unknown stream error. */
export function isGenericUnknownStreamErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return lower.includes("stream") && lower.includes("error");
}

/** Check if an error is an image dimension error. */
export function isImageDimensionErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return lower.includes("image") && lower.includes("dimension");
}

/** Check if an error is an image size error. */
export function isImageSizeError(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return lower.includes("image") && lower.includes("size");
}

/** Check if an error is an overloaded error. */
export function isOverloadedErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return lower.includes("overloaded") || lower.includes("service unavailable");
}

/** Check if an assistant error is a rate limit error. */
export function isRateLimitAssistantError(error: unknown): boolean {
  if (!error) return false;
  const raw = typeof error === "string" ? error : String(error?.["message"] ?? error);
  return isRateLimitErrorMessage(raw);
}

/** Check if an error message is a rate limit error. */
export function isRateLimitErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("429")
  );
}

/** Check if an HTTP error is transient (retryable). */
export function isTransientHttpError(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Check if an error is a timeout error. */
export function isTimeoutErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return lower.includes("timeout") || lower.includes("timed out");
}

/** Parse image dimension error. Stub: returns null. */
export function parseImageDimensionError(_raw: string): { width?: number; height?: number } | null {
  return null;
}

/** Parse image size error. Stub: returns null. */
export function parseImageSizeError(_raw: string): { bytes?: number; limit?: number } | null {
  return null;
}

// ============================================================================
// Failover signal classification (failover-error.ts 依赖)
// ============================================================================

/**
 * 描述一次 provider/model 失败信号的轻量结构，由 failover-error.ts 在
 * 嵌套错误归因过程中读取。
 *
 * 对应 openclaw 版本的 FailoverSignal；此处保留最小字段集以避免破坏类型推断。
 */
export type FailoverSignal = {
  /** 原始 HTTP 状态码（若信号源自 HTTP 错误）。 */
  status?: number;
  /** 原始错误名（如 "TimeoutError"）。 */
  name?: string;
  /** 原始错误消息文本。 */
  message?: string;
  /** 已分类的故障转移原因（若上游已分类）。 */
  reason?: FailoverReason;
  /** 是否为本地协调失败（如会话写锁）。 */
  localCoordination?: boolean;
  /** 是否为无响应体的 HTTP 信号。 */
  noBody?: boolean;
  /** 是否已分类失败（默认 false 表示尚未分类）。 */
  unclassified?: boolean;
};

/**
 * 故障转移分类结果，含原因与建议的处置方式。
 * 对应 openclaw 版本的 FailoverClassification；最小字段集。
 */
export type FailoverClassification = {
  reason: FailoverReason;
  /** 是否建议重试。 */
  retryable?: boolean;
  /** 是否建议切换到下一个 provider/model。 */
  shouldFailover?: boolean;
  /** 可用于日志的简短摘要。 */
  summary?: string;
};

/**
 * 从异常或 raw 信号对象中抽取 FailoverSignal。
 * Stub: 返回一个最小信号，仅携带 message，不分类。
 */
export function extractFailoverSignalDetails(
  error: unknown,
): FailoverSignal {
  if (!error) {
    return { unclassified: true };
  }
  if (typeof error === "string") {
    return { message: error, unclassified: true };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message, unclassified: true };
  }
  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;
    return {
      name: typeof obj.name === "string" ? obj.name : undefined,
      message: typeof obj.message === "string" ? obj.message : undefined,
      status: typeof obj.status === "number" ? obj.status : undefined,
      unclassified: true,
    };
  }
  return { unclassified: true };
}

/**
 * 从一个 FailoverSignal 推断其归类状态。
 * Stub: 若信号未携带 reason 且未携带 status，则视为未分类。
 */
export function inferSignalStatus(signal: FailoverSignal): {
  classified: boolean;
  reason: FailoverReason;
} {
  if (signal?.reason) {
    return { classified: true, reason: signal.reason };
  }
  if (typeof signal?.status === "number" && signal.status > 0) {
    return { classified: true, reason: classifyFailoverReasonFromHttpStatus(signal.status) };
  }
  return { classified: false, reason: null };
}

/**
 * 判断一个信号是否为「无响应体且尚未分类」的 HTTP 失败信号。
 * 用于在 failover-error.ts 中决定是否回退到状态码启发式分类。
 */
export function isUnclassifiedNoBodyHttpSignal(signal: FailoverSignal): boolean {
  return (
    signal?.unclassified === true &&
    signal?.noBody === true &&
    typeof signal?.status === "number" &&
    signal.status > 0
  );
}
