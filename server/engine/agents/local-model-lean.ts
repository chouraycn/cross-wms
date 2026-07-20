/**
 * Local-model lean tool filtering.
 * Ported from openclaw/src/agents/local-model-lean.ts
 */

const LOCAL_MODEL_LEAN_DENY_TOOL_NAMES = new Set(["browser", "cron", "message"]);

/** Resolves tool names that must survive local-model lean filtering. */
export function resolveLocalModelLeanPreserveToolNames(params?: {
  toolNames?: Iterable<string>;
  forceMessageTool?: boolean;
  sourceReplyDeliveryMode?: string;
}): string[] {
  const names = [...(params?.toolNames ?? [])];
  if (params?.forceMessageTool || params?.sourceReplyDeliveryMode === "message_tool_only") {
    names.push("message");
  }
  return [...new Set(names)];
}

/** Returns true when local-model lean mode is enabled for the selected agent. */
export function isLocalModelLeanEnabled(params: {
  config?: unknown;
  agentId?: string;
  sessionKey?: string;
}): boolean {
  if (!params.config || typeof params.config !== "object") {
    return false;
  }
  const cfg = params.config as {
    agents?: {
      defaults?: {
        experimental?: { localModelLean?: boolean };
      };
    };
  };
  return cfg.agents?.defaults?.experimental?.localModelLean ?? false;
}

/** Filters tools for local-model lean mode while preserving required delivery tools. */
export function filterLocalModelLeanTools(params: {
  tools: Array<{ name: string }>;
  config?: unknown;
  agentId?: string;
  sessionKey?: string;
  preserveToolNames?: Iterable<string>;
}): Array<{ name: string }> {
  if (!isLocalModelLeanEnabled(params)) {
    return params.tools;
  }
  const preservedToolNames = new Set(
    [...(params.preserveToolNames ?? [])].map((n) => n.toLowerCase().trim()).filter(Boolean),
  );
  return params.tools.filter((tool) => {
    const normalizedName = tool.name.toLowerCase().trim();
    return preservedToolNames.has(normalizedName) || !LOCAL_MODEL_LEAN_DENY_TOOL_NAMES.has(normalizedName);
  });
}

/** Apply local-model lean tool search defaults. */
export function applyLocalModelLeanToolSearchDefaults(params: {
  config?: unknown;
  agentId?: string;
  sessionKey?: string;
}): unknown | undefined {
  if (!params.config || !isLocalModelLeanEnabled(params)) {
    return params.config;
  }
  const cfg = params.config as Record<string, unknown>;
  const tools = cfg.tools as Record<string, unknown> | undefined;
  if (tools?.toolSearch !== undefined) {
    return params.config;
  }
  return {
    ...params.config,
    tools: {
      ...tools,
      toolSearch: {
        enabled: true,
        mode: "tools",
        searchDefaultLimit: 5,
        maxSearchLimit: 10,
      },
    },
  };
}
