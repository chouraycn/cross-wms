// 核心 CLI 根命令 descriptor catalog，用于 help 占位符与 lazy registration。
// 移植自 openclaw/src/cli/program/core-command-descriptors.ts。
//
// 降级策略：
//  - 原模块定义 19 个核心根命令的 descriptor。
//  - cross-wms 暂未移植完整的 CLI 注册流程；此处保留原始 descriptor 列表，
//    以便 argv 解析与 help 检测能够识别已知命令名。
//  - 完整注册流程由 cross-wms 自有的命令注册路径处理。

import { defineCommandDescriptorCatalog } from "./command-descriptor-utils.js";
import type { NamedCommandDescriptor } from "./command-group-descriptors.js";

/** 核心 CLI 拥有的根命令 descriptor 形状。 */
export type CoreCliCommandDescriptor = NamedCommandDescriptor;

const coreCliCommandCatalog = defineCommandDescriptorCatalog([
  {
    name: "crestodian",
    description: "Open the interactive setup and repair assistant",
    hasSubcommands: false,
  },
  {
    name: "setup",
    description: "Initialize local config and an agent workspace",
    hasSubcommands: false,
  },
  {
    name: "onboard",
    description: "Interactive onboarding for gateway, workspace, and skills",
    hasSubcommands: false,
  },
  {
    name: "configure",
    description: "Interactive configuration for credentials, channels, gateway, and agent defaults",
    hasSubcommands: false,
  },
  {
    name: "config",
    description:
      "Non-interactive config helpers (get/set/unset/file/validate). Default: starts guided setup.",
    hasSubcommands: true,
  },
  {
    name: "backup",
    description: "Create and verify local backup archives for OpenClaw state",
    hasSubcommands: true,
  },
  {
    name: "migrate",
    description: "Import state from another agent system",
    hasSubcommands: true,
  },
  {
    name: "doctor",
    description: "Diagnose and repair config, Gateway, plugin, and channel problems",
    hasSubcommands: false,
  },
  {
    name: "dashboard",
    description: "Open the Control UI with your current token",
    hasSubcommands: false,
  },
  {
    name: "reset",
    description: "Reset local config/state (keeps the CLI installed)",
    hasSubcommands: false,
  },
  {
    name: "uninstall",
    description: "Uninstall the gateway service + local data (CLI remains)",
    hasSubcommands: false,
  },
  {
    name: "message",
    description: "Send, read, and manage channel messages",
    hasSubcommands: true,
  },
  {
    name: "mcp",
    description: "Manage OpenClaw MCP config and channel bridge",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "transcripts",
    description: "Inspect stored transcripts",
    hasSubcommands: true,
  },
  {
    name: "agent",
    description: "Run one agent turn via the Gateway",
    hasSubcommands: false,
  },
  {
    name: "agents",
    description: "Manage isolated agents (workspaces, auth, routing)",
    hasSubcommands: true,
  },
  {
    name: "status",
    description: "Show Gateway, channel, model, and recent-session status",
    hasSubcommands: false,
  },
  {
    name: "health",
    description: "Fetch detailed health from the running Gateway",
    hasSubcommands: false,
  },
  {
    name: "sessions",
    description: "List stored conversation sessions",
    hasSubcommands: true,
  },
  {
    name: "commitments",
    description: "List and manage inferred follow-up commitments",
    hasSubcommands: true,
  },
  {
    name: "tasks",
    description: "Inspect durable background tasks and flows",
    hasSubcommands: true,
  },
] as const satisfies ReadonlyArray<CoreCliCommandDescriptor>);

/** 核心 CLI 表面的静态根命令 descriptor。 */
export const CORE_CLI_COMMAND_DESCRIPTORS = coreCliCommandCatalog.descriptors;

/** 按 help/registration 顺序返回核心根命令 descriptor。 */
export function getCoreCliCommandDescriptors(): ReadonlyArray<CoreCliCommandDescriptor> {
  return coreCliCommandCatalog.getDescriptors();
}

/** 返回所有核心根命令的 name。 */
export function getCoreCliCommandNames(): string[] {
  return coreCliCommandCatalog.getNames();
}

/** 返回拥有子命令的核心根命令。 */
export function getCoreCliCommandsWithSubcommands(): string[] {
  return coreCliCommandCatalog.getCommandsWithSubcommands();
}

/** 返回其父 action 应默认显示 help 的核心根命令。 */
export function getCoreCliParentDefaultHelpCommands(): string[] {
  return coreCliCommandCatalog.getParentDefaultHelpCommands();
}
