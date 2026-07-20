// Migrate command registration: import state from another agent system.
// 移植自 openclaw/src/cli/program/register.migrate.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块（terminal-core, runtime, cli-utils 等）。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

function notAvailable(name: string): () => void {
  return () => {
    console.error(`${name} is not available in cross-wms`);
    process.exit(1);
  };
}

/** Register the `migrate` command and subcommands. */
export function registerMigrateCommand(program: Command): void {
  const migrate = program
    .command("migrate")
    .description("Import state from another agent system");

  migrate
    .command("list")
    .description("List migration providers")
    .action(notAvailable("migrate list"));

  migrate
    .command("plan")
    .description("Preview a migration without changing OpenClaw state")
    .argument("<provider>", "Provider name")
    .action(notAvailable("migrate plan"));

  migrate
    .command("apply")
    .description("Apply a migration after a verified backup")
    .argument("<provider>", "Provider name")
    .action(notAvailable("migrate apply"));
}
