// Backup command registration: create, verify, and restore backup archives.
// 移植自 openclaw/src/cli/program/register.backup.ts
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

/** Register the `backup` command and subcommands. */
export function registerBackupCommand(program: Command): void {
  const backup = program
    .command("backup")
    .description("Create and verify local backup archives for OpenClaw state");

  backup
    .command("create")
    .description("Write a backup archive for config, credentials, sessions, and workspaces")
    .option("--output <path>", "Output archive path")
    .action(notAvailable("backup create"));

  backup
    .command("verify")
    .description("Validate a backup archive and its embedded manifest")
    .argument("<archive>", "Archive path")
    .action(notAvailable("backup verify"));

  backup
    .command("restore")
    .description("Restore state from a verified backup archive")
    .argument("<archive>", "Archive path")
    .action(notAvailable("backup restore"));
}
