/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt-tool-construction-plan.ts
 *
 * cross-wms 降级实现：嵌入式尝试工具构造计划的简化版本。
 * 不依赖完整的 tool-policy 和 bundle-mcp 基础设施。
 */

const BASE_CODING_TOOL_FACTORY_NAMES = new Set(["edit", "read", "write"]);
const SHELL_CODING_TOOL_FACTORY_NAMES = new Set(["apply_patch", "exec", "process"]);
const OPENCLAW_TOOL_FACTORY_NAMES = new Set([
  "agents_list", "canvas", "cron", "gateway", "get_goal", "heartbeat_respond",
  "heartbeat_response", "image", "image_generate", "message", "music_generate",
  "nodes", "pdf", "session_status", "sessions_history", "sessions_list",
  "sessions_send", "sessions_spawn", "sessions_yield", "skill_workshop",
  "create_goal", "subagents", "tts", "update_goal", "update_plan",
  "video_generate", "web_fetch", "web_search",
]);

const TOOL_NAME_SEPARATOR = "__";

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeToolList(names: string[]): string[] {
  return names.map(normalizeToolName).filter((n) => n.length > 0);
}

function expandToolGroups(toolsAllow: string[]): string[] {
  // Simplified: no group expansion
  return toolsAllow;
}

function isBundleMcpAllowlistName(normalized: string): boolean {
  return normalized === "bundle-mcp" || normalized.includes(TOOL_NAME_SEPARATOR);
}

function isKnownLocalCodingToolName(normalized: string): boolean {
  return (
    BASE_CODING_TOOL_FACTORY_NAMES.has(normalized) ||
    SHELL_CODING_TOOL_FACTORY_NAMES.has(normalized) ||
    OPENCLAW_TOOL_FACTORY_NAMES.has(normalized)
  );
}

function hasWildcardToolAllowlist(toolsAllow: string[]): boolean {
  return toolsAllow.some((entry) => normalizeToolName(entry) === "*");
}

export function applyEmbeddedAttemptToolsAllow<T extends { name: string }>(
  tools: T[],
  toolsAllow?: string[],
): T[] {
  if (!toolsAllow) {
    return tools;
  }
  if (toolsAllow.length === 0) {
    return [];
  }
  if (hasWildcardToolAllowlist(toolsAllow)) {
    return tools;
  }
  const normalizedAllow = new Set(normalizeToolList(expandToolGroups(toolsAllow)));
  return tools.filter((tool) => {
    const normalized = normalizeToolName(tool.name);
    // Check direct match and prefix match for bundle tools
    if (normalizedAllow.has(normalized)) {
      return true;
    }
    // Check if any allowlist entry is a prefix (for bundle__tool patterns)
    for (const allowed of normalizedAllow) {
      if (normalized.startsWith(allowed + TOOL_NAME_SEPARATOR)) {
        return true;
      }
    }
    return false;
  });
}

export function mergeForcedEmbeddedAttemptToolsAllow(
  toolsAllow: string[] | undefined,
  params: { forceMessageTool?: boolean },
): string[] | undefined {
  if (
    !params.forceMessageTool ||
    toolsAllow === undefined ||
    hasWildcardToolAllowlist(toolsAllow)
  ) {
    return toolsAllow;
  }
  if (toolsAllow.length === 0) {
    return ["message"];
  }
  const normalized = new Set(toolsAllow.map((entry) => normalizeToolName(entry)));
  return normalized.has("message") ? toolsAllow : [...toolsAllow, "message"];
}

type CodingToolConstructionPlan = {
  includeBaseCodingTools: boolean;
  includeShellTools: boolean;
  includeChannelTools: boolean;
  includeOpenClawTools: boolean;
  includePluginTools: boolean;
};

const ALL_CODING_TOOL_CONSTRUCTION_PLAN: CodingToolConstructionPlan = {
  includeBaseCodingTools: true,
  includeShellTools: true,
  includeChannelTools: true,
  includeOpenClawTools: true,
  includePluginTools: true,
};

const NO_CODING_TOOL_CONSTRUCTION_PLAN: CodingToolConstructionPlan = {
  includeBaseCodingTools: false,
  includeShellTools: false,
  includeChannelTools: false,
  includeOpenClawTools: false,
  includePluginTools: false,
};

function resolveCodingToolConstructionPlanForAllowlist(
  toolsAllow?: string[],
): CodingToolConstructionPlan {
  if (!toolsAllow) {
    return { ...ALL_CODING_TOOL_CONSTRUCTION_PLAN };
  }
  if (toolsAllow.length === 0) {
    return { ...NO_CODING_TOOL_CONSTRUCTION_PLAN };
  }
  if (hasWildcardToolAllowlist(toolsAllow)) {
    return { ...ALL_CODING_TOOL_CONSTRUCTION_PLAN };
  }
  const expanded = expandToolGroups(toolsAllow);
  const normalized = normalizeToolList(expanded);
  const includeBaseCodingTools = normalized.some((name) =>
    BASE_CODING_TOOL_FACTORY_NAMES.has(name),
  );
  const includeShellTools = normalized.some((name) => SHELL_CODING_TOOL_FACTORY_NAMES.has(name));
  const includeOpenClawTools = normalized.some((name) => OPENCLAW_TOOL_FACTORY_NAMES.has(name));
  const includePluginTools = normalized.some(
    (name) =>
      name === "group:plugins" ||
      (!isBundleMcpAllowlistName(name) && !isKnownLocalCodingToolName(name)),
  );
  const includeChannelTools = includePluginTools;

  return {
    includeBaseCodingTools,
    includeShellTools,
    includeChannelTools,
    includeOpenClawTools,
    includePluginTools,
  };
}

export function resolveEmbeddedAttemptToolConstructionPlan(params: {
  disableTools?: boolean;
  isRawModelRun?: boolean;
  toolsAllow?: string[];
  forceMessageTool?: boolean;
}): {
  constructTools: boolean;
  includeCoreTools: boolean;
  runtimeToolAllowlist?: string[];
  codingToolConstructionPlan: CodingToolConstructionPlan;
} {
  if (params.disableTools === true || params.isRawModelRun === true) {
    return {
      constructTools: false,
      includeCoreTools: false,
      codingToolConstructionPlan: { ...NO_CODING_TOOL_CONSTRUCTION_PLAN },
    };
  }
  const toolsAllow = mergeForcedEmbeddedAttemptToolsAllow(params.toolsAllow, {
    forceMessageTool: params.forceMessageTool,
  });
  const codingToolConstructionPlan = resolveCodingToolConstructionPlanForAllowlist(toolsAllow);
  const includeCoreTools =
    codingToolConstructionPlan.includeBaseCodingTools ||
    codingToolConstructionPlan.includeShellTools ||
    codingToolConstructionPlan.includeOpenClawTools;
  const constructTools =
    includeCoreTools ||
    codingToolConstructionPlan.includeChannelTools ||
    codingToolConstructionPlan.includePluginTools;

  return {
    constructTools,
    includeCoreTools,
    ...(toolsAllow ? { runtimeToolAllowlist: toolsAllow } : {}),
    codingToolConstructionPlan,
  };
}

export function shouldCreateBundleMcpRuntimeForAttempt(params: {
  toolsEnabled: boolean;
  disableTools?: boolean;
  toolsAllow?: string[];
}): boolean {
  if (!params.toolsEnabled || params.disableTools === true) {
    return false;
  }
  if (!params.toolsAllow) {
    return true;
  }
  if (params.toolsAllow.length === 0) {
    return false;
  }
  if (hasWildcardToolAllowlist(params.toolsAllow)) {
    return true;
  }
  return params.toolsAllow.some((toolName) => {
    const normalized = normalizeToolName(toolName);
    return isBundleMcpAllowlistName(normalized) || normalized === "group:plugins";
  });
}

export function shouldCreateBundleLspRuntimeForAttempt(params: {
  toolsEnabled: boolean;
  disableTools?: boolean;
  toolsAllow?: string[];
}): boolean {
  if (!params.toolsEnabled || params.disableTools === true) {
    return false;
  }
  if (!params.toolsAllow) {
    return true;
  }
  if (params.toolsAllow.length === 0) {
    return false;
  }
  if (hasWildcardToolAllowlist(params.toolsAllow)) {
    return true;
  }
  return params.toolsAllow.some((toolName) => {
    const normalized = normalizeToolName(toolName);
    return normalized.startsWith("lsp_");
  });
}
