// 移植自 openclaw/src/config/redact-snapshot.ts
// 在诊断或 UI 暴露前对运行时配置快照进行脱敏。
//
// 降级说明：源文件依赖以下未引入的模块：
//   - @openclaw/net-policy/redact-sensitive-url（hasSensitiveUrlHintTag、isSensitiveUrlConfigPath、
//     redactSensitiveUrlLikeString）—— cross-wms 未引入该包，此处降级为 no-op：
//     hasSensitiveUrlHintTag 恒返回 false，isSensitiveUrlConfigPath 恒返回 false，
//     redactSensitiveUrlLikeString 原样返回输入值。这意味着基于 URL 的敏感字段不会被特殊脱敏，
//     但基于路径与 schema hint 的脱敏仍然生效。
//   - @openclaw/normalization-core/record-coerce 的 isRecord（别名 isObjectRecord）—— 内联等价实现。
//   - @openclaw/normalization-core/string-coerce 的 normalizeLowercaseStringOrEmpty —— 内联等价实现。
//   - ../logging/subsystem.js 的 createSubsystemLogger —— 内联 no-op logger。

import type { ConfigUiHints } from "../shared/config-ui-hints-types.js";
import {
  replaceSensitiveValuesInRaw,
  shouldFallbackToStructuredRawRedaction,
} from "./redact-snapshot.raw.js";
import { isSecretRefShape, redactSecretRefId } from "./redact-snapshot.secret-ref.js";
import { isSensitiveConfigPath } from "./sensitive-paths.js";
import type { ConfigFileSnapshot } from "./types/openclaw.js";

/** 内联降级实现：判断值是否为普通对象（非数组、非 null）。 */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 内联降级实现：将字符串转为小写，非字符串返回空串。 */
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

/** 内联降级 no-op subsystem logger。 */
const log = {
  warn(_message: string): void {
    // 降级：subsystem logger 未移植，静默忽略
  },
};

/** 降级实现：恒返回 false，不识别 URL hint tag。 */
function hasSensitiveUrlHintTag(_hint: unknown): boolean {
  return false;
}

/** 降级实现：恒返回 false，不识别敏感 URL 配置路径。 */
function isSensitiveUrlConfigPath(_path: string): boolean {
  return false;
}

/** 降级实现：原样返回输入值，不做 URL 脱敏。 */
function redactSensitiveUrlLikeString(value: string): string {
  return value;
}

const ENV_VAR_PLACEHOLDER_PATTERN = /^\$\{[^}]*\}$/;

function isSensitivePath(path: string): boolean {
  if (path.endsWith("[]")) {
    return isSensitiveConfigPath(path.slice(0, -2));
  }
  return isSensitiveConfigPath(path);
}

function isEnvVarPlaceholder(value: string): boolean {
  return ENV_VAR_PLACEHOLDER_PATTERN.test(value.trim());
}

function isWholeObjectSensitivePath(path: string): boolean {
  const lowered = normalizeLowercaseStringOrEmpty(path);
  return lowered.endsWith("serviceaccount") || lowered.endsWith("serviceaccountref");
}

function isSensitiveUrlPath(path: string): boolean {
  return isSensitiveUrlConfigPath(path);
}

function hasSensitiveUrlHintPath(hints: ConfigUiHints | undefined, paths: string[]): boolean {
  if (!hints) {
    return false;
  }
  return paths.some((path) => hasSensitiveUrlHintTag(hints[path]));
}

function collectSensitiveStrings(value: unknown, values: string[]): void {
  if (typeof value === "string") {
    if (!isEnvVarPlaceholder(value)) {
      values.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSensitiveStrings(item, values);
    }
    return;
  }
  if (isObjectRecord(value)) {
    const obj = value;
    // SecretRef objects include structural fields like source/provider that are
    // not secret material and may appear widely in config text.
    if (isSecretRefShape(obj)) {
      if (!isEnvVarPlaceholder(obj.id)) {
        values.push(obj.id);
      }
      return;
    }
    for (const item of Object.values(obj)) {
      collectSensitiveStrings(item, values);
    }
  }
}

function isExplicitlyNonSensitivePath(hints: ConfigUiHints | undefined, paths: string[]): boolean {
  if (!hints) {
    return false;
  }
  return paths.some((path) => hints[path]?.sensitive === false);
}

/**
 * Sentinel value used to replace sensitive config fields in gateway responses.
 * Write-side handlers (config.set, config.apply, config.patch) detect this
 * sentinel and restore the original value from the on-disk config, so a
 * round-trip through the Web UI does not corrupt credentials.
 */
export const REDACTED_SENTINEL = "__OPENCLAW_REDACTED__";

function isSecretRefWithProvider(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { source: string; provider: string; id: string } {
  return isSecretRefShape(value) && typeof value.provider === "string";
}

// ConfigUiHints' keys look like this:
// - path.subpath.key (nested objects)
// - path.subpath[].key (object in array in object)
// - path.*.key (object in record in object)
// records are handled by the lookup, but arrays need two entries in
// the Set, as their first lookup is done before the code knows it's
// an array.
function buildRedactionLookup(hints: ConfigUiHints): Set<string> {
  const result = new Set<string>();

  for (const [path, hint] of Object.entries(hints)) {
    if (!hint.sensitive) {
      continue;
    }

    const parts = path.split(".");
    let joinedPath = parts.shift() ?? "";
    result.add(joinedPath);
    if (joinedPath.endsWith("[]")) {
      result.add(joinedPath.slice(0, -2));
    }

    for (const part of parts) {
      if (part.endsWith("[]")) {
        result.add(`${joinedPath}.${part.slice(0, -2)}`);
      }
      joinedPath = `${joinedPath}.${part}`;
      result.add(joinedPath);
    }
  }
  if (result.size !== 0) {
    result.add("");
  }
  return result;
}

/**
 * Deep-walk an object and replace string values at sensitive paths
 * with the redaction sentinel.
 */
function redactObject<T>(obj: T, hints?: ConfigUiHints): T;
function redactObject(obj: unknown, hints?: ConfigUiHints): unknown {
  if (hints) {
    const lookup = buildRedactionLookup(hints);
    return lookup.has("")
      ? redactObjectWithLookup(obj, lookup, "", [], hints)
      : redactObjectGuessing(obj, "", [], hints);
  }
  return redactObjectGuessing(obj, "", []);
}

/**
 * Collect all sensitive string values from a config object.
 * Used for text-based redaction of the raw JSON5 source.
 */
function collectSensitiveValues(obj: unknown, hints?: ConfigUiHints): string[] {
  const result: string[] = [];
  if (hints) {
    const lookup = buildRedactionLookup(hints);
    if (lookup.has("")) {
      redactObjectWithLookup(obj, lookup, "", result, hints);
    } else {
      redactObjectGuessing(obj, "", result, hints);
    }
  } else {
    redactObjectGuessing(obj, "", result);
  }
  return result;
}

/**
 * Worker for redactObject() and collectSensitiveValues().
 * Used when there are ConfigUiHints available.
 */
function redactObjectWithLookup(
  obj: unknown,
  lookup: Set<string>,
  prefix: string,
  values: string[],
  hints: ConfigUiHints,
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    const path = `${prefix}[]`;
    if (!lookup.has(path)) {
      // Keep behavior symmetric with object fallback: if hints miss the path,
      // still run pattern-based guessing for non-extension arrays.
      return redactObjectGuessing(obj, prefix, values, hints);
    }
    return obj.map((item) => {
      if (typeof item === "string" && !isEnvVarPlaceholder(item)) {
        values.push(item);
        return REDACTED_SENTINEL;
      }
      return redactObjectWithLookup(item, lookup, path, values, hints);
    });
  }

  if (isObjectRecord(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const wildcardPath = prefix ? `${prefix}.*` : "*";
      let matched = false;
      for (const candidate of [path, wildcardPath]) {
        result[key] = value;
        if (lookup.has(candidate)) {
          matched = true;
          if (typeof value === "string" && !isEnvVarPlaceholder(value)) {
            result[key] = REDACTED_SENTINEL;
            values.push(value);
          } else if (typeof value === "object" && value !== null) {
            if (hints[candidate]?.sensitive === true && !Array.isArray(value)) {
              const objectValue = toObjectRecord(value);
              if (isSecretRefShape(objectValue)) {
                result[key] = redactSecretRefId({
                  value: objectValue,
                  values,
                  redactedSentinel: REDACTED_SENTINEL,
                  isEnvVarPlaceholder,
                });
              } else {
                collectSensitiveStrings(objectValue, values);
                result[key] = REDACTED_SENTINEL;
              }
            } else {
              result[key] = redactObjectWithLookup(value, lookup, candidate, values, hints);
            }
          } else if (
            hints[candidate]?.sensitive === true &&
            value !== undefined &&
            value !== null
          ) {
            // Keep primitives at explicitly-sensitive paths fully redacted.
            result[key] = REDACTED_SENTINEL;
          } else if (
            typeof value === "string" &&
            (hasSensitiveUrlHintPath(hints, [candidate, path, wildcardPath]) ||
              isSensitiveUrlPath(path))
          ) {
            const scrubbed = redactSensitiveUrlLikeString(value);
            if (scrubbed !== value) {
              values.push(value);
              result[key] = REDACTED_SENTINEL;
            } else {
              result[key] = value;
            }
          }
          break;
        }
      }
      if (!matched) {
        // Fall back to pattern-based guessing for paths not covered by schema
        // hints. This catches dynamic keys inside catchall objects (for example
        // env.GROQ_API_KEY) and extension/plugin config alike.
        const markedNonSensitive = isExplicitlyNonSensitivePath(hints, [path, wildcardPath]);
        if (
          typeof value === "string" &&
          !markedNonSensitive &&
          isSensitivePath(path) &&
          !isEnvVarPlaceholder(value)
        ) {
          result[key] = REDACTED_SENTINEL;
          values.push(value);
        } else if (
          typeof value === "string" &&
          (hasSensitiveUrlHintPath(hints, [path, wildcardPath]) || isSensitiveUrlPath(path))
        ) {
          const scrubbed = redactSensitiveUrlLikeString(value);
          if (scrubbed !== value) {
            values.push(value);
            result[key] = REDACTED_SENTINEL;
          } else {
            result[key] = value;
          }
        } else if (typeof value === "object" && value !== null) {
          result[key] = redactObjectGuessing(value, path, values, hints);
        }
      }
    }
    return result;
  }

  return obj;
}

/**
 * Worker for redactObject() and collectSensitiveValues().
 * Used when ConfigUiHints are NOT available.
 */
function redactObjectGuessing(
  obj: unknown,
  prefix: string,
  values: string[],
  hints?: ConfigUiHints,
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => {
      const path = `${prefix}[]`;
      if (
        !isExplicitlyNonSensitivePath(hints, [path]) &&
        isSensitivePath(path) &&
        typeof item === "string" &&
        !isEnvVarPlaceholder(item)
      ) {
        values.push(item);
        return REDACTED_SENTINEL;
      }
      return redactObjectGuessing(item, path, values, hints);
    });
  }

  if (isObjectRecord(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const dotPath = prefix ? `${prefix}.${key}` : key;
      const wildcardPath = prefix ? `${prefix}.*` : "*";
      if (
        !isExplicitlyNonSensitivePath(hints, [dotPath, wildcardPath]) &&
        isSensitivePath(dotPath) &&
        typeof value === "string" &&
        !isEnvVarPlaceholder(value)
      ) {
        result[key] = REDACTED_SENTINEL;
        values.push(value);
      } else if (
        !isExplicitlyNonSensitivePath(hints, [dotPath, wildcardPath]) &&
        isSensitivePath(dotPath) &&
        isWholeObjectSensitivePath(dotPath) &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        collectSensitiveStrings(value, values);
        result[key] = REDACTED_SENTINEL;
      } else if (
        typeof value === "string" &&
        (hasSensitiveUrlHintPath(hints, [dotPath, wildcardPath]) || isSensitiveUrlPath(dotPath))
      ) {
        const scrubbed = redactSensitiveUrlLikeString(value);
        if (scrubbed !== value) {
          values.push(value);
          result[key] = REDACTED_SENTINEL;
        } else {
          result[key] = value;
        }
      } else if (typeof value === "object" && value !== null) {
        result[key] = redactObjectGuessing(value, dotPath, values, hints);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}

/**
 * Replace known sensitive values in a raw JSON5 string with the sentinel.
 * Values are replaced longest-first to avoid partial matches.
 */
function redactRawText(raw: string, config: unknown, hints?: ConfigUiHints): string {
  const sensitiveValues = collectSensitiveValues(config, hints);
  return replaceSensitiveValuesInRaw({
    raw,
    sensitiveValues,
    redactedSentinel: REDACTED_SENTINEL,
  });
}

let suppressRestoreWarnings = false;

function withRestoreWarningsSuppressed<T>(fn: () => T): T {
  const prev = suppressRestoreWarnings;
  suppressRestoreWarnings = true;
  try {
    return fn();
  } finally {
    suppressRestoreWarnings = prev;
  }
}

/**
 * Redact sensitive fields from a plain config object (not a full snapshot).
 * Used by write endpoints (config.set, config.patch, config.apply) to avoid
 * leaking credentials in their responses.
 */
export function redactConfigObject<T>(value: T, uiHints?: ConfigUiHints): T {
  return redactObject(value, uiHints);
}

export function redactConfigSnapshot(
  snapshot: ConfigFileSnapshot,
  uiHints?: ConfigUiHints,
): ConfigFileSnapshot {
  if (!snapshot.valid) {
    // This is bad. We could try to redact the raw string using known key names,
    // but then we would not be able to restore them, and would trash the user's
    // credentials. Less than ideal---we should never delete important data.
    // On the other hand, we cannot hand out "raw" if we're not sure we have
    // properly redacted all sensitive data. Handing out a partially or, worse,
    // unredacted config string would be bad.
    // Therefore, the only safe route is to reject handling out broken configs.
    const redactedConfig = {} as ConfigFileSnapshot["config"];
    const redactedResolved = {} as ConfigFileSnapshot["resolved"];
    return {
      ...snapshot,
      sourceConfig: redactedResolved,
      runtimeConfig: redactedConfig,
      config: redactedConfig,
      raw: null,
      parsed: null,
      resolved: redactedResolved,
    };
  }
  // else: snapshot.config must be valid and populated, as that is what
  // readConfigFileSnapshot() does when it creates the snapshot.

  const redactedConfig = redactObject(snapshot.config, uiHints);
  const redactedParsed = snapshot.parsed ? redactObject(snapshot.parsed, uiHints) : snapshot.parsed;
  let redactedRaw = snapshot.raw ? redactRawText(snapshot.raw, snapshot.config, uiHints) : null;
  if (
    redactedRaw &&
    shouldFallbackToStructuredRawRedaction({
      redactedRaw,
      originalConfig: snapshot.parsed ?? snapshot.config,
      restoreParsed: (parsed) =>
        withRestoreWarningsSuppressed(() =>
          restoreRedactedValues(parsed, snapshot.config, uiHints),
        ),
    })
  ) {
    redactedRaw = null;
  }
  // Also redact the resolved config (contains values after ${ENV} substitution)
  const redactedResolved = redactConfigObject(snapshot.resolved, uiHints);
  const { pluginMetadataSnapshot: _pluginMetadataSnapshot, ...publicSnapshot } =
    snapshot as typeof snapshot & {
      pluginMetadataSnapshot?: unknown;
    };

  return {
    ...publicSnapshot,
    sourceConfig: redactedResolved,
    runtimeConfig: redactedConfig,
    config: redactedConfig,
    raw: redactedRaw,
    parsed: redactedParsed,
    resolved: redactedResolved,
  };
}

type RedactionResult = {
  ok: boolean;
  result?: unknown;
  error?: unknown;
  humanReadableMessage?: string;
};

/**
 * Deep-walk `incoming` and replace any {@link REDACTED_SENTINEL} values
 * (on sensitive paths) with the corresponding value from `original`.
 *
 * This is called by config.set / config.apply / config.patch before writing,
 * so that credentials survive a Web UI round-trip unmodified.
 */
export function restoreRedactedValues(
  incoming: unknown,
  original: unknown,
  hints?: ConfigUiHints,
): RedactionResult {
  if (incoming === null || incoming === undefined) {
    return { ok: false, error: "no input" };
  }
  if (typeof incoming !== "object") {
    return { ok: false, error: "input not an object" };
  }
  try {
    let restored: unknown;
    if (hints) {
      const lookup = buildRedactionLookup(hints);
      if (lookup.has("")) {
        restored = restoreRedactedValuesWithLookup(incoming, original, lookup, "", hints);
      } else {
        restored = restoreRedactedValuesGuessing(incoming, original, "", hints);
      }
    } else {
      restored = restoreRedactedValuesGuessing(incoming, original, "");
    }
    assertNoRedactedSentinel(restored, "");
    return { ok: true, result: restored };
  } catch (err) {
    if (err instanceof RedactionError) {
      return {
        ok: false,
        humanReadableMessage: err.humanReadableMessage,
      };
    }
    throw err; // some coding error, pass through
  }
}

class RedactionError extends Error {
  public readonly key: string;
  public readonly humanReadableMessage: string;

  constructor(key: string, humanReadableMessage?: string) {
    super("internal error class---should never escape");
    this.key = key;
    this.humanReadableMessage =
      humanReadableMessage ??
      `Sentinel value "${REDACTED_SENTINEL}" in key ${key} is not valid as real data`;
    this.name = "RedactionError";
  }
}

function restoreOriginalValueOrThrow(params: {
  key: string;
  path: string;
  original: Record<string, unknown>;
}): unknown {
  if (params.key in params.original) {
    return params.original[params.key];
  }
  if (!suppressRestoreWarnings) {
    log.warn(`Cannot un-redact config key ${params.path} as it doesn't have any value`);
  }
  throw new RedactionError(params.path);
}

function assertNoRedactedSentinel(value: unknown, path: string): void {
  if (typeof value === "string" && value === REDACTED_SENTINEL) {
    const pathLabel = path || "<root>";
    throw new RedactionError(
      pathLabel,
      `Reserved redaction sentinel "${REDACTED_SENTINEL}" is not valid config data (${pathLabel}).`,
    );
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nextPath = path ? `${path}[${index}]` : `[${index}]`;
      assertNoRedactedSentinel(value[index], nextPath);
    }
    return;
  }
  if (isObjectRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertNoRedactedSentinel(item, path ? `${path}.${key}` : key);
    }
  }
}

function maybeRestoreSecretRefId(params: {
  incoming: unknown;
  original: unknown;
  path: string;
}): { handled: false } | { handled: true; value: unknown } {
  const incomingObj = toObjectRecord(params.incoming);
  if (!isSecretRefShape(incomingObj) || incomingObj.id !== REDACTED_SENTINEL) {
    return { handled: false };
  }

  const originalObj = toObjectRecord(params.original);
  if (!isSecretRefWithProvider(originalObj)) {
    // Automatic restore needs provider as part of the identity; source+id alone can match the
    // wrong secret provider after config edits.
    if (isSecretRefShape(originalObj)) {
      throw new RedactionError(
        params.path,
        `SecretRef at ${params.path} requires a provider field to restore the redacted id automatically (original ref lacks provider).`,
      );
    }
    throw new RedactionError(
      params.path,
      `SecretRef at ${params.path} contains a redacted id placeholder with no matching original value.`,
    );
  }

  if (!isSecretRefWithProvider(incomingObj)) {
    // A redacted id is only restorable when the incoming object still carries the stable SecretRef
    // identity fields that were visible in the redacted snapshot.
    throw new RedactionError(
      params.path,
      `SecretRef at ${params.path} must include source, provider, and id when redacted placeholders are present.`,
    );
  }

  if (incomingObj.source !== originalObj.source || incomingObj.provider !== originalObj.provider) {
    // Changing source/provider while keeping a redacted id would silently bind the old secret id to
    // a different backend. Require an explicit id for that edit.
    throw new RedactionError(
      params.path,
      `SecretRef at ${params.path} changed source/provider while id is redacted. Provide an explicit id when changing source/provider.`,
    );
  }

  return { handled: true, value: { ...incomingObj, id: originalObj.id } };
}

function mapRedactedArray(params: {
  incoming: unknown[];
  original: unknown;
  path: string;
  mapItem: (item: unknown, index: number, originalArray: unknown[]) => unknown;
}): unknown[] {
  const originalArray = Array.isArray(params.original) ? params.original : [];
  if (params.incoming.length < originalArray.length) {
    log.warn(`Redacted config array key ${params.path} has been truncated`);
  }
  return params.incoming.map((item, index) => params.mapItem(item, index, originalArray));
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  return isObjectRecord(value) ? value : {};
}

function shouldPassThroughRestoreValue(incoming: unknown): boolean {
  return incoming === null || incoming === undefined || typeof incoming !== "object";
}

function toRestoreArrayContext(
  incoming: unknown,
  prefix: string,
): { incoming: unknown[]; path: string } | null {
  if (!Array.isArray(incoming)) {
    return null;
  }
  return { incoming, path: `${prefix}[]` };
}

function restoreArrayItemWithLookup(params: {
  item: unknown;
  index: number;
  originalArray: unknown[];
  lookup: Set<string>;
  path: string;
  hints: ConfigUiHints;
}): unknown {
  if (params.item === REDACTED_SENTINEL) {
    return params.originalArray[params.index];
  }
  return restoreRedactedValuesWithLookup(
    params.item,
    params.originalArray[params.index],
    params.lookup,
    params.path,
    params.hints,
  );
}

function restoreArrayItemWithGuessing(params: {
  item: unknown;
  index: number;
  originalArray: unknown[];
  path: string;
  hints?: ConfigUiHints;
}): unknown {
  if (
    !isExplicitlyNonSensitivePath(params.hints, [params.path]) &&
    isSensitivePath(params.path) &&
    params.item === REDACTED_SENTINEL
  ) {
    return params.originalArray[params.index];
  }
  return restoreRedactedValuesGuessing(
    params.item,
    params.originalArray[params.index],
    params.path,
    params.hints,
  );
}

function restoreGuessingArray(
  incoming: unknown[],
  original: unknown,
  path: string,
  hints?: ConfigUiHints,
): unknown[] {
  return mapRedactedArray({
    incoming,
    original,
    path,
    mapItem: (item, index, originalArray) =>
      restoreArrayItemWithGuessing({
        item,
        index,
        originalArray,
        path,
        hints,
      }),
  });
}

function shouldRestoreSensitiveGuessingPath(
  path: string,
  hintPaths: string[],
  hints?: ConfigUiHints,
): boolean {
  return (
    !isExplicitlyNonSensitivePath(hints, hintPaths) &&
    (isSensitivePath(path) || hasSensitiveUrlHintPath(hints, hintPaths) || isSensitiveUrlPath(path))
  );
}

function restoreRedactedEntryGuessing(params: {
  key: string;
  value: unknown;
  path: string;
  wildcardPath: string;
  original: Record<string, unknown>;
  hints?: ConfigUiHints;
}): unknown {
  const hintPaths = [params.path, params.wildcardPath];
  const canRestoreSecretRef = shouldRestoreSensitiveGuessingPath(
    params.path,
    hintPaths,
    params.hints,
  );
  if (params.value === REDACTED_SENTINEL && canRestoreSecretRef) {
    return restoreOriginalValueOrThrow({
      key: params.key,
      path: params.path,
      original: params.original,
    });
  }
  if (typeof params.value === "object" && params.value !== null) {
    if (canRestoreSecretRef) {
      const restoredSecretRef = maybeRestoreSecretRefId({
        incoming: params.value,
        original: params.original[params.key],
        path: params.path,
      });
      if (restoredSecretRef.handled) {
        return restoredSecretRef.value;
      }
    }
    return restoreRedactedValuesGuessing(
      params.value,
      params.original[params.key],
      params.path,
      params.hints,
    );
  }
  return params.value;
}

/**
 * Worker for restoreRedactedValues().
 * Used when there are ConfigUiHints available.
 */
function restoreRedactedValuesWithLookup(
  incoming: unknown,
  original: unknown,
  lookup: Set<string>,
  prefix: string,
  hints: ConfigUiHints,
): unknown {
  if (shouldPassThroughRestoreValue(incoming)) {
    return incoming;
  }

  const arrayContext = toRestoreArrayContext(incoming, prefix);
  if (arrayContext) {
    // Note: If the user removed an item in the middle of the array,
    // we have no way of knowing which one. In this case, the last
    // element(s) get(s) chopped off. Not good, so please don't put
    // sensitive string array in the config...
    const { incoming: incomingArray, path } = arrayContext;
    if (!lookup.has(path)) {
      // Keep behavior symmetric with object fallback: if hints miss the path,
      // still run pattern-based guessing for non-extension arrays.
      return restoreRedactedValuesGuessing(incomingArray, original, prefix, hints);
    }
    return mapRedactedArray({
      incoming: incomingArray,
      original,
      path,
      mapItem: (item, index, originalArray) =>
        restoreArrayItemWithLookup({
          item,
          index,
          originalArray,
          lookup,
          path,
          hints,
        }),
    });
  }
  const orig = toObjectRecord(original);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(toObjectRecord(incoming))) {
    result[key] = value;
    const path = prefix ? `${prefix}.${key}` : key;
    const wildcardPath = prefix ? `${prefix}.*` : "*";
    let matched = false;
    for (const candidate of [path, wildcardPath]) {
      if (lookup.has(candidate)) {
        matched = true;
        if (
          value === REDACTED_SENTINEL &&
          (hints[candidate]?.sensitive === true ||
            hasSensitiveUrlHintPath(hints, [candidate, path, wildcardPath]) ||
            isSensitiveUrlPath(path))
        ) {
          result[key] = restoreOriginalValueOrThrow({ key, path: candidate, original: orig });
        } else if (typeof value === "object" && value !== null) {
          const restoredSecretRef = maybeRestoreSecretRefId({
            incoming: value,
            original: orig[key],
            path,
          });
          result[key] = restoredSecretRef.handled
            ? restoredSecretRef.value
            : restoreRedactedValuesWithLookup(value, orig[key], lookup, candidate, hints);
        }
        break;
      }
    }
    if (!matched) {
      result[key] = restoreRedactedEntryGuessing({
        key,
        value,
        path,
        wildcardPath,
        original: orig,
        hints,
      });
    }
  }
  return result;
}

/**
 * Worker for restoreRedactedValues().
 * Used when ConfigUiHints are NOT available.
 */
function restoreRedactedValuesGuessing(
  incoming: unknown,
  original: unknown,
  prefix: string,
  hints?: ConfigUiHints,
): unknown {
  if (shouldPassThroughRestoreValue(incoming)) {
    return incoming;
  }

  const arrayContext = toRestoreArrayContext(incoming, prefix);
  if (arrayContext) {
    // Note: If the user removed an item in the middle of the array,
    // we have no way of knowing which one. In this case, the last
    // element(s) get(s) chopped off. Not good, so please don't put
    // sensitive string array in the config...
    const { incoming: incomingArray, path } = arrayContext;
    return restoreGuessingArray(incomingArray, original, path, hints);
  }
  const orig = toObjectRecord(original);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(toObjectRecord(incoming))) {
    const path = prefix ? `${prefix}.${key}` : key;
    const wildcardPath = prefix ? `${prefix}.*` : "*";
    result[key] = restoreRedactedEntryGuessing({
      key,
      value,
      path,
      wildcardPath,
      original: orig,
      hints,
    });
  }
  return result;
}
