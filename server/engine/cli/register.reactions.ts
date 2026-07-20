// registerReactionsCommand: CLI command registration.
// 移植自 openclaw/src/cli/program/register.reactions.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

/** Register the reactions command(s). */
export function registerReactionsCommand(program: Command): void {
  program
    .command("reactions")
    .description("Message reaction commands")
    .action(() => {
      console.error("reactions is not available in cross-wms");
      process.exit(1);
    });
}
