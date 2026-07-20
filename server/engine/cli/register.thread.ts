// registerThreadCommand: CLI command registration.
// 移植自 openclaw/src/cli/program/register.thread.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

/** Register the thread command(s). */
export function registerThreadCommand(program: Command): void {
  program
    .command("thread")
    .description("Thread commands")
    .action(() => {
      console.error("thread is not available in cross-wms");
      process.exit(1);
    });
}
