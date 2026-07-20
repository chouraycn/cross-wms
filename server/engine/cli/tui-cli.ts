// TUI CLI registration for launching the terminal UI.
// 移植自 openclaw/src/cli/tui-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`。
// 这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `tui` CLI command. */
export function registerTuiCli(program: Command): void {
  program
    .command("tui")
    .description("Launch the terminal UI")
    .option("--url <url>", "Gateway WebSocket URL")
    .option("--token <token>", "Gateway token")
    .action(() => {
      console.error('openclaw tui is not available in cross-wms');
      process.exit(1);
    });
}
