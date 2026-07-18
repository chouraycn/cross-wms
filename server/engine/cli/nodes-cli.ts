// Public barrel for node-management CLI registration.
// 移植自 openclaw/src/cli/nodes-cli.ts。
//
// 降级策略：
//  - 原模块从 `./nodes-cli/register.js`（子目录）重新导出 `registerNodesCli`。
//    cross-wms 未移植 `nodes-cli/` 子目录（含 RPC runtime、pairing render、
//    camera/screen/notify/push/location/invoke/status 子命令）。
//    这里提供 no-op 的 `registerNodesCli` stub，保留函数签名以便未来替换。

import type { Command } from "commander";

/**
 * Register nodes CLI subcommands (camera/screen/notify/push/pairing/etc.) on the program.
 *
 * 降级实现：openclaw 的 `nodes-cli/` 子目录未移植；这里为 no-op stub。
 */
export function registerNodesCli(_program: Command): void {
  // No-op stub. nodes-cli/ subdirectory (rpc runtime, pairing-render, register.*) not ported.
}
