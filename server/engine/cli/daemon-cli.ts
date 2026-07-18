// Daemon CLI barrel re-exporting from the daemon-cli/ subdirectory.
// 移植自 openclaw/src/cli/daemon-cli.ts。
//
// 降级策略：原模块从 `./daemon-cli/register.js`（子目录）重新导出
// `registerDaemonCli`。cross-wms 未移植 `daemon-cli/` 子目录
// （含 install/lifecycle/probe/status/shared/types 等）。
// 这里提供 no-op 的 `registerDaemonCli` stub，保留函数签名。

import type { Command } from "commander";

/**
 * Register the `daemon` CLI command and subcommands (install/start/stop/status/etc.).
 *
 * 降级实现：openclaw 的 `daemon-cli/` 子目录未移植；这里为 no-op stub。
 */
export function registerDaemonCli(_program: Command): void {
  // No-op stub. daemon-cli/ subdirectory not ported.
}
