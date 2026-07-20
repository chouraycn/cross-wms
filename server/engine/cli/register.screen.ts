// registerScreenCommands: CLI command registration.
// 移植自 openclaw/src/cli/program/register.screen.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

/** Register the screen command(s). */
export function registerScreenCommands(program: Command): void {
  program
    .command("screen")
    .description("Screen capture commands for nodes")
    .action(() => {
      console.error("screen is not available in cross-wms");
      process.exit(1);
    });
}
