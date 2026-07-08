/**
 * ACP Translator Presentation
 * 会话展示 - 构建 ACP 会话展示、元数据、使用情况和配置选项快照
 *
 * 参考 openclaw/src/acp/translator.presentation.ts 设计
 */

export const ACP_THOUGHT_LEVEL_CONFIG_ID = "thought_level";
export const ACP_FAST_MODE_CONFIG_ID = "fast_mode";
export const ACP_VERBOSE_LEVEL_CONFIG_ID = "verbose_level";
export const ACP_TRACE_LEVEL_CONFIG_ID = "trace_level";
export const ACP_REASONING_LEVEL_CONFIG_ID = "reasoning_level";
export const ACP_RESPONSE_USAGE_CONFIG_ID = "response_usage";
export const ACP_ELEVATED_LEVEL_CONFIG_ID = "elevated_level";
export const ACP_TIMEOUT_CONFIG_ID = "timeout";
export const ACP_TIMEOUT_SECONDS_CONFIG_ID = "timeout_seconds";

export type ClientCapabilityState = {
  readTextFile: boolean;
  writeTextFile: boolean;
  terminal: boolean;
};

export type SessionConfigOption = {
  type: "select";
  id: string;
  name: string;
  category?: string;
  description: string;
  currentValue: string;
  options: Array<{
    value: string;
    name: string;
  }>;
};

export type SessionModeState = {
  currentModeId: string;
  availableModes: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
};

type SessionPresentation = {
  configOptions: SessionConfigOption[];
  modes: SessionModeState;
};

type SessionMetadata = {
  title?: string | null;
  updatedAt?: string | null;
  _meta?: Record<string, unknown>;
};

type SessionUsageSnapshot = {
  size: number;
  used: number;
};

export type SessionSnapshot = SessionPresentation & {
  metadata?: SessionMetadata;
  usage?: SessionUsageSnapshot;
};

export function normalizeClientCapabilities(capabilities?: {
  fs?: { readTextFile?: boolean; writeTextFile?: boolean };
  terminal?: boolean;
}): ClientCapabilityState {
  return {
    readTextFile: capabilities?.fs?.readTextFile === true,
    writeTextFile: capabilities?.fs?.writeTextFile === true,
    terminal: capabilities?.terminal === true,
  };
}

function formatThinkingLevelName(level: string): string {
  switch (level) {
    case "xhigh":
      return "Extra High";
    case "adaptive":
      return "Adaptive";
    default:
      return level.length > 0 ? `${level[0].toUpperCase()}${level.slice(1)}` : "Unknown";
  }
}

function buildThinkingModeDescription(level: string): string | undefined {
  if (level === "adaptive") {
    return "Use the Gateway session default thought level.";
  }
  return undefined;
}

function formatConfigValueName(value: string): string {
  switch (value) {
    case "xhigh":
      return "Extra High";
    default:
      return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : "Unknown";
  }
}

function buildSelectConfigOption(params: {
  id: string;
  name: string;
  description: string;
  currentValue: string;
  values: readonly string[];
  category?: string;
}): SessionConfigOption {
  return {
    type: "select",
    id: params.id,
    name: params.name,
    category: params.category,
    description: params.description,
    currentValue: params.currentValue,
    options: params.values.map((value) => ({
      value,
      name: formatConfigValueName(value),
    })),
  };
}

export type GatewaySessionPresentationRow = {
  key?: string;
  thinkingLevels?: Array<{ id: string }>;
  thinkingLevel?: string;
  effectiveFastMode?: boolean;
  fastMode?: boolean;
  verboseLevel?: string;
  traceLevel?: string;
  reasoningLevel?: string;
  responseUsage?: string;
  elevatedLevel?: string;
  derivedTitle?: string;
  displayName?: string;
  label?: string;
  updatedAt?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  contextTokens?: number;
};

export function buildSessionPresentation(params: {
  row?: GatewaySessionPresentationRow;
  overrides?: Partial<GatewaySessionPresentationRow>;
}): SessionPresentation {
  const row = {
    ...params.row,
    ...params.overrides,
  };
  const BASE_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
  const availableLevelIds: string[] = row.thinkingLevels?.map((level) => level.id) ?? [
    ...BASE_THINKING_LEVELS,
  ];
  const currentModeId = typeof row.thinkingLevel === "string" && row.thinkingLevel.trim()
    ? row.thinkingLevel.trim()
    : "adaptive";
  const currentFastMode = row.effectiveFastMode ?? row.fastMode ?? false;
  if (!availableLevelIds.includes(currentModeId)) {
    availableLevelIds.push(currentModeId);
  }

  const modes: SessionModeState = {
    currentModeId,
    availableModes: availableLevelIds.map((level) => ({
      id: level,
      name: formatThinkingLevelName(level),
      description: buildThinkingModeDescription(level),
    })),
  };

  const configOptions: SessionConfigOption[] = [
    buildSelectConfigOption({
      id: ACP_THOUGHT_LEVEL_CONFIG_ID,
      name: "Thought level",
      category: "thought_level",
      description:
        "Controls how much deliberate reasoning OpenClaw requests from the Gateway model.",
      currentValue: currentModeId,
      values: availableLevelIds,
    }),
    buildSelectConfigOption({
      id: ACP_FAST_MODE_CONFIG_ID,
      name: "Fast mode",
      description: "Controls whether OpenAI sessions use the Gateway fast-mode profile.",
      currentValue: currentFastMode ? "on" : "off",
      values: ["off", "auto", "on"],
    }),
    buildSelectConfigOption({
      id: ACP_VERBOSE_LEVEL_CONFIG_ID,
      name: "Tool verbosity",
      description:
        "Controls how much tool progress and output detail OpenClaw keeps enabled for the session.",
      currentValue: typeof row.verboseLevel === "string" && row.verboseLevel.trim()
        ? row.verboseLevel.trim()
        : "off",
      values: ["off", "on", "full"],
    }),
    buildSelectConfigOption({
      id: ACP_TRACE_LEVEL_CONFIG_ID,
      name: "Plugin trace",
      description: "Controls whether plugin-owned trace lines are shown for the session.",
      currentValue: typeof row.traceLevel === "string" && row.traceLevel.trim()
        ? row.traceLevel.trim()
        : "off",
      values: ["off", "on"],
    }),
    buildSelectConfigOption({
      id: ACP_REASONING_LEVEL_CONFIG_ID,
      name: "Reasoning stream",
      description: "Controls whether reasoning-capable models emit reasoning text for the session.",
      currentValue: typeof row.reasoningLevel === "string" && row.reasoningLevel.trim()
        ? row.reasoningLevel.trim()
        : "off",
      values: ["off", "on", "stream"],
    }),
    buildSelectConfigOption({
      id: ACP_RESPONSE_USAGE_CONFIG_ID,
      name: "Usage detail",
      description:
        "Controls how much usage information OpenClaw attaches to responses for the session.",
      currentValue: typeof row.responseUsage === "string" && row.responseUsage.trim()
        ? row.responseUsage.trim()
        : "off",
      values: ["off", "tokens", "full"],
    }),
    buildSelectConfigOption({
      id: ACP_ELEVATED_LEVEL_CONFIG_ID,
      name: "Elevated actions",
      description: "Controls how aggressively the session allows elevated execution behavior.",
      currentValue: typeof row.elevatedLevel === "string" && row.elevatedLevel.trim()
        ? row.elevatedLevel.trim()
        : "off",
      values: ["off", "on", "ask", "full"],
    }),
  ];

  return { configOptions, modes };
}

export function buildSessionMetadata(params: {
  row?: GatewaySessionPresentationRow;
  sessionKey: string;
}): SessionMetadata {
  const title =
    (typeof params.row?.derivedTitle === "string" && params.row.derivedTitle.trim()) ||
    (typeof params.row?.displayName === "string" && params.row.displayName.trim()) ||
    (typeof params.row?.label === "string" && params.row.label.trim()) ||
    params.sessionKey;
  const updatedAt = params.row?.updatedAt
    ? new Date(params.row.updatedAt).toISOString()
    : null;
  return {
    title,
    updatedAt,
    _meta: {
      key: params.row?.key ?? params.sessionKey,
      kind: "session",
    },
  };
}

export function buildSessionUsageSnapshot(
  row?: GatewaySessionPresentationRow,
): SessionUsageSnapshot | undefined {
  const totalTokens = row?.totalTokens;
  const contextTokens = row?.contextTokens;
  if (
    row?.totalTokensFresh !== true ||
    typeof totalTokens !== "number" ||
    !Number.isFinite(totalTokens) ||
    typeof contextTokens !== "number" ||
    !Number.isFinite(contextTokens) ||
    contextTokens <= 0
  ) {
    return undefined;
  }
  const size = Math.max(0, Math.floor(contextTokens));
  const used = Math.max(0, Math.min(Math.floor(totalTokens), size));
  return { size, used };
}