// Simplified media-generation runtime helpers.
//
// 移植自 openclaw/src/media-generation/runtime-shared.ts。
// 原始实现依赖大量未移植的内部模块（agents/auth-profiles、config/model-input、
// secrets/provider-env-vars、@openclaw/normalization-core、packages/media-generation-core 等）。
// 此文件为简化自包含版本，保留以下纯工具函数：
//   - 超时归一化 (resolveMediaProviderDefaultTimeoutMs / resolveMediaProviderRequestTimeoutMs)
//   - 宽高比推导与匹配 (deriveAspectRatioFromSize / resolveClosestAspectRatio)
//   - 尺寸匹配 (resolveClosestSize)
//   - 分辨率匹配 (resolveClosestResolution)
//   - 时长归一化 (normalizeDurationToClosestMax)
//   - 失败摘要与错误聚合 (recordCapabilityCandidateFailure / throwCapabilityGenerationFailure)
//   - 归一化元数据构建 (buildMediaGenerationNormalizationMetadata)
//   - 未配置提示 (buildNoCapabilityModelConfiguredMessage)
//
// 完整的 provider/model 自动回退与 auth-profile 集成见 openclaw 源码。

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type ParsedProviderModelRef = {
  provider: string;
  model: string;
};

/** Records one provider/model failure in the common fallback-attempt shape. */
export type FallbackAttempt = {
  provider: string;
  model: string;
  error: string;
  reason?: string;
  status?: number;
  code?: string;
};

// ---------------------------------------------------------------------------
// 内联依赖（替代 @openclaw/normalization-core）
// ---------------------------------------------------------------------------

/** Node.js 定时器安全上限（略低于 2^31-1 以留余量）。 */
export const MAX_TIMER_TIMEOUT_MS = 2_147_000_000;

/** 将值强制转换为有限数，无法转换时返回 undefined。 */
function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

/** 将毫秒值钳制到 Node.js 定时器安全范围 [1, MAX_TIMER_TIMEOUT_MS]。 */
export function clampTimerTimeoutMs(valueMs: unknown, minMs = 1): number | undefined {
  const value = asFiniteNumber(valueMs);
  if (value === undefined) {
    return undefined;
  }
  const min = Math.max(1, Math.floor(minMs));
  return Math.min(Math.max(Math.floor(value), min), MAX_TIMER_TIMEOUT_MS);
}

/** 规范化可选字符串，非字符串返回空串。 */
function normalizeOptionalString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

/** 格式化错误消息。 */
function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** 将错误转换为可序列化对象。 */
function toErrorObject(error: unknown, fallback: string): unknown {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { message: String(error) || fallback };
}

// ---------------------------------------------------------------------------
// 超时归一化
// ---------------------------------------------------------------------------

export function resolveMediaProviderDefaultTimeoutMs(
  timeoutMs: number | undefined,
): number | undefined {
  return typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? clampTimerTimeoutMs(timeoutMs)
    : undefined;
}

/** Resolves a request timeout, preferring per-request over provider defaults. */
export function resolveMediaProviderRequestTimeoutMs(params: {
  timeoutMs?: number;
  providerDefaultTimeoutMs?: number;
}): number | undefined {
  return (
    resolveMediaProviderDefaultTimeoutMs(params.timeoutMs) ??
    resolveMediaProviderDefaultTimeoutMs(params.providerDefaultTimeoutMs)
  );
}

// ---------------------------------------------------------------------------
// 尺寸 / 宽高比 / 分辨率 匹配
// ---------------------------------------------------------------------------

const IMAGE_RESOLUTION_ORDER = ["1K", "2K", "4K"] as const;

type ParsedAspectRatio = {
  width: number;
  height: number;
  value: number;
};

type ParsedSize = {
  width: number;
  height: number;
  aspectRatio: number;
  area: number;
};

function parsePositiveDimensionPair(
  raw: string | null | undefined,
  pattern: RegExp,
): { width: number; height: number } | null {
  const trimmed = normalizeOptionalString(raw);
  if (!trimmed) {
    return null;
  }
  const match = pattern.exec(trimmed);
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function parseAspectRatioValue(raw?: string | null): ParsedAspectRatio | null {
  const pair = parsePositiveDimensionPair(raw, /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!pair) {
    return null;
  }
  return {
    width: pair.width,
    height: pair.height,
    value: pair.width / pair.height,
  };
}

function parseSizeValue(raw?: string | null): ParsedSize | null {
  const pair = parsePositiveDimensionPair(raw, /^(\d+)\s*x\s*(\d+)$/i);
  if (!pair) {
    return null;
  }
  if (!Number.isSafeInteger(pair.width) || !Number.isSafeInteger(pair.height)) {
    return null;
  }
  return {
    width: pair.width,
    height: pair.height,
    aspectRatio: pair.width / pair.height,
    area: pair.width * pair.height,
  };
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

/** Derives a reduced aspect ratio string from a WIDTHxHEIGHT size. */
export function deriveAspectRatioFromSize(size?: string): string | undefined {
  const parsed = parseSizeValue(size);
  if (!parsed) {
    return undefined;
  }
  const divisor = greatestCommonDivisor(parsed.width, parsed.height);
  return `${parsed.width / divisor}:${parsed.height / divisor}`;
}

function normalizeSupportedValues<TValue extends string>(values?: readonly TValue[]): TValue[] {
  return (values ?? []).flatMap((entry) => {
    const normalized = normalizeOptionalString(entry);
    return normalized ? [entry] : [];
  });
}

function compareScores(
  next: { primary: number; secondary: number; tertiary: string },
  best: { primary: number; secondary: number; tertiary: string } | null,
): boolean {
  if (!best) {
    return true;
  }
  if (next.primary !== best.primary) {
    return next.primary < best.primary;
  }
  if (next.secondary !== best.secondary) {
    return next.secondary < best.secondary;
  }
  return next.tertiary.localeCompare(best.tertiary) < 0;
}

/** Chooses the closest supported aspect ratio for a request. */
export function resolveClosestAspectRatio(params: {
  requestedAspectRatio?: string;
  requestedSize?: string;
  supportedAspectRatios?: readonly string[];
}): string | undefined {
  const supported = normalizeSupportedValues(params.supportedAspectRatios);
  if (supported.length === 0) {
    return params.requestedAspectRatio ?? deriveAspectRatioFromSize(params.requestedSize);
  }
  if (params.requestedAspectRatio && supported.includes(params.requestedAspectRatio)) {
    return params.requestedAspectRatio;
  }
  const requested =
    parseAspectRatioValue(params.requestedAspectRatio) ??
    parseAspectRatioValue(deriveAspectRatioFromSize(params.requestedSize));
  if (!requested) {
    return undefined;
  }

  let bestValue: string | undefined;
  let bestScore: { primary: number; secondary: number; tertiary: string } | null = null;
  for (const candidate of supported) {
    const parsed = parseAspectRatioValue(candidate);
    if (!parsed) {
      continue;
    }
    const score = {
      primary: Math.abs(Math.log(parsed.value / requested.value)),
      secondary: Math.abs(parsed.width * requested.height - requested.width * parsed.height),
      tertiary: candidate,
    };
    if (compareScores(score, bestScore)) {
      bestValue = candidate;
      bestScore = score;
    }
  }
  return bestValue;
}

/** Chooses the closest supported size by aspect ratio and area. */
export function resolveClosestSize(params: {
  requestedSize?: string;
  requestedAspectRatio?: string;
  supportedSizes?: readonly string[];
}): string | undefined {
  const supported = normalizeSupportedValues(params.supportedSizes);
  if (supported.length === 0) {
    return params.requestedSize;
  }
  if (params.requestedSize && supported.includes(params.requestedSize)) {
    return params.requestedSize;
  }
  const requested = parseSizeValue(params.requestedSize);
  const requestedAspectRatio = parseAspectRatioValue(params.requestedAspectRatio);
  if (!requested && !requestedAspectRatio) {
    return undefined;
  }

  let bestValue: string | undefined;
  let bestScore: { primary: number; secondary: number; tertiary: string } | null = null;
  for (const candidate of supported) {
    const parsed = parseSizeValue(candidate);
    if (!parsed) {
      continue;
    }
    const score = {
      primary: Math.abs(
        Math.log(parsed.aspectRatio / (requested?.aspectRatio ?? requestedAspectRatio!.value)),
      ),
      secondary: requested ? Math.abs(Math.log(parsed.area / requested.area)) : parsed.area,
      tertiary: candidate,
    };
    if (compareScores(score, bestScore)) {
      bestValue = candidate;
      bestScore = score;
    }
  }
  return bestValue;
}

/** Chooses the closest supported resolution by numeric rank or custom order. */
export function resolveClosestResolution<TResolution extends string>(params: {
  requestedResolution?: TResolution;
  supportedResolutions?: readonly TResolution[];
  order?: readonly TResolution[];
}): TResolution | undefined {
  const supported = normalizeSupportedValues(params.supportedResolutions);
  if (supported.length === 0) {
    return params.requestedResolution;
  }
  if (params.requestedResolution && supported.includes(params.requestedResolution)) {
    return params.requestedResolution;
  }
  const requestedNumeric = parseResolutionRank(params.requestedResolution);
  if (requestedNumeric) {
    let bestValue: TResolution | undefined;
    let bestScore: { primary: number; secondary: number; tertiary: string } | null = null;
    for (const candidate of supported) {
      const candidateNumeric = parseResolutionRank(candidate);
      if (!candidateNumeric || candidateNumeric.unit !== requestedNumeric.unit) {
        continue;
      }
      const score = {
        primary: Math.abs(candidateNumeric.value - requestedNumeric.value),
        secondary: candidateNumeric.value < requestedNumeric.value ? 1 : 0,
        tertiary: candidate,
      };
      if (compareScores(score, bestScore)) {
        bestValue = candidate;
        bestScore = score;
      }
    }
    if (bestValue) {
      return bestValue;
    }
  }
  const order: readonly string[] = params.order ?? IMAGE_RESOLUTION_ORDER;
  const requestedIndex = params.requestedResolution
    ? order.indexOf(params.requestedResolution)
    : -1;
  if (requestedIndex < 0) {
    return undefined;
  }

  let bestValue: TResolution | undefined;
  let bestScore: { primary: number; secondary: number; tertiary: string } | null = null;
  for (const candidate of supported) {
    const candidateIndex = order.indexOf(candidate);
    if (candidateIndex < 0) {
      continue;
    }
    const score = {
      primary: Math.abs(candidateIndex - requestedIndex),
      secondary: candidateIndex,
      tertiary: candidate,
    };
    if (compareScores(score, bestScore)) {
      bestValue = candidate;
      bestScore = score;
    }
  }
  return bestValue;
}

function parseResolutionRank(
  resolution: string | undefined,
): { value: number; unit: "K" | "P" } | undefined {
  const match = resolution?.trim().match(/^(\d+(?:\.\d+)?)([kp])$/iu);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const unit = match[2]?.toUpperCase() === "K" ? "K" : "P";
  return {
    value: unit === "K" ? value * 1000 : value,
    unit,
  };
}

// ---------------------------------------------------------------------------
// 时长归一化
// ---------------------------------------------------------------------------

/** Rounds duration and clamps it to a provider maximum when supplied. */
export function normalizeDurationToClosestMax(
  durationSeconds?: number,
  maxDurationSeconds?: number,
) {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
    return undefined;
  }
  const rounded = Math.max(1, Math.round(durationSeconds));
  if (
    typeof maxDurationSeconds !== "number" ||
    !Number.isFinite(maxDurationSeconds) ||
    maxDurationSeconds <= 0
  ) {
    return rounded;
  }
  return Math.min(rounded, Math.max(1, Math.round(maxDurationSeconds)));
}

// ---------------------------------------------------------------------------
// 失败摘要与错误聚合
// ---------------------------------------------------------------------------

/** Records one provider/model failure in the common fallback-attempt shape. */
export function recordCapabilityCandidateFailure(params: {
  attempts: FallbackAttempt[];
  provider: string;
  model: string;
  error: unknown;
}): void {
  params.attempts.push({
    provider: params.provider,
    model: params.model,
    error: formatErrorMessage(params.error),
  });
}

/** Throws a summarized error after all provider/model candidates fail. */
export function throwCapabilityGenerationFailure(params: {
  capabilityLabel: string;
  attempts: FallbackAttempt[];
  lastError: unknown;
}): never {
  if (params.attempts.length <= 1 && params.lastError) {
    throw toErrorObject(params.lastError, "Non-Error thrown");
  }
  const summary = formatCapabilityFailureAttempts(params.attempts);
  throw new Error(
    `All ${params.capabilityLabel} models failed (${params.attempts.length}): ${summary}`,
    {
      cause: params.lastError instanceof Error ? params.lastError : undefined,
    },
  );
}

function formatCapabilityFailureAttempts(attempts: FallbackAttempt[]): string {
  if (attempts.length === 0) {
    return "unknown";
  }

  const abortedAttempts = attempts.filter(isAbortLikeFallbackAttempt);
  if (abortedAttempts.length === 0) {
    return attempts.map(formatCapabilityFailureAttempt).join(" | ");
  }
  if (abortedAttempts.length === attempts.length) {
    return `${abortedAttempts.length} fallback(s) aborted after the request was cancelled or timed out: ${abortedAttempts.map(formatCapabilityAttemptRef).join(", ")}`;
  }

  const primaryFailures = attempts.filter((attempt) => !isAbortLikeFallbackAttempt(attempt));
  return [
    primaryFailures.map(formatCapabilityFailureAttempt).join(" | "),
    `${abortedAttempts.length} fallback(s) aborted after the request was cancelled or timed out: ${abortedAttempts.map(formatCapabilityAttemptRef).join(", ")}`,
  ].join(" | ");
}

function formatCapabilityFailureAttempt(attempt: FallbackAttempt): string {
  return `${formatCapabilityAttemptRef(attempt)}: ${attempt.error}`;
}

function formatCapabilityAttemptRef(attempt: FallbackAttempt): string {
  return `${attempt.provider}/${attempt.model}`;
}

function isAbortLikeFallbackAttempt(attempt: FallbackAttempt): boolean {
  const message = attempt.error.trim().toLowerCase();
  return (
    message === "this operation was aborted" ||
    message === "operation was aborted" ||
    message.includes("operation was aborted") ||
    message.includes("request was aborted")
  );
}

// ---------------------------------------------------------------------------
// 归一化元数据
// ---------------------------------------------------------------------------

export type MediaNormalizationEntry = {
  requested?: string;
  applied?: string;
  derivedFrom?: string;
  supportedValues?: readonly string[];
};

export type MediaGenerationNormalizationMetadataInput = {
  size?: MediaNormalizationEntry;
  aspectRatio?: MediaNormalizationEntry;
  resolution?: MediaNormalizationEntry;
  durationSeconds?: MediaNormalizationEntry;
};

/** Builds user-visible metadata describing provider normalization decisions. */
export function buildMediaGenerationNormalizationMetadata(params: {
  normalization?: MediaGenerationNormalizationMetadataInput;
  requestedSizeForDerivedAspectRatio?: string;
  includeSupportedDurationSeconds?: boolean;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  const { normalization } = params;
  if (normalization?.size?.requested !== undefined && normalization.size.applied !== undefined) {
    metadata.requestedSize = normalization.size.requested;
    metadata.normalizedSize = normalization.size.applied;
  }
  if (normalization?.aspectRatio?.applied !== undefined) {
    if (normalization.aspectRatio.requested !== undefined) {
      metadata.requestedAspectRatio = normalization.aspectRatio.requested;
    }
    metadata.normalizedAspectRatio = normalization.aspectRatio.applied;
    if (
      normalization.aspectRatio.derivedFrom === "size" &&
      params.requestedSizeForDerivedAspectRatio
    ) {
      metadata.requestedSize = params.requestedSizeForDerivedAspectRatio;
      metadata.aspectRatioDerivedFromSize = deriveAspectRatioFromSize(
        params.requestedSizeForDerivedAspectRatio,
      );
    }
  }
  if (
    normalization?.resolution?.requested !== undefined &&
    normalization.resolution.applied !== undefined
  ) {
    metadata.requestedResolution = normalization.resolution.requested;
    metadata.normalizedResolution = normalization.resolution.applied;
  }
  if (
    normalization?.durationSeconds?.requested !== undefined &&
    normalization.durationSeconds.applied !== undefined
  ) {
    metadata.requestedDurationSeconds = normalization.durationSeconds.requested;
    metadata.normalizedDurationSeconds = normalization.durationSeconds.applied;
    if (
      params.includeSupportedDurationSeconds &&
      normalization.durationSeconds.supportedValues?.length
    ) {
      metadata.supportedDurationSeconds = normalization.durationSeconds.supportedValues;
    }
  }
  return metadata;
}

// ---------------------------------------------------------------------------
// 未配置提示
// ---------------------------------------------------------------------------

/** Formats setup guidance when no model is configured for a media capability. */
export function buildNoCapabilityModelConfiguredMessage(params: {
  capabilityLabel: string;
  modelConfigKey: string;
  providers: Array<{ id: string; defaultModel?: string | null }>;
  fallbackSampleRef?: string;
  getProviderEnvVars?: (providerId: string) => string[];
}): string {
  const getProviderEnvVars = params.getProviderEnvVars ?? (() => []);
  const sampleModel = params.providers.find(
    (provider) =>
      normalizeOptionalString(provider.id) && normalizeOptionalString(provider.defaultModel),
  );
  const sampleRef = sampleModel
    ? `${sampleModel.id}/${sampleModel.defaultModel}`
    : (params.fallbackSampleRef ?? "<provider>/<model>");
  const authHints = params.providers
    .flatMap((provider) => {
      const envVars = getProviderEnvVars(provider.id);
      if (envVars.length === 0) {
        return [];
      }
      return [`${provider.id}: ${envVars.join(" / ")}`];
    })
    .slice(0, 3);
  return [
    `No ${params.capabilityLabel} model configured. Set agents.defaults.${params.modelConfigKey}.primary to a provider/model like "${sampleRef}".`,
    authHints.length > 0
      ? `If you want a specific provider, also configure that provider's auth/API key first (${authHints.join("; ")}).`
      : "If you want a specific provider, also configure that provider's auth/API key first.",
  ].join(" ");
}
