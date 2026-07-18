// Cron CLI barrel re-exporting from the cron-cli/ subdirectory.
// 移植自 openclaw/src/cli/cron-cli.ts。
//
// 降级策略：原模块从 `./cron-cli/register.js`（子目录）重新导出 `registerCronCli`。
// cross-wms 未移植 `cron-cli/` 子目录（含 register.* / shared / schedule-options 等）。
// 这里提供 no-op 的 `registerCronCli` stub，保留函数签名。

import type { Command } from "commander";

/**
 * Register the `cron` CLI command and subcommands.
 *
 * 降级实现：openclaw 的 `cron-cli/` 子目录未移植；这里为 no-op stub。
 */
export function registerCronCli(_program: Command): void {
  // No-op stub. cron-cli/ subdirectory not ported.
}
