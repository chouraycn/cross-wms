// registerCronEditCommand: CLI command registration.
// 移植自 openclaw/src/cli/program/register.cron-edit.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

/** Register the edit command(s). */
export function registerCronEditCommand(program: Command): void {
  program
    .command("edit")
    .description("Edit a cron job")
    .action(() => {
      console.error("edit is not available in cross-wms");
      process.exit(1);
    });
}
