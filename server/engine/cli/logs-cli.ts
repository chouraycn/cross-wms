// Gateway logs CLI with RPC tailing, local file fallback, and systemd journal fallback.
// 移植自 openclaw/src/cli/logs-cli.ts。
//
// 降级策略：
//  - 原模块依赖大量未移植模块：`@openclaw/normalization-core/string-coerce`、
//    `../../packages/gateway-protocol/src/client-info.js`、
//    `../../packages/gateway-protocol/src/connect-error-details.js`、
//    `../../packages/terminal-core/src/*`（links/progress-line/stream-writer/theme）、
//    `../gateway/call.js`、`../gateway/net.js`、`../infra/backoff.js`、
//    `../infra/errors.js`、`../infra/parse-finite-number.js`、
//    `../logging/log-tail.js`、`../logging/parse-log-line.js`、
//    `../logging/redact.js`、`../logging/timestamps.js`。
//  - 这里仅保留 `registerLogsCli` 函数签名并注册 `logs` 命令占位，
//    action 抛出 "not supported" 错误，保留函数签名以便未来替换为正式实现。

import type { Command } from "commander";

/**
 * Register the `logs` CLI command.
 *
 * 降级实现：openclaw 的日志相关模块（gateway/call、logging/*、terminal-core/*）
 * 未移植；这里仅注册命令占位，action 抛出 "not supported" 错误。
 */
export function registerLogsCli(program: Command): void {
  const logs = program
    .command("logs")
    .description("Tail gateway file logs via RPC")
    .option("--limit <n>", "Max lines to return", "200")
    .option("--max-bytes <n>", "Max bytes to read", "250000")
    .option("--follow", "Follow log output", false)
    .option("--interval <ms>", "Polling interval in ms", "1000")
    .option("--json", "Emit JSON log lines", false)
    .option("--plain", "Plain text output (no ANSI styling)", false)
    .option("--no-color", "Disable ANSI colors")
    .option("--local-time", "Display timestamps in local timezone (default)", false)
    .option("--utc", "Display timestamps in UTC", false);

  logs.action(() => {
    throw new Error(
      "openclaw logs: not supported in stub mode (gateway/call, logging/*, terminal-core/* not ported).",
    );
  });
}

/**
 * Format a log timestamp value.
 *
 * 降级实现：openclaw 的 `logging/timestamps.js` 未移植；这里返回原值或空字符串。
 */
export function formatLogTimestamp(
  value?: string,
  _mode: "pretty" | "plain" = "plain",
  _localTime = true,
): string {
  if (!value) {
    return "";
  }
  return value;
}
