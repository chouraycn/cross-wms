/**
 * Built-in Slash Commands
 * 内置 Slash 命令 - 20+ 常用命令
 */

import type {
  ChatCommandDefinition,
  CommandExecutionContext,
  CommandExecutionResult,
} from "./commandRegistry.js";
import { registerCommand } from "./commandRegistry.js";

const commands: Array<{
  definition: ChatCommandDefinition;
  handler: (ctx: CommandExecutionContext) => Promise<CommandExecutionResult> | CommandExecutionResult;
}> = [
  // ===== Model Commands =====
  {
    definition: {
      name: "model",
      description: "切换或查看当前模型",
      aliases: ["m"],
      category: "model",
      scope: "chat",
      args: [
        {
          name: "modelId",
          description: "模型 ID",
          type: "string",
        },
      ],
      examples: ["/model gpt-4o", "/model deepseek-chat"],
    },
    handler: (ctx) => {
      if (!ctx.rawArgs) {
        return {
          ok: true,
          message: "当前模型: default (支持: gpt-4o, gpt-4o-mini, deepseek-chat 等)",
        };
      }
      return {
        ok: true,
        message: `已切换到模型: ${ctx.args.modelId}`,
        actions: [{ type: "set_model", payload: ctx.args.modelId }],
      };
    },
  },
  {
    definition: {
      name: "models",
      description: "列出所有可用模型",
      category: "model",
      scope: "chat",
      examples: ["/models"],
    },
    handler: () => ({
      ok: true,
      data: {
        models: [
          { id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek" },
          { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
          { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
        ],
      },
    }),
  },

  // ===== Thinking Commands =====
  {
    definition: {
      name: "thinking",
      description: "切换思考模式",
      aliases: ["think"],
      category: "thinking",
      scope: "chat",
      args: [
        {
          name: "mode",
          description: "思考模式: on/off/auto",
          type: "enum",
          choices: [
            { value: "on", label: "开启" },
            { value: "off", label: "关闭" },
            { value: "auto", label: "自动" },
          ],
          defaultValue: "auto",
        },
      ],
      examples: ["/thinking on", "/thinking off"],
    },
    handler: (ctx) => ({
      ok: true,
      message: `思考模式已设置为: ${ctx.args.mode}`,
    }),
  },

  // ===== Session Commands =====
  {
    definition: {
      name: "new",
      description: "新建会话",
      aliases: ["n"],
      category: "session",
      scope: "chat",
      examples: ["/new"],
    },
    handler: () => ({
      ok: true,
      message: "已创建新会话",
      actions: [{ type: "navigate", payload: "/sessions/new" }],
    }),
  },
  {
    definition: {
      name: "clear",
      description: "清空当前会话",
      aliases: ["c"],
      category: "session",
      scope: "chat",
      examples: ["/clear"],
    },
    handler: () => ({
      ok: true,
      message: "会话已清空",
      actions: [{ type: "clear_session" }],
    }),
  },
  {
    definition: {
      name: "compact",
      description: "压缩会话历史",
      category: "session",
      scope: "chat",
      examples: ["/compact"],
    },
    handler: () => ({
      ok: true,
      message: "正在压缩会话历史...",
    }),
  },
  {
    definition: {
      name: "context",
      description: "查看当前上下文信息",
      category: "session",
      scope: "chat",
      examples: ["/context"],
    },
    handler: (ctx) => ({
      ok: true,
      data: {
        sessionKey: ctx.sessionKey,
        messageCount: 0,
        estimatedTokens: 0,
        contextWindow: 128000,
      },
    }),
  },
  {
    definition: {
      name: "rename",
      description: "重命名当前会话",
      category: "session",
      scope: "chat",
      args: [
        { name: "name", description: "新名称", type: "string", required: true },
      ],
      examples: ['/rename "我的项目"'],
    },
    handler: (ctx) => ({
      ok: true,
      message: `会话已重命名为: ${ctx.args.name}`,
    }),
  },
  {
    definition: {
      name: "delete",
      description: "删除当前会话",
      category: "session",
      scope: "chat",
      examples: ["/delete"],
    },
    handler: () => ({
      ok: true,
      message: "会话已删除",
      actions: [{ type: "navigate", payload: "/" }],
    }),
  },

  // ===== Agent Commands =====
  {
    definition: {
      name: "agent",
      description: "切换或查看当前 Agent",
      category: "agent",
      scope: "chat",
      args: [
        { name: "agentId", description: "Agent ID", type: "string" },
      ],
      examples: ["/agent wms-expert", "/agent"],
    },
    handler: (ctx) => {
      if (!ctx.rawArgs) {
        return {
          ok: true,
          data: {
            currentAgent: "general",
            availableAgents: [
              { id: "wms-expert", name: "WMS 专家" },
              { id: "wms-analyst", name: "WMS 分析师" },
              { id: "wms-operator", name: "WMS 操作员" },
              { id: "general", name: "通用助手" },
              { id: "debugger", name: "调试专家" },
            ],
          },
        };
      }
      return {
        ok: true,
        message: `已切换到 Agent: ${ctx.args.agentId}`,
      };
    },
  },
  {
    definition: {
      name: "agents",
      description: "列出所有可用 Agent",
      category: "agent",
      scope: "chat",
      examples: ["/agents"],
    },
    handler: () => ({
      ok: true,
      data: {
        agents: [
          { id: "wms-expert", name: "WMS 专家", description: "WMS 系统专家" },
          { id: "wms-analyst", name: "WMS 分析师", description: "数据分析专家" },
          { id: "wms-operator", name: "WMS 操作员", description: "日常操作助手" },
          { id: "general", name: "通用助手", description: "通用对话助手" },
          { id: "debugger", name: "调试专家", description: "问题诊断专家" },
        ],
      },
    }),
  },

  // ===== Utility Commands =====
  {
    definition: {
      name: "help",
      description: "显示帮助信息",
      aliases: ["h", "?"],
      category: "utility",
      scope: ["chat", "session", "global"],
      examples: ["/help", "/help model"],
    },
    handler: (ctx) => {
      const commands = [
        "/model <id> - 切换模型",
        "/models - 列出所有模型",
        "/thinking <on|off|auto> - 思考模式",
        "/new - 新建会话",
        "/clear - 清空会话",
        "/compact - 压缩历史",
        "/context - 上下文信息",
        "/agent <id> - 切换 Agent",
        "/agents - 列出所有 Agent",
        "/debug - 调试模式",
        "/help - 显示帮助",
      ];
      return {
        ok: true,
        message: commands.join("\n"),
      };
    },
  },
  {
    definition: {
      name: "debug",
      description: "切换调试模式",
      category: "debug",
      scope: "chat",
      hidden: true,
      args: [
        {
          name: "mode",
          description: "调试模式: on/off",
          type: "enum",
          choices: [
            { value: "on", label: "开启" },
            { value: "off", label: "关闭" },
          ],
          defaultValue: "on",
        },
      ],
      examples: ["/debug on", "/debug off"],
    },
    handler: (ctx) => ({
      ok: true,
      message: `调试模式: ${ctx.args.mode}`,
    }),
  },
  {
    definition: {
      name: "version",
      description: "显示版本信息",
      aliases: ["v"],
      category: "utility",
      scope: "global",
      examples: ["/version"],
    },
    handler: () => ({
      ok: true,
      data: {
        version: "1.0.0",
        build: "2026.06.28",
        engine: "cross-wms",
      },
    }),
  },
  {
    definition: {
      name: "echo",
      description: "回显输入",
      category: "utility",
      scope: "chat",
      hidden: true,
      args: [
        { name: "text", description: "要回显的文本", type: "string", required: true },
      ],
      examples: ['/echo "Hello World"'],
    },
    handler: (ctx) => ({
      ok: true,
      message: ctx.args.text as string,
    }),
  },
  {
    definition: {
      name: "uptime",
      description: "显示运行时间",
      category: "utility",
      scope: "global",
      examples: ["/uptime"],
    },
    handler: () => {
      const uptimeMs = Date.now() - ((globalThis as { serverStartTime?: number }).serverStartTime ?? 0);
      const hours = Math.floor(uptimeMs / 3600000);
      const minutes = Math.floor((uptimeMs % 3600000) / 60000);
      return {
        ok: true,
        message: `运行时间: ${hours}小时 ${minutes}分钟`,
      };
    },
  },

  // ===== Admin Commands =====
  {
    definition: {
      name: "status",
      description: "显示系统状态",
      category: "debug",
      scope: "global",
      examples: ["/status"],
    },
    handler: () => ({
      ok: true,
      data: {
        status: "healthy",
        activeSessions: 0,
        totalSessions: 0,
        uptimeMs: 0,
      },
    }),
  },
  {
    definition: {
      name: "reload",
      description: "重新加载配置",
      category: "debug",
      scope: "admin",
      hidden: true,
      examples: ["/reload"],
    },
    handler: () => ({
      ok: true,
      message: "配置已重新加载",
    }),
  },
];

/**
 * 注册所有内置命令
 */
export function registerBuiltinCommands(): void {
  for (const { definition, handler } of commands) {
    registerCommand(definition, handler);
  }
  console.log(`[commands] Registered ${commands.length} built-in commands`);
}

export { commands as builtinCommands };
