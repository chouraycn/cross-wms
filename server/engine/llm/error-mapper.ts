/**
 * 错误映射 — 统一错误码 / 错误分类。
 *
 * 不同 Provider 的错误响应格式各异：
 * - OpenAI: { error: { message, type, code } }
 * - Anthropic: { type, error: { type, message } }
 * - Google: { error: { code, message, status } }
 *
 * 此模块将这些错误统一为 LLMError，并标注是否可重试。
 */
import { logger } from '../../logger.js';

/** LLM 统一错误码。 */
export type LLMErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'invalid_request'
  | 'not_found'
  | 'server_error'
  | 'timeout'
  | 'network'
  | 'context_length_exceeded'
  | 'content_filter'
  | 'quota_exceeded'
  | 'aborted'
  | 'sensitive_content'
  | 'compliance_violation'
  | 'unknown';

/** 国内厂商特有的内容安全错误关键词。 */
const CN_CONTENT_FILTER_KEYWORDS = [
  'content_filter',
  'content filter',
  'sensitive',
  '敏感',
  '违规',
  '审核',
  '不合规',
  '政治敏感',
  '色情',
  '暴力',
  '赌博',
  '诈骗',
  'harmonize',
  'harmonization',
  'blocked',
  'prohibited',
];

/** 国内厂商特有的合规错误关键词。 */
const CN_COMPLIANCE_KEYWORDS = [
  'compliance',
  '合规',
  '备案',
  'license',
  '资质',
  'permission denied',
  'unauthorized access',
  '访问被拒',
];

/** 错误分类。 */
export type ErrorClassification = {
  code: LLMErrorCode;
  retryable: boolean;
  message: string;
  /** 原始错误（如果有）。 */
  cause?: unknown;
  /** 建议的 Retry-After（毫秒）。 */
  retryAfterMs?: number;
};

/** LLM 统一错误类型。 */
export class LLMError extends Error {
  readonly code: LLMErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(classification: ErrorClassification, statusCode?: number) {
    super(classification.message);
    this.name = 'LLMError';
    this.code = classification.code;
    this.retryable = classification.retryable;
    this.retryAfterMs = classification.retryAfterMs;
    this.statusCode = statusCode;
    this.cause = classification.cause;
  }
}

/** HTTP 状态码 → 错误码映射。 */
export function classifyHttpStatus(status: number): LLMErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 400) return 'invalid_request';
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status === 413) return 'context_length_exceeded';
  if (status >= 500 && status < 600) return 'server_error';
  return 'unknown';
}

/** 根据错误码判断是否可重试。 */
export function isRetryableCode(code: LLMErrorCode): boolean {
  return (
    code === 'rate_limit' ||
    code === 'server_error' ||
    code === 'timeout' ||
    code === 'network'
  );
}

/** 检测是否为国内厂商的内容安全错误。 */
export function isContentFilterError(error: unknown): boolean {
  const msg = extractErrorMessage(error)?.toLowerCase() ?? '';
  return CN_CONTENT_FILTER_KEYWORDS.some((kw) => msg.includes(kw));
}

/** 检测是否为国内厂商的合规错误。 */
export function isComplianceError(error: unknown): boolean {
  const msg = extractErrorMessage(error)?.toLowerCase() ?? '';
  return CN_COMPLIANCE_KEYWORDS.some((kw) => msg.includes(kw));
}

/** 从任意错误中提取分类。 */
export function classifyError(error: unknown): ErrorClassification {
  if (!error) {
    return { code: 'unknown', retryable: false, message: 'Unknown error' };
  }

  // 已经是 LLMError
  if (error instanceof LLMError) {
    return {
      code: error.code,
      retryable: error.retryable,
      message: error.message,
      cause: error.cause,
      retryAfterMs: error.retryAfterMs,
    };
  }

  // AbortError
  if (isAbortError(error)) {
    return { code: 'aborted', retryable: false, message: 'Request aborted' };
  }

  // TypeError (fetch 失败)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return { code: 'network', retryable: true, message: error.message, cause: error };
  }

  // 带 statusCode / status 的错误
  const statusCode = extractStatusCode(error);
  if (statusCode !== undefined) {
    const code = classifyHttpStatus(statusCode);
    const retryable = isRetryableCode(code);
    const message = extractErrorMessage(error) ?? `HTTP ${statusCode}`;
    const retryAfterMs = extractRetryAfterFromHeaders(error);
    return { code, retryable, message, cause: error, retryAfterMs };
  }

  // 字符串错误
  if (typeof error === 'string') {
    const lower = error.toLowerCase();
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return { code: 'timeout', retryable: true, message: error, cause: error };
    }
    if (lower.includes('network') || lower.includes('econnreset') || lower.includes('enotfound')) {
      return { code: 'network', retryable: true, message: error, cause: error };
    }
    if (lower.includes('abort')) {
      return { code: 'aborted', retryable: false, message: error, cause: error };
    }
    if (lower.includes('context length') || lower.includes('too long')) {
      return { code: 'context_length_exceeded', retryable: false, message: error, cause: error };
    }
    if (lower.includes('quota')) {
      return { code: 'quota_exceeded', retryable: false, message: error, cause: error };
    }
    // 国内内容安全检测
    if (CN_CONTENT_FILTER_KEYWORDS.some((kw) => lower.includes(kw))) {
      return { code: 'sensitive_content', retryable: false, message: error, cause: error };
    }
    // 国内合规检测
    if (CN_COMPLIANCE_KEYWORDS.some((kw) => lower.includes(kw))) {
      return { code: 'compliance_violation', retryable: false, message: error, cause: error };
    }
    if (lower.includes('content filter') || lower.includes('content_filter')) {
      return { code: 'content_filter', retryable: false, message: error, cause: error };
    }
  }

  // Error 实例
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return { code: 'timeout', retryable: true, message: error.message, cause: error };
    }
    if (lower.includes('network') || lower.includes('econnreset') || lower.includes('enotfound')) {
      return { code: 'network', retryable: true, message: error.message, cause: error };
    }
  }

  const message = extractErrorMessage(error) ?? 'Unknown error';
  return { code: 'unknown', retryable: false, message, cause: error };
}

/** 将任意错误包装为 LLMError。 */
export function toLLMError(error: unknown): LLMError {
  const classification = classifyError(error);
  const statusCode = extractStatusCode(error);
  return new LLMError(classification, statusCode);
}

/** 从 Provider 错误响应体解析分类。 */
export function classifyProviderError(
  body: unknown,
  statusCode: number,
): ErrorClassification {
  const code = classifyHttpStatus(statusCode);
  const retryable = isRetryableCode(code);
  const message = extractProviderErrorMessage(body) ?? `HTTP ${statusCode}`;
  const retryAfterMs = extractRetryAfterFromBody(body);
  return { code, retryable, message, cause: body, retryAfterMs };
}

/** 提取 Provider 错误响应中的 message 字段。 */
export function extractProviderErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as {
    error?: { message?: string; type?: string };
    message?: string;
    detail?: string;
  };
  if (b.error?.message) return b.error.message;
  if (b.message) return b.message;
  if (b.detail) return b.detail;
  return undefined;
}

// ====== 内部辅助 ======

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError';
  }
  return false;
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as { statusCode?: number; status?: number; code?: string | number };
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (typeof e.status === 'number') return e.status;
  return undefined;
}

function extractErrorMessage(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const e = error as { message?: string };
    if (typeof e.message === 'string') return e.message;
  }
  return undefined;
}

function extractRetryAfterFromHeaders(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as { headers?: { get?: (k: string) => string | null } };
  const headers = e.headers;
  if (headers && typeof headers.get === 'function') {
    const raw = headers.get('retry-after');
    if (raw) {
      const asNum = parseInt(raw, 10);
      if (!isNaN(asNum)) return asNum * 1000;
    }
  }
  return undefined;
}

function extractRetryAfterFromBody(body: unknown): number | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as { retry_after?: number; retryAfter?: number };
  if (typeof b.retry_after === 'number') return b.retry_after * 1000;
  if (typeof b.retryAfter === 'number') return b.retryAfter * 1000;
  return undefined;
}

/** 记录错误到日志。 */
export function logLLMError(error: unknown, context?: string): void {
  const classification = classifyError(error);
  const ctx = context ? `[${context}]` : '';
  if (classification.retryable) {
    logger.warn(`[LLM:Error]${ctx} ${classification.code}: ${classification.message}`);
  } else {
    logger.error(`[LLM:Error]${ctx} ${classification.code}: ${classification.message}`);
  }
}
