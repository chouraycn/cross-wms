/** Formats /help and /commands output for text and native command-list surfaces. */
// 移植自 openclaw/src/auto-reply/command-status-builders.ts
//
// 降级说明：
//  - 原文件依赖 @openclaw/normalization-core/string-coerce、channels/plugins、
//    config/commands.flags、plugins/commands、skills/types、commands-registry 等，
//    cross-wms 暂未移植部分依赖，这里提供类型契约占位与最小降级实现。
//  - OpenClawConfig 改为从 ../infra/_runtime-stubs.js 导入降级类型
//  - ChatCommandDefinition 复用 ./commands-registry.js（cross-wms 简化版）
//  - CommandCategory 复用 ./commands-registry.types.js
//  - buildHelpMessage 完整移植（静态文本，无外部依赖）
//  - buildCommandsMessage / buildCommandsMessagePaginated 降级为基于已注册命令的最小实现
import type { OpenClawConfig } from "../infra/_runtime-stubs.js";
import type { ChatCommandDefinition } from "./commands-registry.js";
import type { CommandCategory } from "./commands-registry.types.js";
import { listCommands } from "./commands-registry.js";

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  session: "Session",
  options: "Options",
  status: "Status",
  management: "Management",
  media: "Media",
  tools: "Tools",
  docks: "Docks",
};

const CATEGORY_ORDER: CommandCategory[] = [
  "session",
  "options",
  "status",
  "management",
  "media",
  "tools",
  "docks",
];

/** Maps a registered command to its category (降级：简化版无 category 字段，按 scope 推断)。 */
function resolveCommandCategory(command: ChatCommandDefinition): CommandCategory {
  // cross-wms 简化版 ChatCommandDefinition 无 category 字段，降级为按 scope 推断。
  const scope = command.scope;
  if (scope === "session" || scope === "global") {
    return "session";
  }
  return "tools";
}

function groupCommandsByCategory(
  commands: ChatCommandDefinition[],
): Map<CommandCategory, ChatCommandDefinition[]> {
  const grouped = new Map<CommandCategory, ChatCommandDefinition[]>();
  for (const category of CATEGORY_ORDER) {
    grouped.set(category, []);
  }
  for (const command of commands) {
    const category = resolveCommandCategory(command);
    const list = grouped.get(category) ?? [];
    list.push(command);
    grouped.set(category, list);
  }
  return grouped;
}

/** Builds the compact slash-command help text shown by `/help`. */
export function buildHelpMessage(_cfg?: OpenClawConfig): string {
  const lines = ["ℹ️ Help", ""];

  lines.push("Session");
  lines.push("  /new  |  /reset  |  /compact [instructions]  |  /stop");
  lines.push("");

  const optionParts = [
    "/think <level|default>",
    "/model <id>",
    "/fast status|auto|on|off|default",
    "/verbose on|off|full",
    "/trace on|off|raw",
  ];
  lines.push("Options");
  lines.push(`  ${optionParts.join("  |  ")}`);
  lines.push("");

  lines.push("Status");
  lines.push("  /status  |  /tasks  |  /whoami  |  /context");
  lines.push("");

  lines.push("Skills");
  lines.push("  /skill <name> [input]");

  lines.push("");
  lines.push("More: /commands for full list, /tools for available capabilities");

  return lines.join("\n");
}

const COMMANDS_PER_PAGE = 8;

/** Options for rendering `/commands` output for a specific channel surface. */
export type CommandsMessageOptions = {
  page?: number;
  surface?: string;
  forcePaginatedList?: boolean;
};

/** Rendered `/commands` text plus pagination metadata for channel-native lists. */
export type CommandsMessageResult = {
  text: string;
  totalPages: number;
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * Builds `/commands` text, returning only the rendered message body.
 *
 * 降级实现：原文件聚合 plugin commands、skill commands、channel-native 列表元数据。
 * cross-wms 暂未移植 plugin/skill 命令源，这里基于已注册命令构建最小列表。
 */
export function buildCommandsMessage(
  cfg?: OpenClawConfig,
  _skillCommands?: any,
  options?: CommandsMessageOptions,
): string {
  const result = buildCommandsMessagePaginated(cfg, _skillCommands, options);
  return result.text;
}

/**
 * Builds `/commands` text and pagination metadata for surfaces with native list controls.
 *
 * 降级实现：原文件支持分页、channel-native 列表、plugin/skill 命令聚合。
 * cross-wms 暂未移植 channel plugin 与 plugin/skill 命令源，这里基于已注册命令
 * 构建单页列表，保留分页元数据契约。
 */
export function buildCommandsMessagePaginated(
  _cfg?: OpenClawConfig,
  _skillCommands?: any,
  options?: CommandsMessageOptions,
): CommandsMessageResult {
  const page = Math.max(1, options?.page ?? 1);
  const commands = listCommands();
  const grouped = groupCommandsByCategory(commands);

  const lines = ["ℹ️ Slash commands", ""];
  for (const category of CATEGORY_ORDER) {
    const categoryCommands = grouped.get(category) ?? [];
    if (categoryCommands.length === 0) {
      continue;
    }
    const label = CATEGORY_LABELS[category];
    if (lines.length > 1) {
      lines.push("");
    }
    lines.push(label);
    for (const command of categoryCommands) {
      const aliases = command.aliases ?? [];
      const primary = `/${command.name}`;
      const aliasLabel = aliases.length ? ` (${aliases.join(", ")})` : "";
      lines.push(`  ${primary}${aliasLabel} - ${command.description}`);
    }
  }

  const text = lines.join("\n");
  return {
    text,
    totalPages: 1,
    currentPage: page,
    hasNext: false,
    hasPrev: false,
  };
}

export type CommandStatusBuildersExports = {
  buildHelpMessage: typeof buildHelpMessage;
  buildCommandsMessage: typeof buildCommandsMessage;
  buildCommandsMessagePaginated: typeof buildCommandsMessagePaginated;
};
