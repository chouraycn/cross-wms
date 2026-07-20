/**
 * Provider-owned error-pattern dispatch plus legacy fallback patterns.
 * Ported from openclaw/src/agents/embedded-agent-helpers/provider-error-patterns.ts
 */

type FailoverReason =
  | "rate_limit"
  | "overloaded"
  | "model_not_found"
  | "context_overflow"
  | "auth"
  | "server_error"
  | "timeout";

type ProviderErrorPattern = {
  test: RegExp;
  reason: FailoverReason;
};

const PROVIDER_CONTEXT_OVERFLOW_PATTERNS: readonly RegExp[] = [
  /\binput token count exceeds the maximum number of input tokens\b/i,
  /\binput is too long for this model\b/i,
  /\binput exceeds the maximum number of tokens\b/i,
  /\bollama error:\s*context length exceeded(?:,\s*too many tokens)?\b/i,
  /\btotal tokens?.*exceeds? (?:the )?(?:model(?:'s)? )?(?:max|maximum|limit)/i,
  /\b(?:request|prompt) \(\d[\d,]*\s*tokens?\) exceeds (?:the )?available context size\b/i,
  /\binput (?:is )?too long for (?:the )?model\b/i,
];

const PROVIDER_SPECIFIC_PATTERNS: readonly ProviderErrorPattern[] = [
  { test: /\bthrottlingexception\b/i, reason: "rate_limit" },
  { test: /\bconcurrency limit(?: has been)? reached\b/i, reason: "rate_limit" },
  { test: /\bworkers_ai\b.*\bquota limit exceeded\b/i, reason: "rate_limit" },
  { test: /\bmodelnotreadyexception\b/i, reason: "overloaded" },
  { test: /model(?:_is)?_deactivated|model has been deactivated/i, reason: "model_not_found" },
];

type ProviderSpecificErrorContext = {
  provider?: string;
  modelId?: string;
  errorMessage: string;
  status?: number;
  code?: string;
  errorType?: string;
};

function normalizeProviderSpecificErrorContext(
  input: string | ProviderSpecificErrorContext,
): ProviderSpecificErrorContext {
  return typeof input === "string" ? { errorMessage: input } : input;
}

const PROVIDER_CONTEXT_OVERFLOW_SIGNAL_RE =
  /\b(?:context|window|prompt|token|tokens|input|request|model)\b/i;
const PROVIDER_CONTEXT_OVERFLOW_ACTION_RE =
  /\b(?:too\s+(?:large|long|many)|exceed(?:s|ed|ing)?|overflow|limit|maximum|max)\b/i;

function looksLikeProviderContextOverflowCandidate(errorMessage: string): boolean {
  return (
    PROVIDER_CONTEXT_OVERFLOW_SIGNAL_RE.test(errorMessage) &&
    PROVIDER_CONTEXT_OVERFLOW_ACTION_RE.test(errorMessage)
  );
}

/** Check if an error message matches any provider-specific context overflow pattern. */
export function matchesProviderContextOverflow(errorMessage: string): boolean {
  if (!looksLikeProviderContextOverflowCandidate(errorMessage)) {
    return false;
  }
  return PROVIDER_CONTEXT_OVERFLOW_PATTERNS.some((pattern) => pattern.test(errorMessage));
}

/** Classify an error using provider plugin hooks (stub: returns null). */
export function classifyProviderPluginError(
  _input: string | ProviderSpecificErrorContext,
): FailoverReason | null {
  // Plugin runtime hooks not available in cross-wms
  return null;
}

/** Try to classify an error using provider-specific patterns. */
export function classifyProviderSpecificError(
  input: string | ProviderSpecificErrorContext,
  opts?: { includePluginHooks?: boolean },
): FailoverReason | null {
  const context = normalizeProviderSpecificErrorContext(input);
  if (opts?.includePluginHooks !== false) {
    const pluginReason = classifyProviderPluginError(context);
    if (pluginReason) {
      return pluginReason;
    }
  }
  for (const pattern of PROVIDER_SPECIFIC_PATTERNS) {
    if (pattern.test.test(context.errorMessage)) {
      return pattern.reason;
    }
  }
  return null;
}
