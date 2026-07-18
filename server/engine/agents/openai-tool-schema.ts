/**
 * OpenAI strict JSON-schema normalization for tool inventories and request payloads.
 *
 * Caches normalized object inputs by provider compatibility so repeated inventory builds preserve identity.
 *
 * 移植自 openclaw/src/agents/openai-tool-schema.ts。
 * 注意：原 openclaw 实现依赖：
 *   - ../config/types.models.js 中的 ModelCompatConfig
 *   - ../plugins/provider-model-compat.js 中的 shouldOmitEmptyArrayItems
 *   - ./agent-tools-parameter-schema.js 中的 normalizeToolParameterSchema
 * 本地降级实现：ModelCompatConfig 用本地类型；
 *   shouldOmitEmptyArrayItems 内联实现；
 *   normalizeToolParameterSchema 降级为最小实现（仅去除 unsupported keywords）。
 */
import type { OpenAIToolProjection } from "./openai-tool-projection.js";

/** Provider model 兼容配置（降级占位）。 */
type ModelCompatConfig = {
  unsupportedToolSchemaKeywords?: string[];
  omitEmptyArrayItems?: boolean;
};

type ToolSchemaCompatInput = {
  unsupportedToolSchemaKeywords?: unknown;
  omitEmptyArrayItems?: unknown;
};

const MAX_STRICT_SCHEMA_CACHE_ENTRIES_PER_SCHEMA = 8;
let strictOpenAISchemaCache = new WeakMap<object, Array<{ key: string; value: unknown }>>();

// 内联降级实现：判断是否应省略空数组 items。
function shouldOmitEmptyArrayItems(compat: ModelCompatConfig | undefined): boolean {
  return compat?.omitEmptyArrayItems === true;
}

function resolveToolSchemaModelCompat(
  compat: ToolSchemaCompatInput | null | undefined,
): ModelCompatConfig | undefined {
  if (!compat) {
    return undefined;
  }
  const unsupportedToolSchemaKeywords = Array.isArray(compat.unsupportedToolSchemaKeywords)
    ? compat.unsupportedToolSchemaKeywords.filter(
        (keyword): keyword is string => typeof keyword === "string",
      )
    : [];
  if (unsupportedToolSchemaKeywords.length === 0 && compat.omitEmptyArrayItems !== true) {
    return undefined;
  }
  return {
    ...(unsupportedToolSchemaKeywords.length > 0 ? { unsupportedToolSchemaKeywords } : {}),
    ...(compat.omitEmptyArrayItems === true ? { omitEmptyArrayItems: true } : {}),
  };
}

function resolveStrictOpenAISchemaCacheKey(
  modelCompat: ToolSchemaCompatInput | null | undefined,
): string {
  const compat = resolveToolSchemaModelCompat(modelCompat);
  return JSON.stringify([
    [...(compat?.unsupportedToolSchemaKeywords ?? [])].sort(),
    shouldOmitEmptyArrayItems(compat),
  ]);
}

function readCachedStrictOpenAISchema(schema: object, key: string): unknown {
  return strictOpenAISchemaCache.get(schema)?.find((entry) => entry.key === key)?.value;
}

function rememberStrictOpenAISchema(schema: object, key: string, value: unknown): unknown {
  const entries = strictOpenAISchemaCache.get(schema) ?? [];
  strictOpenAISchemaCache.set(
    schema,
    [{ key, value }, ...entries.filter((entry) => entry.key !== key)].slice(
      0,
      MAX_STRICT_SCHEMA_CACHE_ENTRIES_PER_SCHEMA,
    ),
  );
  return value;
}

export function clearOpenAIToolSchemaCacheForTest(): void {
  strictOpenAISchemaCache = new WeakMap();
}

/**
 * 降级实现：normalizeToolParameterSchema 的最小版本。
 *
 * 仅移除 unsupported keywords 并处理 omitEmptyArrayItems；不进行完整的 schema 规范化。
 */
function normalizeToolParameterSchema(
  schema: unknown,
  options?: { modelCompat?: ModelCompatConfig | undefined },
): unknown {
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  const unsupported = new Set(options?.modelCompat?.unsupportedToolSchemaKeywords ?? []);
  const omitEmpty = shouldOmitEmptyArrayItems(options?.modelCompat);
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      let changed = false;
      const result = value.map((entry) => {
        const next = normalize(entry);
        if (next !== entry) {
          changed = true;
        }
        return next;
      });
      return changed ? result : value;
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const record = value as Record<string, unknown>;
    let changed = false;
    const normalized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      if (unsupported.has(key)) {
        changed = true;
        continue;
      }
      const next = normalize(val);
      normalized[key] = next;
      if (next !== val) {
        changed = true;
      }
    }
    if (omitEmpty && normalized.type === "array" && !("items" in normalized)) {
      normalized.items = {};
      changed = true;
    }
    return changed ? normalized : value;
  };
  return normalize(schema);
}

/** Normalizes a tool parameter schema into the OpenAI strict JSON-schema subset. */
export function normalizeStrictOpenAIJsonSchema(
  schema: unknown,
  modelCompat?: ToolSchemaCompatInput | null,
): unknown {
  const schemaInput = schema ?? {};
  if (!schemaInput || typeof schemaInput !== "object") {
    return normalizeStrictOpenAIJsonSchemaRecursive(
      normalizeToolParameterSchema(schemaInput, {
        modelCompat: resolveToolSchemaModelCompat(modelCompat),
      }),
      0,
    );
  }
  const cacheKey = resolveStrictOpenAISchemaCacheKey(modelCompat);
  const cached = readCachedStrictOpenAISchema(schemaInput, cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  return rememberStrictOpenAISchema(
    schemaInput,
    cacheKey,
    normalizeStrictOpenAIJsonSchemaRecursive(
      normalizeToolParameterSchema(schemaInput, {
        modelCompat: resolveToolSchemaModelCompat(modelCompat),
      }),
      0,
    ),
  );
}

function normalizeStrictOpenAIJsonSchemaRecursive(schema: unknown, depth: number): unknown {
  if (Array.isArray(schema)) {
    let changed = false;
    const normalized = schema.map((entry) => {
      const next = normalizeStrictOpenAIJsonSchemaRecursive(entry, depth);
      changed ||= next !== entry;
      return next;
    });
    return changed ? normalized : schema;
  }
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const record = schema as Record<string, unknown>;
  let changed = false;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const next = normalizeStrictOpenAIJsonSchemaRecursive(
      value,
      key === "properties" ? depth : depth + 1,
    );
    normalized[key] = next;
    changed ||= next !== value;
  }

  if (normalized.type === "object") {
    const properties =
      normalized.properties &&
      typeof normalized.properties === "object" &&
      !Array.isArray(normalized.properties)
        ? (normalized.properties as Record<string, unknown>)
        : undefined;
    if (properties && Object.keys(properties).length === 0 && !Array.isArray(normalized.required)) {
      normalized.required = [];
      changed = true;
    }
    if (depth === 0 && !("additionalProperties" in normalized)) {
      normalized.additionalProperties = false;
      changed = true;
    }
  }

  return changed ? normalized : schema;
}

/** Normalizes tool parameters using strict OpenAI rules only when strict mode is active. */
export function normalizeOpenAIStrictToolParameters<T>(
  schema: T,
  strict: boolean,
  modelCompat?: ToolSchemaCompatInput | null,
): T {
  const toolSchemaCompat = resolveToolSchemaModelCompat(modelCompat);
  if (!strict) {
    return normalizeToolParameterSchema(schema ?? {}, { modelCompat: toolSchemaCompat }) as T;
  }
  return normalizeStrictOpenAIJsonSchema(schema, toolSchemaCompat) as T;
}

/** Returns whether a schema already satisfies OpenAI strict tool-schema constraints. */
export function isStrictOpenAIJsonSchemaCompatible(schema: unknown): boolean {
  return isStrictOpenAIJsonSchemaCompatibleRecursive(normalizeStrictOpenAIJsonSchema(schema));
}

type OpenAIStrictToolSchemaDiagnostic = {
  toolIndex: number;
  toolName?: string;
  violations: string[];
};

/** Returns strict-schema diagnostics for an already materialized OpenAI tool projection. */
export function findOpenAIStrictToolProjectionDiagnostics(
  projection: OpenAIToolProjection,
): OpenAIStrictToolSchemaDiagnostic[] {
  return [
    ...projection.diagnostics.map((diagnostic) => ({
      toolIndex: diagnostic.toolIndex,
      ...(diagnostic.toolName ? { toolName: diagnostic.toolName } : {}),
      violations: [...diagnostic.violations],
    })),
    ...projection.tools.flatMap((tool) => {
      const violations = findStrictOpenAIJsonSchemaViolations(
        normalizeStrictOpenAIJsonSchema(tool.parameters),
        `${tool.name}.parameters`,
      );
      return violations.length > 0
        ? [{ toolIndex: tool.toolIndex, toolName: tool.name, violations }]
        : [];
    }),
  ];
}

function isStrictOpenAIJsonSchemaCompatibleRecursive(schema: unknown): boolean {
  if (Array.isArray(schema)) {
    return schema.every((entry) => isStrictOpenAIJsonSchemaCompatibleRecursive(entry));
  }
  if (!schema || typeof schema !== "object") {
    return true;
  }

  const record = schema as Record<string, unknown>;
  if ("anyOf" in record || "oneOf" in record || "allOf" in record) {
    return false;
  }
  if (Array.isArray(record.type)) {
    return false;
  }
  if (record.type === "object" && record.additionalProperties !== false) {
    return false;
  }
  if (record.type === "object") {
    const properties =
      record.properties &&
      typeof record.properties === "object" &&
      !Array.isArray(record.properties)
        ? (record.properties as Record<string, unknown>)
        : {};
    const required = Array.isArray(record.required)
      ? record.required.filter((entry): entry is string => typeof entry === "string")
      : undefined;
    if (!required) {
      return false;
    }
    const requiredSet = new Set(required);
    if (Object.keys(properties).some((key) => !requiredSet.has(key))) {
      return false;
    }
  }

  return Object.entries(record).every(([key, entry]) => {
    if (key === "properties" && entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.values(entry as Record<string, unknown>).every((value) =>
        isStrictOpenAIJsonSchemaCompatibleRecursive(value),
      );
    }
    return isStrictOpenAIJsonSchemaCompatibleRecursive(entry);
  });
}

function findStrictOpenAIJsonSchemaViolations(schema: unknown, path: string): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((entry, index) =>
      findStrictOpenAIJsonSchemaViolations(entry, `${path}[${index}]`),
    );
  }
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const record = schema as Record<string, unknown>;
  const violations: string[] = [];
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    if (key in record) {
      violations.push(`${path}.${key}`);
    }
  }
  if (Array.isArray(record.type)) {
    violations.push(`${path}.type`);
  }
  if (record.type === "object") {
    if (record.additionalProperties !== false) {
      violations.push(`${path}.additionalProperties`);
    }
    const properties =
      record.properties &&
      typeof record.properties === "object" &&
      !Array.isArray(record.properties)
        ? (record.properties as Record<string, unknown>)
        : {};
    const required = Array.isArray(record.required)
      ? record.required.filter((entry): entry is string => typeof entry === "string")
      : undefined;
    if (!required) {
      violations.push(`${path}.required`);
    } else {
      const requiredSet = new Set(required);
      for (const key of Object.keys(properties)) {
        if (!requiredSet.has(key)) {
          violations.push(`${path}.required.${key}`);
        }
      }
    }
  }

  if (
    record.properties &&
    typeof record.properties === "object" &&
    !Array.isArray(record.properties)
  ) {
    for (const [key, value] of Object.entries(record.properties)) {
      violations.push(...findStrictOpenAIJsonSchemaViolations(value, `${path}.properties.${key}`));
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "properties") {
      continue;
    }
    if (value && typeof value === "object") {
      violations.push(...findStrictOpenAIJsonSchemaViolations(value, `${path}.${key}`));
    }
  }

  return violations;
}

/** Resolves strict mode for the projected tools that will be emitted in the request payload. */
export function resolveOpenAIProjectedToolsStrictToolFlag(
  projection: OpenAIToolProjection,
  strict: boolean | null | undefined,
): boolean | undefined {
  if (strict !== true) {
    return strict === false ? false : undefined;
  }
  return projection.tools.every((tool) => isStrictOpenAIJsonSchemaCompatible(tool.parameters));
}
