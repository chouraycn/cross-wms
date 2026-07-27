export type EmbeddedContextFile = { path: string; content: string };

export function isModelNotFoundErrorMessage(raw: string): boolean {
  const msg = raw.trim();
  if (!msg) {
    return false;
  }
  if (/no endpoints found for/i.test(msg)) {
    return true;
  }
  if (/\brouter not found\b/i.test(msg)) {
    return true;
  }
  if (/unknown model/i.test(msg)) {
    return true;
  }
  if (/model(?:[_\-\s])?not(?:[_\-\s])?found/i.test(msg)) {
    return true;
  }
  if (/\b404\b/.test(msg) && /not(?:[_\-\s])?found/i.test(msg)) {
    return true;
  }
  if (/not_found_error/i.test(msg)) {
    return true;
  }
  if (/\bnot supported model\b/i.test(msg)) {
    return true;
  }
  if (/model:\s*[a-z0-9._/-]+/i.test(msg) && /not(?:[_\-\s])?found/i.test(msg)) {
    return true;
  }
  if (/models\/[^\s]+ is not found/i.test(msg)) {
    return true;
  }
  if (/model/i.test(msg) && /does not exist/i.test(msg)) {
    return true;
  }
  if (/selected model/i.test(msg) && /not(?:[_\-\s])?found/i.test(msg)) {
    return true;
  }
  if (/model/i.test(msg) && /deprecated/i.test(msg) && /(upgrade|transition) to/i.test(msg)) {
    return true;
  }
  if (/stealth model/i.test(msg) && /find it here/i.test(msg)) {
    return true;
  }
  if (/is not a valid model id/i.test(msg)) {
    return true;
  }
  if (/invalid model/i.test(msg) && !/invalid model reference/i.test(msg)) {
    return true;
  }
  return false;
}

export type FailoverReason =
  | "unknown"
  | "auth"
  | "auth_permanent"
  | "billing"
  | "rate_limit"
  | "overloaded"
  | "server_error"
  | "timeout"
  | "format"
  | "context_overflow"
  | "model_not_found"
  | "session_expired"
  | "content_filter"
  | "unsupported_feature"
  | "aborted";

export type AuthProfileFailureReason =
  | "auth"
  | "auth_permanent"
  | "billing"
  | "rate_limit"
  | "timeout"
  | "unknown";

export type AssistantMessage = {
  role: "assistant";
  content?: string;
  errorMessage?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: unknown }>;
};

export function isTimeoutErrorMessage(message: string): boolean {
  const patterns = [
    /timed? ?out/i,
    /timeout/i,
    /deadline ?exceeded/i,
    /request took too long/i,
  ];
  return patterns.some((re) => re.test(message));
}

export function formatAssistantErrorText(
  assistant: AssistantMessage,
  _options: {
    cfg?: unknown;
    sessionKey?: string;
    provider: string;
    model: string;
    authMode?: string;
  },
): string {
  return assistant.errorMessage?.trim() || assistant.content?.trim() || "Request failed.";
}

export function formatBillingErrorMessage(
  provider: string,
  model: string,
  _authMode?: string,
): string {
  return `Billing error for ${provider}/${model}. Please check your subscription or credits.`;
}
