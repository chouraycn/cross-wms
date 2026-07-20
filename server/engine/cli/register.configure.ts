// Configure command registration: interactive configuration wizard.
// 移植自 openclaw/src/cli/program/register.configure.ts
//
// 降级策略：
//  - 原模块依赖 terminal-core/links+theme、commands/configure.shared+commands、
//    cli-utils、runtime。cross-wms 未移植；此处注册命令结构，action 输出
//  "not available in cross-wms"。

import type { Command } from "commander";

/** Register the interactive `configure` command and section filter flag. */
export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Interactive configuration for credentials, channels, gateway, and agent defaults")
    .option(
      "--section <section>",
      "Configuration sections (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .action(() => {
      console.error("configure is not available in cross-wms");
      process.exit(1);
    });
}
