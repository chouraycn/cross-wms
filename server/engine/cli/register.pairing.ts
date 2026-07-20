// registerPairingCommand: CLI command registration.
// 移植自 openclaw/src/cli/program/register.pairing.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

/** Register the pairing command(s). */
export function registerPairingCommand(program: Command): void {
  program
    .command("pairing")
    .description("Device pairing commands")
    .action(() => {
      console.error("pairing is not available in cross-wms");
      process.exit(1);
    });
}
