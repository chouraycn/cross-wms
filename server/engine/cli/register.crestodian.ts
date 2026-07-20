// Crestodian command registration: setup/repair assistant entrypoint exposed from the root CLI.
// 移植自 openclaw/src/cli/program/register.crestodian.ts
//
// 降级策略：
//  - 原模块依赖 terminal-core/theme、crestodian/crestodian、runtime、cli-utils、help-format。
//    cross-wms 未移植这些模块；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

/** Register the Crestodian helper command and its one-shot request flags. */
export function registerCrestodianCommand(program: Command): void {
  program
    .command("crestodian")
    .description("Open the ring-zero setup and repair helper")
    .option("-m, --message <text>", "Run one Crestodian request")
    .option("--yes", "Approve persistent config writes for this request", false)
    .option("--json", "Output startup overview as JSON", false)
    .action(() => {
      console.error("crestodian is not available in cross-wms");
      process.exit(1);
    });
}
