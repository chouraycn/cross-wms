/**
 * logs 命令
 * 日志查看与过滤 (tail/search/levels)
 *
 * 参考 openclaw logs-cli，提供日志查看与过滤能力。
 * 使用本地内存日志缓冲模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type LogsOptions = {
  json?: boolean;
  limit?: string;
  level?: string;
  follow?: boolean;
};

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  source: string;
  message: string;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 模拟日志缓冲 */
const LOG_BUFFER: LogEntry[] = [
  { ts: "2025-01-15T10:00:00Z", level: "info", source: "gateway", message: "Gateway started on port 7331" },
  { ts: "2025-01-15T10:00:01Z", level: "info", source: "engine", message: "Engine initialized with 3 agents" },
  { ts: "2025-01-15T10:00:05Z", level: "debug", source: "dao", message: "Database connection established" },
  { ts: "2025-01-15T10:01:00Z", level: "warn", source: "gateway", message: "Slow request: /api/chat took 2500ms" },
  { ts: "2025-01-15T10:02:00Z", level: "error", source: "engine", message: "Agent failed: model timeout" },
  { ts: "2025-01-15T10:03:00Z", level: "info", source: "cron", message: "Cron job 'snapshot' completed" },
  { ts: "2025-01-15T10:05:00Z", level: "warn", source: "memory", message: "Memory usage above 80%" },
];

function filterLogs(options: LogsOptions & { source?: string; query?: string }): LogEntry[] {
  let entries = [...LOG_BUFFER];
  const minLevel = options.level ? (LEVEL_ORDER[options.level as LogLevel] ?? 0) : 0;
  entries = entries.filter((e) => LEVEL_ORDER[e.level] >= minLevel);
  if (options.source) {
    entries = entries.filter((e) => e.source === options.source);
  }
  if (options.query) {
    const q = options.query.toLowerCase();
    entries = entries.filter((e) => e.message.toLowerCase().includes(q));
  }
  const limit = options.limit ? parseInt(options.limit, 10) : 50;
  return entries.slice(-limit);
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatLogEntries(entries: LogEntry[]): string {
  if (entries.length === 0) {
    return "  无日志记录";
  }
  const lines: string[] = [];
  for (const e of entries) {
    const icon = e.level === "error" ? "✗" : e.level === "warn" ? "!" : e.level === "debug" ? "·" : "i";
    lines.push(`  ${e.ts} ${icon} [${e.level.padEnd(5)}] [${e.source.padEnd(8)}] ${e.message}`);
  }
  return lines.join("\n");
}

export function registerLogsCommand(program: Command): void {
  const logsCmd = program
    .command("logs")
    .description("日志查看与过滤 (tail/search/levels)");

  logsCmd
    .command("tail")
    .description("查看最近的日志")
    .option("-n, --limit <n>", "显示条数", "50")
    .option("--level <level>", "最低日志级别 (debug/info/warn/error)")
    .option("--source <source>", "按来源过滤")
    .option("--json", "JSON 输出格式")
    .action((options: LogsOptions & { source?: string }) => {
      const entries = filterLogs(options);
      if (options.json) {
        logger.info(formatJsonOutput(entries));
      } else {
        logger.info(formatLogEntries(entries));
      }
    });

  logsCmd
    .command("search <query>")
    .description("搜索日志内容")
    .option("-n, --limit <n>", "显示条数", "50")
    .option("--level <level>", "最低日志级别")
    .option("--source <source>", "按来源过滤")
    .option("--json", "JSON 输出格式")
    .action((query: string, options: LogsOptions & { source?: string }) => {
      const entries = filterLogs({ ...options, query });
      if (options.json) {
        logger.info(formatJsonOutput(entries));
      } else {
        logger.info(`搜索 "${query}" 结果 (${entries.length} 条):`);
        logger.info(formatLogEntries(entries));
      }
    });

  logsCmd
    .command("levels")
    .description("列出可用日志级别")
    .action(() => {
      logger.info("可用日志级别:");
      for (const level of Object.keys(LEVEL_ORDER)) {
        logger.info(`  ${level} (${LEVEL_ORDER[level as LogLevel]})`);
      }
    });

  // 默认 tail
  logsCmd
    .option("-n, --limit <n>", "显示条数", "50")
    .option("--level <level>", "最低日志级别")
    .option("--source <source>", "按来源过滤")
    .option("--json", "JSON 输出格式")
    .action((options: LogsOptions & { source?: string }) => {
      const entries = filterLogs(options);
      if (options.json) {
        logger.info(formatJsonOutput(entries));
      } else {
        logger.info(formatLogEntries(entries));
      }
    });
}
