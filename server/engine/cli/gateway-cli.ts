// Public CLI barrel for gateway subcommand registration.
// 移植自 openclaw/src/cli/gateway-cli.ts。
//
// 降级策略：
//  - 原模块仅 re-export ./gateway-cli/register.js 的 registerGatewayCli。
//    cross-wms 未移植 gateway-cli/ 子目录；降级为提供 no-op 的 registerGatewayCli。

import type { Command } from "commander";

/** Register all gateway CLI subcommands on the root program. */
export async function registerGatewayCli(_program: Command): Promise<void> {
  // 降级 no-op：openclaw 的 gateway-cli/register.js 未移植。
}
