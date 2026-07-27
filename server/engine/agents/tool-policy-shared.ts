/**
 * Shared runtime tool policy normalization.
 */

type ToolProfilePolicy = {
  allow?: string[];
  deny?: string[];
};

const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: "exec",
  "apply-patch": "apply_patch",
};

const CORE_TOOL_GROUPS: Record<string, string[]> = {
  "group:openclaw": [
    "agents_list",
    "canvas",
    "cron",
    "gateway",
    "get_goal",
    "heartbeat_respond",
    "heartbeat_response",
    "image",
    "image_generate",
    "message",
    "music_generate",
    "nodes",
    "pdf",
    "session_status",
    "sessions_history",
    "sessions_list",
    "sessions_send",
    "sessions_spawn",
    "sessions_yield",
    "skill_workshop",
    "create_goal",
    "subagents",
    "tts",
    "update_goal",
    "update_plan",
    "video_generate",
    "web_fetch",
    "web_search",
  ],
  "group:base": ["edit", "read", "write"],
  "group:shell": ["apply_patch", "exec", "process"],
};

export const TOOL_GROUPS: Record<string, string[]> = { ...CORE_TOOL_GROUPS };

function normalizeLowercaseStringOrEmpty(name: string): string {
  return name.toLowerCase().trim();
}

function uniqueStrings(list: string[]): string[] {
  return Array.from(new Set(list));
}

export function normalizeToolName(name: string): string {
  const normalized = normalizeLowercaseStringOrEmpty(name);
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

export function couldNormalizeToolNamePrefixToAllowedTool(
  prefix: string,
  allowedToolNames: Set<string>,
): boolean {
  const normalizedPrefix = normalizeLowercaseStringOrEmpty(prefix);
  if (!normalizedPrefix) {
    return false;
  }

  const allowed = new Set<string>();
  const allowedArray = Array.from(allowedToolNames);
  for (let i = 0; i < allowedArray.length; i++) {
    const toolName = allowedArray[i];
    const normalizedToolName = normalizeToolName(toolName);
    const foldedToolName = normalizeLowercaseStringOrEmpty(toolName);
    if (normalizedToolName) {
      allowed.add(normalizedToolName);
    }
    if (foldedToolName) {
      allowed.add(foldedToolName);
    }
    if (
      normalizedToolName.startsWith(normalizedPrefix) ||
      foldedToolName.startsWith(normalizedPrefix)
    ) {
      return true;
    }
  }

  const resolvedPrefix = normalizeToolName(normalizedPrefix);
  if (resolvedPrefix !== normalizedPrefix) {
    const allowedKeys = Array.from(allowed.keys());
    for (let i = 0; i < allowedKeys.length; i++) {
      if (allowedKeys[i].startsWith(resolvedPrefix)) {
        return true;
      }
    }
  }

  const aliasEntries = Object.entries(TOOL_NAME_ALIASES);
  for (let i = 0; i < aliasEntries.length; i++) {
    const [alias, toolName] = aliasEntries[i];
    if (alias.startsWith(normalizedPrefix) && allowed.has(toolName)) {
      return true;
    }
  }
  return false;
}

export function normalizeToolList(list?: string[]): string[] {
  if (!list) {
    return [];
  }
  const result: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const normalized = normalizeToolName(list[i]);
    if (normalized) {
      result.push(normalized);
    }
  }
  return result;
}

export function expandToolGroups(list?: string[]): string[] {
  const normalized = normalizeToolList(list);
  const expanded: string[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const value = normalized[i];
    const group = TOOL_GROUPS[value];
    if (group) {
      expanded.push(...group);
      continue;
    }
    expanded.push(value);
  }
  return uniqueStrings(expanded);
}

export function resolveToolProfilePolicy(profile?: string): ToolProfilePolicy | undefined {
  switch (profile) {
    case "minimal":
      return { allow: ["group:base"] };
    case "coding":
      return { allow: ["group:base", "group:shell"] };
    case "messaging":
      return { allow: ["message", "sessions_send"] };
    case "full":
      return undefined;
    default:
      return undefined;
  }
}

export type ToolProfileId = string;
