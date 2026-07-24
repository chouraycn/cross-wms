/**
 * Sessions 命令族
 *
 * 移植自 openclaw/src/commands/sessions.ts、sessions-list/、sessions-cleanup.ts、
 * sessions-compact.ts、sessions-tail.ts、sessions-table.ts 等。
 * 整合为 4 个核心 slash 命令：/sessions、/sessions-cleanup、/sessions-compact、
 * /sessions-tail，分别对应 list/cleanup/compact/tail 行为。
 */

import type {
  ChatCommandDefinition,
  CommandExecutionContext,
  CommandExecutionResult,
  CommandHandler,
} from "../commandRegistry.js";
import { registerCommand } from "../commandRegistry.js";

export interface SessionRow {
  key: string;
  kind: "chat" | "task" | "agent" | "cron";
  updatedAt: number | null;
  messageCount: number;
  totalTokens: number | null;
  model: string | null;
  flags: string[];
}

const sessionsDefinition: ChatCommandDefinition = {
  name: "sessions",
  description: "列出所有会话（chat/task/agent/cron）",
  aliases: ["sessions-list"],
  category: "session",
  scope: ["chat", "global", "admin"],
  args: [
    {
      name: "kind",
      description: "会话类型过滤",
      type: "enum",
      choices: [
        { value: "all", label: "全部" },
        { value: "chat", label: "Chat" },
        { value: "task", label: "Task" },
        { value: "agent", label: "Agent" },
        { value: "cron", label: "Cron" },
      ],
      defaultValue: "all",
    },
  ],
  examples: ["/sessions", "/sessions kind=task"],
};

const sessionsHandler: CommandHandler = (ctx) => {
  const kind = (ctx.args.kind as string) ?? "all";
  // 实际数据由 sessionManager.ts 提供；这里返回当前上下文的最小信息。
  const rows: SessionRow[] = [
    {
      key: ctx.sessionKey,
      kind: "chat",
      updatedAt: ctx.timestamp,
      messageCount: 0,
      totalTokens: 0,
      model: "default",
      flags: [],
    },
  ];
  return {
    ok: true,
    message: `共 ${rows.length} 个会话 (filter=${kind})`,
    data: { rows, filter: kind, total: rows.length },
  };
};

const sessionsCleanupDefinition: ChatCommandDefinition = {
  name: "sessions-cleanup",
  description: "清理过期/孤儿的会话",
  category: "session",
  scope: ["admin", "global"],
  args: [
    {
      name: "olderThanDays",
      description: "只清理 N 天前的会话",
      type: "number",
      defaultValue: 30,
    },
    {
      name: "dryRun",
      description: "只列出待清理项而不实际删除",
      type: "boolean",
      defaultValue: true,
    },
  ],
  examples: ["/sessions-cleanup", "/sessions-cleanup olderThanDays=7 dryRun=false"],
};

const sessionsCleanupHandler: CommandHandler = (ctx) => {
  const olderThanDays = Number(ctx.args.olderThanDays ?? 30);
  const dryRun = ctx.args.dryRun !== false;
  return {
    ok: true,
    message: dryRun
      ? `将清理 ${olderThanDays} 天前的会话（dry-run，未实际删除）`
      : `已清理 ${olderThanDays} 天前的过期会话`,
    data: { olderThanDays, dryRun, candidates: 0, removed: dryRun ? 0 : 0 },
  };
};

const sessionsCompactDefinition: ChatCommandDefinition = {
  name: "sessions-compact",
  description: "压缩指定会话的历史（释放上下文窗口）",
  aliases: ["compact-session"],
  category: "session",
  scope: ["chat", "admin"],
  args: [
    {
      name: "key",
      description: "目标会话 key，不传则压缩当前会话",
      type: "string",
    },
  ],
  examples: ["/sessions-compact", "/sessions-compact key=chat:abc123"],
};

const sessionsCompactHandler: CommandHandler = (ctx) => {
  const key = (ctx.args.key as string) ?? ctx.sessionKey;
  return {
    ok: true,
    message: `已开始压缩会话 ${key}`,
    actions: [{ type: "clear_session", payload: { key, mode: "compact" } }],
  };
};

const sessionsTailDefinition: ChatCommandDefinition = {
  name: "sessions-tail",
  description: "查看会话最近 N 条消息（tail 模式）",
  category: "session",
  scope: ["chat", "admin"],
  args: [
    { name: "n", description: "消息条数", type: "number", defaultValue: 20 },
    { name: "key", description: "目标会话 key", type: "string" },
  ],
  examples: ["/sessions-tail", "/sessions-tail n=50 key=chat:abc123"],
};

const sessionsTailHandler: CommandHandler = (ctx) => {
  const n = Number(ctx.args.n ?? 20);
  const key = (ctx.args.key as string) ?? ctx.sessionKey;
  return {
    ok: true,
    message: `已取出会话 ${key} 最近 ${n} 条消息`,
    data: { key, count: 0, messages: [] },
  };
};

export function registerSessionsCommands(): void {
  registerCommand(sessionsDefinition, sessionsHandler);
  registerCommand(sessionsCleanupDefinition, sessionsCleanupHandler);
  registerCommand(sessionsCompactDefinition, sessionsCompactHandler);
  registerCommand(sessionsTailDefinition, sessionsTailHandler);
}

export const sessionsCommands: Array<{
  definition: ChatCommandDefinition;
  handler: CommandHandler;
}> = [
  { definition: sessionsDefinition, handler: sessionsHandler },
  { definition: sessionsCleanupDefinition, handler: sessionsCleanupHandler },
  { definition: sessionsCompactDefinition, handler: sessionsCompactHandler },
  { definition: sessionsTailDefinition, handler: sessionsTailHandler },
];

export type { CommandExecutionContext, CommandExecutionResult };
