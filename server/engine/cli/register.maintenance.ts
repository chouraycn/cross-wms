// Maintenance command registration: doctor, dashboard, reset, uninstall.
// 移植自 openclaw/src/cli/program/register.maintenance.ts
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

/** Register doctor, dashboard, reset, and uninstall commands. */
export function registerMaintenanceCommands(program: Command): void {
  program
    .command("doctor")
    .description("Health checks + quick fixes for the gateway and channels")
    .option("--fix", "Automatically fix detected issues", false)
    .action(notAvailable("doctor"));

  program
    .command("dashboard")
    .description("Open the Control UI with your current token")
    .action(notAvailable("dashboard"));

  program
    .command("reset")
    .description("Reset local config/state (keeps the CLI installed)")
    .option("--scope <scope>", "Reset scope: config|state|all")
    .action(notAvailable("reset"));

  program
    .command("uninstall")
    .description("Uninstall the gateway service + local data (CLI remains)")
    .action(notAvailable("uninstall"));
}
