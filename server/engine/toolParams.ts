import type { RegisteredTool } from './toolTypes.js';

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

function isValidEditReplacement(value: unknown): boolean {
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

export const REQUIRED_PARAM_GROUPS: Record<string, readonly RequiredParamGroup[]> = {
  file_readFile: [{ keys: ["path"], label: "path" }],
  file_writeFile: [
    { keys: ["path"], label: "path" },
    { keys: ["content"], label: "content" },
  ],
  file_edit: [
    { keys: ["path"], label: "path" },
    { keys: ["edits"], label: "edits", validator: hasValidEditReplacements },
  ],
  shell_exec: [{ keys: ["command"], label: "command" }],
  db_query: [{ keys: ["sql"], label: "sql" }],
  desktop_type: [{ keys: ["text"], label: "text" }],
  desktop_key_press: [{ keys: ["keys"], label: "keys" }],
  desktop_app_launch: [{ keys: ["app"], label: "app" }],
  desktop_app_quit: [{ keys: ["app"], label: "app" }],
  desktop_window_focus: [{ keys: ["app"], label: "app" }],
  desktop_click_smart: [{ keys: ["description"], label: "description" }],
  app_setBotName: [{ keys: ["name"], label: "name" }],
  web_search: [{ keys: ["query"], label: "query" }],
  web_search_legacy: [{ keys: ["query"], label: "query" }],
  web_fetch: [{ keys: ["url"], label: "url" }],
  web_fetch_legacy: [{ keys: ["url"], label: "url" }],
};

export function getToolParamsRecord(params: unknown): Record<string, unknown> | undefined {
  return params && typeof params === "object" ? (params as Record<string, unknown>) : undefined;
}

export function stripMalformedXmlArgValueSuffix(value: string): string {
  return value.includes("</arg_value>") ? value.replace(XML_ARG_VALUE_SUFFIX_RE, "") : value;
}

export function normalizeHallucinatedOfficePathExtension(value: string): string {
  return value.replace(HALLUCINATED_OFFICE_PATH_EXTENSION_RE, (_match, family: string) => {
    return OFFICE_EXTENSION_BY_FAMILY[family.toLowerCase()] ?? _match;
  });
}

export function normalizeFileToolPathParam(value: string): string {
  return normalizeHallucinatedOfficePathExtension(stripMalformedXmlArgValueSuffix(value));
}

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

export function validateAndNormalizeToolParams(
  toolName: string,
  params: unknown,
): Record<string, unknown> {
  const record = getToolParamsRecord(params) ?? {};
  const requiredGroups = REQUIRED_PARAM_GROUPS[toolName] ?? [];
  
  const pathKeys = resolveFileToolPathParamKeys(requiredGroups);
  const normalizedParams =
    record && pathKeys.length > 0
      ? normalizeFileToolPathParamsFromKeys(record, pathKeys)
      : record;
  
  if (requiredGroups.length > 0) {
    assertRequiredParams(getToolParamsRecord(normalizedParams), requiredGroups, toolName);
  }
  
  return normalizedParams;
}