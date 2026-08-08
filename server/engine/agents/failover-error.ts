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

const ABORT_TIMEOUT_RE = /request was aborted|request aborted/i;
const MAX_FAILOVER_CAUSE_DEPTH = 25;

export class FailoverError extends Error {
  readonly reason: FailoverReason;
  readonly provider?: string;
  readonly model?: string;
  readonly profileId?: string;
  readonly authMode?: string;
  readonly status?: number;
  readonly code?: string;
  readonly rawError?: string;
  readonly authProfileFailure?: { allInCooldown: boolean };
  readonly sessionId?: string;
  readonly lane?: string;
  readonly suspend?: boolean;

  constructor(
    message: string,
    params: {
      reason: FailoverReason;
      provider?: string;
      model?: string;
      profileId?: string;
      authMode?: string;
      status?: number;
      code?: string;
      rawError?: string;
      authProfileFailure?: { allInCooldown: boolean };
      sessionId?: string;
      lane?: string;
      cause?: any;
      suspend?: boolean;
    },
  ) {
    super(message, { cause: params.cause as Error | undefined });
    this.name = "FailoverError";
    this.reason = params.reason;
    this.provider = params.provider;
    this.model = params.model;
    this.profileId = params.profileId;
    this.authMode = params.authMode;
    this.status = params.status;
    this.code = params.code;
    this.rawError = params.rawError;
    this.authProfileFailure = params.authProfileFailure;
    this.sessionId = params.sessionId;
    this.lane = params.lane;
    this.suspend = params.suspend;
  }
}

export function isFailoverError(err: any): err is FailoverError {
  if (err instanceof FailoverError) {
    return true;
  }
  return Boolean(
    err &&
    typeof err === "object" &&
    (err as { name?: any }).name === "FailoverError" &&
    typeof (err as { reason?: any }).reason === "string",
  );
}

export function resolveFailoverStatus(reason: FailoverReason): number | undefined {
  switch (reason) {
    case "billing":
      return 402;
    case "server_error":
      return 500;
    case "rate_limit":
      return 429;
    case "overloaded":
      return 503;
    case "auth":
      return 401;
    case "auth_permanent":
      return 403;
    case "timeout":
      return 408;
    case "format":
      return 400;
    case "model_not_found":
      return 404;
    case "session_expired":
      return 410;
    default:
      return undefined;
  }
}

function findErrorProperty<T>(
  err: any,
  reader: (candidate: any) => T | undefined,
  seen: Set<object> = new Set(),
): T | undefined {
  const direct = reader(err);
  if (direct !== undefined) {
    return direct;
  }
  if (!err || typeof err !== "object") {
    return undefined;
  }
  if (seen.has(err)) {
    return undefined;
  }
  seen.add(err);
  const candidate = err as { error?: any; cause?: any };
  return (
    findErrorProperty(candidate.error, reader, seen) ??
    findErrorProperty(candidate.cause, reader, seen)
  );
}

function parseStrictNonNegativeInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) {
    return undefined;
  }
  return num;
}

function readDirectStatusCode(err: any): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const candidate =
    (err as { status?: any; statusCode?: any }).status ??
    (err as { statusCode?: any }).statusCode;
  if (typeof candidate === "number") {
    return candidate;
  }
  if (typeof candidate === "string") {
    return parseStrictNonNegativeInteger(candidate);
  }
  return undefined;
}

function getStatusCode(err: any): number | undefined {
  return findErrorProperty(err, readDirectStatusCode);
}

function readDirectErrorCode(err: any): string | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const directCode = (err as { code?: any }).code;
  if (typeof directCode === "string") {
    const trimmed = directCode.trim();
    return trimmed ? trimmed : undefined;
  }
  const detailCode = (err as { detail?: { code?: any } }).detail?.code;
  if (typeof detailCode === "string") {
    const trimmed = detailCode.trim();
    return trimmed ? trimmed : undefined;
  }
  const status = (err as { status?: any }).status;
  if (typeof status !== "string" || /^\d+$/.test(status)) {
    return undefined;
  }
  const trimmed = status.trim();
  return trimmed ? trimmed : undefined;
}

function getErrorCode(err: any): string | undefined {
  return findErrorProperty(err, readDirectErrorCode);
}

function readDirectErrorMessage(err: any): string | undefined {
  if (err instanceof Error) {
    return err.message || undefined;
  }
  if (typeof err === "string") {
    return err || undefined;
  }
  if (typeof err === "number" || typeof err === "boolean" || typeof err === "bigint") {
    return String(err);
  }
  if (typeof err === "symbol") {
    return err.description ?? undefined;
  }
  if (err && typeof err === "object") {
    const message = (err as { message?: any }).message;
    if (typeof message === "string") {
      return message || undefined;
    }
  }
  return undefined;
}

function getErrorMessage(err: any): string {
  return findErrorProperty(err, readDirectErrorMessage) ?? "";
}

function readErrorName(err: any): string | undefined {
  if (err instanceof Error) {
    return err.name;
  }
  if (err && typeof err === "object") {
    const name = (err as { name?: any }).name;
    if (typeof name === "string") {
      return name || undefined;
    }
  }
  return undefined;
}

const TIMEOUT_ERROR_MESSAGES = [
  /timed? ?out/i,
  /timeout/i,
  /deadline ?exceeded/i,
  /request took too long/i,
];

function isTimeoutErrorMessage(message: string): boolean {
  return TIMEOUT_ERROR_MESSAGES.some((re) => re.test(message));
}

function hasTimeoutHint(err: any): boolean {
  if (!err) {
    return false;
  }
  if (readErrorName(err) === "TimeoutError") {
    return true;
  }
  const message = getErrorMessage(err);
  return Boolean(message && isTimeoutErrorMessage(message));
}

export function isTimeoutError(err: any): boolean {
  if (hasTimeoutHint(err)) {
    return true;
  }
  if (!err || typeof err !== "object") {
    return false;
  }
  if (readErrorName(err) !== "AbortError") {
    return false;
  }
  const message = getErrorMessage(err);
  if (message && ABORT_TIMEOUT_RE.test(message)) {
    return true;
  }
  const cause = "cause" in err ? (err as { cause?: any }).cause : undefined;
  const reason = "reason" in err ? (err as { reason?: any }).reason : undefined;
  return hasTimeoutHint(cause) || hasTimeoutHint(reason);
}

function isSessionWriteLockAcquireError(err: any): boolean {
  return Boolean(
    err && typeof err === "object" && readErrorName(err) === "SessionWriteLockAcquireError",
  );
}

function hasSessionWriteLockContention(err: any, seen: Set<object> = new Set()): boolean {
  if (isSessionWriteLockAcquireError(err)) {
    return true;
  }
  if (!err || typeof err !== "object") {
    return false;
  }
  if (seen.has(err)) {
    return false;
  }
  seen.add(err);
  const candidate = err as { error?: any; cause?: any; reason?: any };
  return (
    hasSessionWriteLockContention(candidate.error, seen) ||
    hasSessionWriteLockContention(candidate.cause, seen) ||
    hasSessionWriteLockContention(candidate.reason, seen)
  );
}

function isEmbeddedAttemptSessionTakeover(err: any): boolean {
  return Boolean(
    err && typeof err === "object" && readErrorName(err) === "EmbeddedAttemptSessionTakeoverError",
  );
}

function hasEmbeddedAttemptSessionTakeover(err: any, seen: Set<object> = new Set()): boolean {
  if (isEmbeddedAttemptSessionTakeover(err)) {
    return true;
  }
  if (!err || typeof err !== "object") {
    return false;
  }
  if (seen.has(err)) {
    return false;
  }
  seen.add(err);
  const candidate = err as { error?: any; cause?: any; reason?: any };
  return (
    hasEmbeddedAttemptSessionTakeover(candidate.error, seen) ||
    hasEmbeddedAttemptSessionTakeover(candidate.cause, seen) ||
    hasEmbeddedAttemptSessionTakeover(candidate.reason, seen)
  );
}

export function isNonProviderRuntimeCoordinationError(err: any): boolean {
  if (!hasSessionWriteLockContention(err) && !hasEmbeddedAttemptSessionTakeover(err)) {
    return false;
  }
  if (isFailoverError(err)) {
    return false;
  }
  if (isEmbeddedAttemptSessionTakeover(err)) {
    return true;
  }
  return resolveFailoverReasonFromError(err) === null;
}

type FailoverClassification =
  | { kind: "reason"; reason: FailoverReason }
  | { kind: "context_overflow" };

function classifyFailoverSignal(signal: {
  status?: number;
  code?: string;
  errorType?: string;
  message?: string;
  provider?: string;
  details?: string[];
}): FailoverClassification | null {
  const status = signal.status;
  const code = signal.code?.toLowerCase() ?? "";
  const message = signal.message?.toLowerCase() ?? "";
  const errorType = signal.errorType?.toLowerCase() ?? "";

  if (status === 401 || code === "unauthorized" || errorType.includes("authentication")) {
    return { kind: "reason", reason: "auth" };
  }
  if (status === 403 || code === "forbidden" || code === "permission_denied") {
    return { kind: "reason", reason: "auth_permanent" };
  }
  if (status === 402 || code === "payment_required" || message.includes("billing") || message.includes("insufficient")) {
    return { kind: "reason", reason: "billing" };
  }
  if (status === 429 || code.includes("rate_limit") || message.includes("rate limit")) {
    return { kind: "reason", reason: "rate_limit" };
  }
  if (status === 503 || code.includes("overloaded") || message.includes("overloaded") || message.includes("unavailable")) {
    return { kind: "reason", reason: "overloaded" };
  }
  if (status && status >= 500) {
    return { kind: "reason", reason: "server_error" };
  }
  if (status === 408 || isTimeoutErrorMessage(message)) {
    return { kind: "reason", reason: "timeout" };
  }
  if (status === 400 || code.includes("invalid") || code.includes("bad_request")) {
    return { kind: "reason", reason: "format" };
  }
  if (status === 404 || code.includes("not_found") || message.includes("not found")) {
    return { kind: "reason", reason: "model_not_found" };
  }
  if (status === 410 || message.includes("session expired")) {
    return { kind: "reason", reason: "session_expired" };
  }
  if (code.includes("context_length") || message.includes("context length") || message.includes("maximum context")) {
    return { kind: "context_overflow" };
  }
  if (message.includes("content policy") || message.includes("content filter") || code.includes("content_filter")) {
    return { kind: "reason", reason: "content_filter" };
  }
  return null;
}

function normalizeErrorSignal(err: any, providerHint?: string): {
  status?: number;
  code?: string;
  errorType?: string;
  message?: string;
  provider?: string;
  details?: string[];
} {
  const message = getErrorMessage(err);
  return {
    status: getStatusCode(err),
    code: getErrorCode(err),
    errorType: undefined,
    message: message || undefined,
    provider: providerHint,
    details: undefined,
  };
}

function getNestedErrorCandidates(err: any): any[] {
  if (!err || typeof err !== "object") {
    return [];
  }
  const candidate = err as { error?: any; cause?: any };
  return [candidate.error, candidate.cause].filter(
    (value): value is unknown => value !== undefined && value !== err,
  );
}

function isFormatClassification(classification: FailoverClassification | null): boolean {
  return classification?.kind === "reason" && classification.reason === "format";
}

function resolveFailoverClassificationFromErrorInternal(
  err: any,
  seen: Set<object>,
  depth: number,
  providerHint?: string,
): FailoverClassification | null {
  if (depth > MAX_FAILOVER_CAUSE_DEPTH) {
    return null;
  }
  if (err && typeof err === "object") {
    if (seen.has(err)) {
      return null;
    }
    seen.add(err);
  }
  if (isFailoverError(err)) {
    return {
      kind: "reason",
      reason: err.reason,
    };
  }
  const signal = normalizeErrorSignal(err, providerHint);
  const hasSessionLock = hasSessionWriteLockContention(err);

  const classification = classifyFailoverSignal(signal);
  const nestedCandidates = getNestedErrorCandidates(err);

  if (!classification || classification.kind === "context_overflow") {
    for (const candidate of nestedCandidates) {
      const nestedClassification = resolveFailoverClassificationFromErrorInternal(
        candidate,
        seen,
        depth + 1,
        providerHint,
      );
      if (nestedClassification) {
        if (hasSessionLock) {
          return null;
        }
        return nestedClassification;
      }
    }
  }

  if (isFormatClassification(classification)) {
    for (const candidate of nestedCandidates) {
      const nestedClassification = resolveFailoverClassificationFromErrorInternal(
        candidate,
        seen,
        depth + 1,
        providerHint,
      );
      if (nestedClassification && !isFormatClassification(nestedClassification)) {
        return nestedClassification;
      }
    }
  }

  if (classification) {
    if (hasSessionLock) {
      return null;
    }
    return classification;
  }

  if (hasSessionLock) {
    return null;
  }

  if (isTimeoutError(err)) {
    return {
      kind: "reason",
      reason: "timeout",
    };
  }
  return null;
}

function resolveFailoverClassificationFromError(
  err: any,
  providerHint?: string,
): FailoverClassification | null {
  return resolveFailoverClassificationFromErrorInternal(err, new Set<object>(), 0, providerHint);
}

export function resolveFailoverReasonFromError(
  err: any,
  providerHint?: string,
): FailoverReason | null {
  const classification = resolveFailoverClassificationFromError(err, providerHint);
  return classification?.kind === "reason" ? classification.reason : null;
}

export function describeFailoverError(err: any): {
  message: string;
  rawError?: string;
  reason?: FailoverReason;
  status?: number;
  code?: string;
  provider?: string;
  model?: string;
  profileId?: string;
  authMode?: string;
  sessionId?: string;
  lane?: string;
} {
  if (isFailoverError(err)) {
    return {
      message: err.message,
      rawError: err.rawError,
      reason: err.reason,
      status: err.status,
      code: err.code,
      provider: err.provider,
      model: err.model,
      profileId: err.profileId,
      authMode: err.authMode,
      sessionId: err.sessionId,
      lane: err.lane,
    };
  }
  const signal = normalizeErrorSignal(err);
  const message = signal.message ?? String(err);
  return {
    message,
    reason: resolveFailoverReasonFromError(err) ?? undefined,
    status: signal.status,
    code: signal.code,
    provider: signal.provider,
  };
}

export function coerceToFailoverError(
  err: any,
  context?: {
    provider?: string;
    model?: string;
    profileId?: string;
    authMode?: string;
    sessionId?: string;
    lane?: string;
  },
): FailoverError | null {
  if (isFailoverError(err)) {
    if (context?.authMode && !err.authMode) {
      const message = typeof err.message === "string" ? err.message : String(err);
      return new FailoverError(message, {
        reason: err.reason,
        provider: err.provider,
        model: err.model,
        profileId: err.profileId,
        authMode: context.authMode,
        status: err.status,
        code: err.code,
        rawError: err.rawError,
        authProfileFailure: err.authProfileFailure,
        sessionId: err.sessionId,
        lane: err.lane,
        cause: err.cause,
        suspend: err.suspend,
      });
    }
    return err;
  }
  const reason = resolveFailoverReasonFromError(err, context?.provider);
  if (!reason) {
    return null;
  }

  const signal = normalizeErrorSignal(err);
  const message = signal.message ?? String(err);
  const status = signal.status ?? resolveFailoverStatus(reason);
  const code = signal.code;

  const shouldSuspend =
    Boolean(context?.sessionId) && (reason === "rate_limit" || reason === "billing");

  return new FailoverError(message, {
    reason,
    provider: context?.provider ?? signal.provider,
    model: context?.model,
    profileId: context?.profileId,
    authMode: context?.authMode,
    sessionId: context?.sessionId,
    lane: context?.lane,
    status,
    code,
    rawError: message,
    cause: err instanceof Error ? err : undefined,
    suspend: shouldSuspend,
  });
}
