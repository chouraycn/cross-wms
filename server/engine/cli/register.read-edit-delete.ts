// registerReadEditDeleteCommands: CLI command registration.
// 移植自 openclaw/src/cli/program/register.read-edit-delete.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

/** Register the read-edit-delete command(s). */
export function registerReadEditDeleteCommands(program: Command): void {
  program
    .command("read-edit-delete")
    .description("Read, edit, delete message commands")
    .action(() => {
      console.error("read-edit-delete is not available in cross-wms");
      process.exit(1);
    });
}
