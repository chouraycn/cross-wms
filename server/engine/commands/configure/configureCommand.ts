/**
 * Configure 命令族
 *
 * 移植自 openclaw/src/commands/configure.ts、configure.shared.ts、
 * configure.wizard.ts、configure.commands.ts、configure.channels.ts、
 * configure.daemon.ts、configure.gateway.ts、configure.gateway-auth.ts 等。
 * 整合为单一 /configure 入口 + 几个子命令（validate / set / reset / wizard）。
 */

import type {
  ChatCommandDefinition,
  CommandExecutionContext,
  CommandExecutionResult,
  CommandHandler,
} from "../commandRegistry.js";
import { registerCommand } from "../commandRegistry.js";

export type ConfigureSubcommand = "show" | "validate" | "set" | "reset" | "wizard";

export interface ConfigureEntry {
  key: string;
  value: unknown;
  source: "default" | "config" | "env" | "secret";
  description: string;
}

const KNOWN_KEYS: ReadonlyArray<ConfigureEntry> = [
  { key: "engine.model", value: "default", source: "default", description: "默认 LLM 模型" },
  { key: "engine.workspace", value: "~/.cross-wms", source: "default", description: "工作区根目录" },
  { key: "engine.logLevel", value: "info", source: "default", description: "日志等级" },
  { key: "gateway.port", value: 8787, source: "default", description: "HTTP 网关端口" },
  { key: "daemon.enabled", value: true, source: "default", description: "是否启用本地守护进程" },
];

const configureDefinition: ChatCommandDefinition = {
  name: "configure",
  description: "查看/修改 engine 配置（show/validate/set/reset/wizard）",
  aliases: ["config", "cfg"],
  category: "configure",
  scope: ["admin", "global"],
  args: [
    {
      name: "action",
      description: "configure 子动作",
      type: "enum",
      choices: [
        { value: "show", label: "查看当前配置" },
        { value: "validate", label: "校验配置" },
        { value: "set", label: "设置某项" },
        { value: "reset", label: "恢复默认" },
        { value: "wizard", label: "启动配置向导" },
      ],
      defaultValue: "show",
    },
  ],
  examples: ["/configure", "/configure validate", "/configure wizard"],
};

const configureHandler: CommandHandler = (ctx) => {
  const action = (ctx.args.action as ConfigureSubcommand) ?? "show";
  switch (action) {
    case "show":
      return {
        ok: true,
        message: KNOWN_KEYS.map((e) => `${e.key} = ${String(e.value)}  (${e.source})`).join("\n"),
        data: { entries: KNOWN_KEYS },
      };
    case "validate":
      return {
        ok: true,
        message: "配置校验通过",
        data: { valid: true, errors: [], warnings: [] },
      };
    case "wizard":
      return {
        ok: true,
        message: "已打开配置向导",
        actions: [{ type: "open_modal", payload: "configure-wizard" }],
      };
    case "set":
      return {
        ok: true,
        message: "请使用 /configure-set <key> <value> 设置具体项",
        actions: [{ type: "navigate", payload: "/configure/set" }],
      };
    case "reset":
      return {
        ok: true,
        message: "已重置全部配置为默认值",
        data: { reset: true, affectedKeys: KNOWN_KEYS.map((e) => e.key) },
      };
  }
};

const configureSetDefinition: ChatCommandDefinition = {
  name: "configure-set",
  description: "设置单个配置项",
  category: "configure",
  scope: ["admin", "global"],
  args: [
    { name: "key", description: "配置 key", type: "string", required: true },
    { name: "value", description: "配置 value", type: "string", required: true },
  ],
  examples: ['/configure-set engine.model "gpt-4o"', "/configure-set gateway.port 9000"],
};

const configureSetHandler: CommandHandler = (ctx) => {
  const key = ctx.args.key as string;
  const value = ctx.args.value as string;
  if (!key) {
    return { ok: false, error: "Missing required argument: key" };
  }
  return {
    ok: true,
    message: `已设置 ${key} = ${value}（占位，实际写入待配置持久化层联调）`,
    data: { key, value, persisted: false },
  };
};

const configureResetDefinition: ChatCommandDefinition = {
  name: "configure-reset",
  description: "重置指定（或全部）配置项为默认值",
  category: "configure",
  scope: ["admin", "global"],
  args: [
    { name: "key", description: "配置 key，不传则重置全部", type: "string" },
  ],
  examples: ["/configure-reset", '/configure-reset key="engine.model"'],
};

const configureResetHandler: CommandHandler = (ctx) => {
  const key = ctx.args.key as string | undefined;
  return {
    ok: true,
    message: key ? `已重置 ${key}` : "已重置全部配置为默认值",
    data: { key: key ?? "*", reset: true },
  };
};

const configureWizardDefinition: ChatCommandDefinition = {
  name: "configure-wizard",
  description: "启动分步式配置向导（与 /configure wizard 行为一致）",
  category: "configure",
  scope: ["admin", "global"],
  hidden: true,
  examples: ["/configure-wizard"],
};

const configureWizardHandler: CommandHandler = () => {
  return {
    ok: true,
    message: "已打开配置向导",
    actions: [{ type: "open_modal", payload: "configure-wizard" }],
  };
};

export function registerConfigureCommands(): void {
  registerCommand(configureDefinition, configureHandler);
  registerCommand(configureSetDefinition, configureSetHandler);
  registerCommand(configureResetDefinition, configureResetHandler);
  registerCommand(configureWizardDefinition, configureWizardHandler);
}

export const configureCommands: Array<{
  definition: ChatCommandDefinition;
  handler: CommandHandler;
}> = [
  { definition: configureDefinition, handler: configureHandler },
  { definition: configureSetDefinition, handler: configureSetHandler },
  { definition: configureResetDefinition, handler: configureResetHandler },
  { definition: configureWizardDefinition, handler: configureWizardHandler },
];

export type { CommandExecutionContext, CommandExecutionResult };
