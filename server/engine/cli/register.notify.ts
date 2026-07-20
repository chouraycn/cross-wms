// registerNotifyCommand: CLI command registration.
// 移植自 openclaw/src/cli/program/register.notify.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

/** Register the notify command(s). */
export function registerNotifyCommand(program: Command): void {
  program
    .command("notify")
    .description("Notification commands")
    .action(() => {
      console.error("notify is not available in cross-wms");
      process.exit(1);
    });
}
