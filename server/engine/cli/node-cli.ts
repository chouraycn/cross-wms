// Public CLI barrel for node subcommand registration.
// 移植自 openclaw/src/cli/node-cli.ts。
//
// 降级策略：
//  - 原模块从 `./node-cli/register.js`（子目录）重新导出 `registerNodeCli`。
//    cross-wms 未移植 `node-cli/` 子目录（含 daemon/register 等）。
//    这里提供 no-op 的 `registerNodeCli` stub，保留函数签名以便未来替换。

import type { Command } from "commander";

/**
 * Register node/device CLI subcommands on the root program.
 *
 * 降级实现：openclaw 的 `node-cli/` 子目录未移植；这里为 no-op stub。
 */
export function registerNodeCli(_program: Command): void {
  // No-op stub. node-cli/ subdirectory (daemon, register) not ported.
}
