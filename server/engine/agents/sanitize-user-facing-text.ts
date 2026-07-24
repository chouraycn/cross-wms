/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/sanitize-user-facing-text.ts
 *
 * Converts raw provider/transport errors into concise user-facing copy.
 * Simplified for cross-wms: inlines normalization helpers; omits plugin-dependent
 * stripping (tool call XML, inbound metadata, internal runtime context).
 */

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  return "";
}

/** Format the billing failure copy with optional provider/model context. */
export function formatBillingErrorMessage(
  provider?: string,
  model?: string,
  authMode?: string,
): string {
  const providerName = provider?.trim();
  const modelName = model?.trim();
  const providerLabel =
    providerName && modelName ? `${providerName} (${modelName})` : providerName || undefined;

  const isSubscriptionAuth = authMode === "oauth" || authMode === "token";
  if (isSubscriptionAuth) {
    if (providerLabel) {
      return `⚠️ ${providerLabel} returned a billing error — check your account for subscription or usage limits, then try again.`;
    }
    return "⚠️ API provider returned a billing error — check your account for subscription or usage limits, then try again.";
  }

  if (providerLabel) {
    return `⚠️ ${providerLabel} returned a billing error — your API key has run out of credits or has an insufficient balance. Check your ${providerName} billing dashboard and top up or switch to a different API key.`;
  }
  return "⚠️ API provider returned a billing error — your API key has run out of credits or has an insufficient balance. Check your provider's billing dashboard and top up or switch to a different API key.";
}

export const BILLING_ERROR_USER_MESSAGE = formatBillingErrorMessage();

const RATE_LIMIT_ERROR_USER_MESSAGE = "⚠️ API rate limit reached. Please try again later.";
const MODEL_CAPACITY_ERROR_USER_MESSAGE =
  "⚠️ Selected model is at capacity. Try a different model, or wait and retry.";
const OVERLOADED_ERROR_USER_MESSAGE =
  "The AI service is temporarily overloaded. Please try again in a moment.";

const ERROR_PREFIX_RE =
  /^(?:error|(?:[a-z][\w-]*\s+)?api\s*error|openai\s*error|anthropic\s*error|gateway\s*error|codex\s*error|request failed|failed|exception)(?:\s+\d{3})?[:\s-]+/i;

const RATE_LIMIT_SPECIFIC_HINT_RE =
  /\bmin(ute)?s?\b|\bhours?\b|\bseconds?\b|\btry again in\b|\breset\b|\bplan\b|\bquota\b/i;
const MODEL_CAPACITY_ERROR_RE = /\b(?:selected\s+)?model\s+(?:is\s+)?at capacity\b/i;

function isRateLimitErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("rate_limit") ||
    lower.includes("429")
  );
}

function isOverloadedErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return lower.includes("overloaded") || lower.includes("capacity");
}

function isBillingErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("billing") ||
    lower.includes("insufficient") ||
    lower.includes("quota exceeded") ||
    lower.includes("balance") ||
    (lower.includes("402") && lower.includes("payment"))
  );
}

function isTimeoutErrorMessage(raw: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return lower.includes("timeout") || lower.includes("timed out");
}

function isCloudflareOrHtmlErrorPage(raw: string): boolean {
  const trimmed = raw.trim();
  if (/^(?:<!doctype\s+html\b|<html\b)/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("{") && trimmed.length > 200) {
    return true;
  }
  return false;
}

const HTTP_ERROR_HINTS = [
  "error",
  "bad request",
  "not found",
  "unauthorized",
  "forbidden",
  "internal server",
  "service unavailable",
  "gateway",
  "rate limit",
  "overloaded",
  "timeout",
  "timed out",
  "invalid",
  "too many requests",
  "permission",
];

function extractLeadingHttpStatus(raw: string): { code: number; rest: string } | null {
  const match = raw.match(/^(\d{3})\s+/);
  if (match) {
    const code = Number.parseInt(match[1], 10);
    return { code, rest: raw.slice(match[0].length) };
  }
  return null;
}

export function formatRateLimitOrOverloadedErrorCopy(raw: string): string | undefined {
  if (isRateLimitErrorMessage(raw)) {
    const withoutPrefix = raw.replace(ERROR_PREFIX_RE, "").trim();
    const status = extractLeadingHttpStatus(withoutPrefix);
    const candidate = status?.rest ?? withoutPrefix;
    if (
      candidate &&
      RATE_LIMIT_SPECIFIC_HINT_RE.test(candidate) &&
      !isCloudflareOrHtmlErrorPage(candidate) &&
      candidate.length <= 300 &&
      !candidate.startsWith("{")
    ) {
      return `⚠️ ${candidate.trim()}`;
    }
    return RATE_LIMIT_ERROR_USER_MESSAGE;
  }
  if (MODEL_CAPACITY_ERROR_RE.test(raw)) {
    return MODEL_CAPACITY_ERROR_USER_MESSAGE;
  }
  if (isOverloadedErrorMessage(raw)) {
    return OVERLOADED_ERROR_USER_MESSAGE;
  }
  return undefined;
}

export function formatTransportErrorCopy(raw: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  if (isCloudflareOrHtmlErrorPage(raw)) {
    return undefined;
  }
  const lower = normalizeLowercaseStringOrEmpty(raw);

  if (
    /\beconnrefused\b/i.test(raw) ||
    lower.includes("connection refused") ||
    lower.includes("actively refused")
  ) {
    return "LLM request failed: connection refused by the provider endpoint.";
  }
  if (
    /\beconnreset\b|\beconnaborted\b|\benetreset\b|\bepipe\b/i.test(raw) ||
    lower.includes("socket hang up") ||
    lower.includes("connection reset") ||
    lower.includes("connection aborted")
  ) {
    return "LLM request failed: network connection was interrupted.";
  }
  if (
    /\benotfound\b|\beai_again\b/i.test(raw) ||
    lower.includes("getaddrinfo") ||
    lower.includes("no such host") ||
    lower.includes("dns")
  ) {
    return "LLM request failed: DNS lookup for the provider endpoint failed.";
  }
  if (
    /\benetunreach\b|\behostunreach\b|\behostdown\b/i.test(raw) ||
    lower.includes("network is unreachable") ||
    lower.includes("host is unreachable")
  ) {
    return "LLM request failed: the provider endpoint is unreachable from this host.";
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("connection error") ||
    lower.includes("network request failed")
  ) {
    return "LLM request failed: network connection error.";
  }
  return undefined;
}

export function formatDiskSpaceErrorCopy(raw: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  const lower = normalizeLowercaseStringOrEmpty(raw);
  if (
    /\benospc\b/i.test(raw) ||
    lower.includes("no space left on device") ||
    lower.includes("disk full")
  ) {
    return "Could not write local session data because the disk is full. Free some disk space and try again.";
  }
  return undefined;
}

export function isInvalidStreamingEventOrderError(raw: string): boolean {
  if (!raw) {
    return false;
  }
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("unexpected event order") &&
    lower.includes("message_start") &&
    lower.includes("message_stop")
  );
}

export function isStreamingJsonParseError(raw: string): boolean {
  if (!raw) {
    return false;
  }
  const trimmed = raw.trim();
  return trimmed === "Malformed streaming fragment";
}

function looksLikeGenericContextOverflowError(raw: string): boolean {
  if (!raw) {
    return false;
  }
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("request_too_large") ||
    lower.includes("request exceeds the maximum size") ||
    lower.includes("context length exceeded") ||
    lower.includes("maximum context length") ||
    lower.includes("prompt is too long") ||
    lower.includes("prompt too long") ||
    lower.includes("exceeds model context window") ||
    lower.includes("model token limit") ||
    lower.includes("context overflow:") ||
    lower.includes("exceed context limit") ||
    lower.includes("context_window_exceeded") ||
    raw.includes("上下文过长") ||
    raw.includes("上下文超出") ||
    raw.includes("超出最大上下文")
  );
}

export function isLikelyHttpErrorText(raw: string): boolean {
  if (isCloudflareOrHtmlErrorPage(raw)) {
    return true;
  }
  const status = extractLeadingHttpStatus(raw);
  if (!status || status.code < 400) {
    return false;
  }
  const message = normalizeLowercaseStringOrEmpty(status.rest);
  return HTTP_ERROR_HINTS.some((hint) => message.includes(hint));
}

export function isRawApiErrorPayload(raw?: string): boolean {
  if (!raw) {
    return false;
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null && ("error" in parsed || "code" in parsed);
  } catch {
    return false;
  }
}

export function getApiErrorPayloadFingerprint(raw?: string): string | null {
  if (!raw || !isRawApiErrorPayload(raw)) {
    return null;
  }
  try {
    return JSON.stringify(JSON.parse(raw.trim()));
  } catch {
    return null;
  }
}

function collapseConsecutiveDuplicateBlocks(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }
  const blocks = trimmed.split(/\n{2,}/);
  if (blocks.length < 2) {
    return text;
  }
  const normalizeBlock = (value: string) => value.trim().replace(/\s+/g, " ");
  const result: string[] = [];
  let lastNormalized: string | null = null;
  for (const block of blocks) {
    const normalized = normalizeBlock(block);
    if (lastNormalized && normalized === lastNormalized) {
      continue;
    }
    result.push(block.trim());
    lastNormalized = normalized;
  }
  if (result.length === blocks.length) {
    return text;
  }
  return result.join("\n\n");
}

export function sanitizeUserFacingText(text: unknown, opts?: { errorContext?: boolean }): string {
  if (text === null || text === undefined) {
    return "";
  }
  let raw: string;
  if (typeof text === "string") {
    raw = text;
  } else if (typeof text === "object" && text !== null && "text" in text) {
    const textProp = (text as { text?: unknown }).text;
    raw = typeof textProp === "string" ? textProp : String(text);
  } else {
    raw = String(text);
  }

  if (!raw) {
    return "";
  }

  const errorContext = opts?.errorContext ?? false;

  // Simplified: skip plugin-dependent stripping (tool call XML, metadata, etc.)
  const processed = raw.trim();
  if (!processed) {
    return "";
  }

  if (errorContext) {
    const diskSpaceCopy = formatDiskSpaceErrorCopy(processed);
    if (diskSpaceCopy) {
      return diskSpaceCopy;
    }

    if (/incorrect role information|roles must alternate/i.test(processed)) {
      return "Message ordering conflict - please try again. If this persists, use /new to start a fresh session.";
    }

    if (looksLikeGenericContextOverflowError(processed)) {
      return "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session, or use a larger-context model.";
    }

    if (isBillingErrorMessage(processed)) {
      return BILLING_ERROR_USER_MESSAGE;
    }
    if (isInvalidStreamingEventOrderError(processed)) {
      return "LLM request failed: provider returned an invalid streaming response. Please try again.";
    }
    if (isRawApiErrorPayload(processed) || isLikelyHttpErrorText(processed)) {
      return processed;
    }
    if (isStreamingJsonParseError(processed)) {
      return "LLM streaming response contained a malformed fragment. Please try again.";
    }
    if (ERROR_PREFIX_RE.test(processed)) {
      const rateLimitCopy = formatRateLimitOrOverloadedErrorCopy(processed);
      if (rateLimitCopy) {
        return rateLimitCopy;
      }
      const transportCopy = formatTransportErrorCopy(processed);
      if (transportCopy) {
        return transportCopy;
      }
      if (isTimeoutErrorMessage(processed)) {
        return "LLM request timed out.";
      }
      return processed;
    }
  }

  const withoutLeadingEmptyLines = processed.replace(/^(?:[ \t]*\r?\n)+/, "");
  return collapseConsecutiveDuplicateBlocks(withoutLeadingEmptyLines);
}
