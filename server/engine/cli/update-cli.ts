// Update CLI registration for checking and applying OpenClaw updates.
// 移植自 openclaw/src/cli/update-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `../updater/*` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `update` CLI command. */
export function registerUpdateCli(program: Command): void {
  program
    .command("update")
    .description("Check and apply OpenClaw updates")
    .option("--check", "Only check for updates without applying", false)
    .option("--json", "Output JSON", false)
    .option("--version <ver>", "Update to a specific version")
    .action(() => {
      console.error('openclaw update is not available in cross-wms');
      process.exit(1);
    });
}
