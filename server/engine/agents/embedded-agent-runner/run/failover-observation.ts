import type { AuthProfileFailureReason, FailoverReason } from "../../embedded-agent-helpers.js";

type FailoverDecisionLoggerInput = {
  stage: "prompt" | "assistant";
  decision: "rotate_profile" | "fallback_model" | "surface_error";
  runId?: string;
  rawError?: string;
  failoverReason: FailoverReason | null;
  profileFailureReason?: AuthProfileFailureReason | null;
  provider: string;
  model: string;
  sourceProvider?: string;
  sourceModel?: string;
  profileId?: string;
  fallbackConfigured: boolean;
  timedOut?: boolean;
  aborted?: boolean;
  status?: number;
};

type FailoverDecisionLoggerBase = Omit<FailoverDecisionLoggerInput, "decision" | "status">;

export function normalizeFailoverDecisionObservationBase(
  base: FailoverDecisionLoggerBase,
): FailoverDecisionLoggerBase {
  return {
    ...base,
    failoverReason: base.failoverReason ?? (base.timedOut ? "timeout" : null),
    profileFailureReason: base.profileFailureReason ?? (base.timedOut ? "timeout" : null),
  };
}

function redactIdentifier(value: string, options?: { len?: number }): string {
  const len = options?.len ?? 8;
  if (value.length <= len) {
    return value;
  }
  return `${value.slice(0, len)}...`;
}

function sanitizeForConsole(value: string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.replace(/[^\x20-\x7E]/g, "").slice(0, 200);
}

type ProviderRuntimeFailureKind =
  | "auth"
  | "billing"
  | "rate_limit"
  | "overloaded"
  | "server_error"
  | "timeout"
  | "format"
  | "unknown";

function buildApiErrorObservationFields(rawError?: string): {
  rawErrorPreview?: string;
  providerRuntimeFailureKind?: ProviderRuntimeFailureKind;
} {
  if (!rawError) {
    return {};
  }
  const lower = rawError.toLowerCase();
  let kind: ProviderRuntimeFailureKind = "unknown";
  if (lower.includes("auth") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    kind = "auth";
  } else if (lower.includes("billing") || lower.includes("insufficient") || lower.includes("quota")) {
    kind = "billing";
  } else if (lower.includes("rate limit") || lower.includes("ratelimit")) {
    kind = "rate_limit";
  } else if (lower.includes("overload") || lower.includes("unavailable")) {
    kind = "overloaded";
  } else if (lower.includes("server error") || lower.includes("internal error")) {
    kind = "server_error";
  } else if (lower.includes("timeout") || lower.includes("timed out")) {
    kind = "timeout";
  } else if (lower.includes("format") || lower.includes("invalid")) {
    kind = "format";
  }
  return {
    rawErrorPreview: rawError.slice(0, 100),
    providerRuntimeFailureKind: kind,
  };
}

function shouldSuppressRawErrorConsoleSuffix(kind?: ProviderRuntimeFailureKind): boolean {
  return Boolean(kind && kind !== "unknown");
}

const log = {
  warn: (_message: string, _fields: Record<string, unknown>) => {},
};

export function createFailoverDecisionLogger(
  base: FailoverDecisionLoggerBase,
): (
  decision: FailoverDecisionLoggerInput["decision"],
  extra?: Pick<FailoverDecisionLoggerInput, "status">,
) => void {
  const normalizedBase = normalizeFailoverDecisionObservationBase(base);
  const safeProfileId = normalizedBase.profileId
    ? redactIdentifier(normalizedBase.profileId, { len: 12 })
    : undefined;
  const safeRunId = sanitizeForConsole(normalizedBase.runId) ?? "-";
  const safeProvider = sanitizeForConsole(normalizedBase.provider) ?? "-";
  const safeModel = sanitizeForConsole(normalizedBase.model) ?? "-";
  const safeSourceProvider = sanitizeForConsole(normalizedBase.sourceProvider) ?? safeProvider;
  const safeSourceModel = sanitizeForConsole(normalizedBase.sourceModel) ?? safeModel;
  const profileText = safeProfileId ?? "-";
  const reasonText = normalizedBase.failoverReason ?? "none";
  const sourceChanged = safeSourceProvider !== safeProvider || safeSourceModel !== safeModel;
  return (decision, extra) => {
    const observedError = buildApiErrorObservationFields(normalizedBase.rawError);
    const safeRawErrorPreview = sanitizeForConsole(observedError.rawErrorPreview);
    const rawErrorConsoleSuffix =
      safeRawErrorPreview &&
      !shouldSuppressRawErrorConsoleSuffix(observedError.providerRuntimeFailureKind)
        ? ` rawError=${safeRawErrorPreview}`
        : "";
    log.warn("embedded run failover decision", {
      event: "embedded_run_failover_decision",
      tags: ["error_handling", "failover", normalizedBase.stage, decision],
      runId: normalizedBase.runId,
      stage: normalizedBase.stage,
      decision,
      failoverReason: normalizedBase.failoverReason,
      profileFailureReason: normalizedBase.profileFailureReason,
      provider: normalizedBase.provider,
      model: normalizedBase.model,
      sourceProvider: normalizedBase.sourceProvider ?? normalizedBase.provider,
      sourceModel: normalizedBase.sourceModel ?? normalizedBase.model,
      profileId: safeProfileId,
      fallbackConfigured: normalizedBase.fallbackConfigured,
      timedOut: normalizedBase.timedOut,
      aborted: normalizedBase.aborted,
      status: extra?.status,
      ...observedError,
      consoleMessage:
        `embedded run failover decision: runId=${safeRunId} stage=${normalizedBase.stage} decision=${decision} ` +
        `reason=${reasonText} from=${safeSourceProvider}/${safeSourceModel}` +
        `${sourceChanged ? ` to=${safeProvider}/${safeModel}` : ""} profile=${profileText}${rawErrorConsoleSuffix}`,
    });
  };
}
