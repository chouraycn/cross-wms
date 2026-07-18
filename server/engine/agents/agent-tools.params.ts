/**
 * 模型提供 tool 参数的共享校验。
 *
 * 将格式错误的 file-tool 参数转换为可重试的错误，并修复在 path 参数中
 * 观察到的特定 XML 后缀和 Office 扩展名损坏。
 */
import type { AnyAgentTool } from "./agent-tools.types.js";

export type RequiredParamGroup = {
  keys: readonly string[];
  allowEmpty?: boolean;
  label?: string;
  validator?: (record: Record<string, unknown>) => boolean;
};

const RETRY_GUIDANCE_SUFFIX = " Supply correct parameters before retrying.";
const XML_ARG_VALUE_SUFFIX_RE = /<\/arg_value>>+$/;
const FILE_TOOL_PATH_PARAM_KEYS = new Set(["path"]);
const HALLUCINATED_OFFICE_PATH_EXTENSION_RE = /\.(doc|ppt|xls)(?:odex|codex|xodex|xcodex)$/i;
const OFFICE_EXTENSION_BY_FAMILY: Record<string, string> = {
  doc: ".docx",
  ppt: ".pptx",
  xls: ".xlsx",
};

function parameterValidationError(message: string): Error {
  return new Error(`${message}.${RETRY_GUIDANCE_SUFFIX}`);
}

function describeReceivedParamValue(value: unknown, allowEmpty = false): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    if (allowEmpty || value.trim().length > 0) {
      return undefined;
    }
    return "<empty-string>";
  }
  if (Array.isArray(value)) {
    return "<array>";
  }
  return `<${typeof value}>`;
}

function formatReceivedParamHint(
  record: Record<string, unknown>,
  groups: readonly RequiredParamGroup[],
): string {
  // 仅包含已存在的字段，使错误能区分缺失参数与错误形状/空值，而不回显完整内容。
  const allowEmptyKeys = new Set<string>();
  for (const group of groups) {
    if (group.allowEmpty) {
      for (const key of group.keys) {
        allowEmptyKeys.add(key);
      }
    }
  }
  const received: string[] = [];
  for (const key of Object.keys(record)) {
    const detail = describeReceivedParamValue(record[key], allowEmptyKeys.has(key));
    if (record[key] === undefined || record[key] === null) {
      continue;
    }
    received.push(detail ? `${key}=${detail}` : key);
  }
  return received.length > 0 ? ` (received: ${received.join(", ")})` : "";
}

type EditReplacement = {
  oldText: string;
  newText: string;
};

function isValidEditReplacement(value: unknown): value is EditReplacement {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.oldText === "string" &&
    record.oldText.trim().length > 0 &&
    typeof record.newText === "string"
  );
}

function hasValidEditReplacements(record: Record<string, unknown>): boolean {
  const edits = record.edits;
  return (
    Array.isArray(edits) &&
    edits.length > 0 &&
    edits.every((entry) => isValidEditReplacement(entry))
  );
}

/** file-style 工具所需的参数组，用于重试引导。 */
export const REQUIRED_PARAM_GROUPS = {
  read: [{ keys: ["path"], label: "path" }],
  write: [
    { keys: ["path"], label: "path" },
    { keys: ["content"], label: "content" },
  ],
  edit: [
    { keys: ["path"], label: "path" },
    { keys: ["edits"], label: "edits", validator: hasValidEditReplacements },
  ],
} as const;

/** 返回模型提供 tool 参数的 record 视图（如可能）。 */
export function getToolParamsRecord(params: unknown): Record<string, unknown> | undefined {
  return params && typeof params === "object" ? (params as Record<string, unknown>) : undefined;
}

/** 剥离 XML arg_value path 参数末尾偶尔出现的多余闭合标记。 */
export function stripMalformedXmlArgValueSuffix(value: string): string {
  return value.includes("</arg_value>") ? value.replace(XML_ARG_VALUE_SUFFIX_RE, "") : value;
}

/** 规范化已知的模型幻觉 Office/codex path 扩展名。 */
export function normalizeHallucinatedOfficePathExtension(value: string): string {
  return value.replace(HALLUCINATED_OFFICE_PATH_EXTENSION_RE, (_match, family: string) => {
    return OFFICE_EXTENSION_BY_FAMILY[family.toLowerCase()] ?? _match;
  });
}

/** 规范化模型提供的 file-tool path 参数，但不触碰 payload 文本。 */
export function normalizeFileToolPathParam(value: string): string {
  return normalizeHallucinatedOfficePathExtension(stripMalformedXmlArgValueSuffix(value));
}

/** 从选定字符串字段剥离格式错误的 XML 后缀，不修改输入。 */
export function stripMalformedXmlArgValueSuffixFromKeys<T extends Record<string, unknown>>(
  record: T,
  keys: readonly string[],
): T {
  let normalized: T | undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const stripped = stripMalformedXmlArgValueSuffix(value);
    if (stripped !== value) {
      normalized ??= { ...record };
      normalized[key as keyof T] = stripped as T[keyof T];
    }
  }
  return normalized ?? record;
}

/** 规范化选定的 file-tool path 字段，不修改输入。 */
export function normalizeFileToolPathParamsFromKeys<T extends Record<string, unknown>>(
  record: T,
  keys: readonly string[],
): T {
  let normalized: T | undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const normalizedValue = normalizeFileToolPathParam(value);
    if (normalizedValue !== value) {
      normalized ??= { ...record };
      normalized[key as keyof T] = normalizedValue as T[keyof T];
    }
  }
  return normalized ?? record;
}

function resolveFileToolPathParamKeys(groups: readonly RequiredParamGroup[] | undefined): string[] {
  const keys = new Set<string>();
  for (const group of groups ?? []) {
    for (const key of group.keys) {
      if (FILE_TOOL_PATH_PARAM_KEYS.has(key)) {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

/** 当必需的 tool 参数缺失时抛出可操作的重试引导。 */
export function assertRequiredParams(
  record: Record<string, unknown> | undefined,
  groups: readonly RequiredParamGroup[],
  toolName: string,
): void {
  if (!record || typeof record !== "object") {
    throw parameterValidationError(`Missing parameters for ${toolName}`);
  }

  const missingLabels: string[] = [];
  for (const group of groups) {
    const satisfied =
      group.validator?.(record) ??
      group.keys.some((key) => {
        if (!(key in record)) {
          return false;
        }
        const value = record[key];
        if (typeof value !== "string") {
          return false;
        }
        if (group.allowEmpty) {
          return true;
        }
        return value.trim().length > 0;
      });

    if (!satisfied) {
      const label = group.label ?? group.keys.join(" or ");
      missingLabels.push(label);
    }
  }

  if (missingLabels.length > 0) {
    const joined = missingLabels.join(", ");
    const noun = missingLabels.length === 1 ? "parameter" : "parameters";
    const receivedHint = formatReceivedParamHint(record, groups);
    throw parameterValidationError(`Missing required ${noun}: ${joined}${receivedHint}`);
  }
}

/** 用必需参数校验包装 tool execute 函数。 */
export function wrapToolParamValidation(
  tool: AnyAgentTool,
  requiredParamGroups?: readonly RequiredParamGroup[],
): AnyAgentTool {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const record = getToolParamsRecord(params);
      const pathKeys = resolveFileToolPathParamKeys(requiredParamGroups);
      const normalizedParams =
        record && pathKeys.length > 0
          ? normalizeFileToolPathParamsFromKeys(record, pathKeys)
          : params;
      if (requiredParamGroups?.length) {
        assertRequiredParams(getToolParamsRecord(normalizedParams), requiredParamGroups, tool.name);
      }
      return tool.execute(toolCallId, normalizedParams, signal, onUpdate);
    },
  };
}
