// TUI CLI registration for launching the terminal UI.
// 移植自 openclaw/src/cli/tui-cli.ts。
//
// 通过内嵌 TUI runtime 启动终端用户界面。

import type { Command } from "commander";
import { runTuiCli } from "../../tui/cli.js";

/** Register the `tui` CLI command. */
export function registerTuiCli(program: Command): void {
  program
    .command("tui")
    .alias("terminal")
    .alias("chat")
    .description("Launch the terminal UI (TUI) connected to the local agent runtime")
    .option("--http", "Use HTTP backend instead of the embedded agent runtime")
    .option("--url <url>", "HTTP backend base URL")
    .option("--token <token>", "HTTP backend token")
    .option("--config <path>", "TUI config file path")
    .option("--theme <mode>", "Theme mode (auto/light/dark)")
    .option("--list-backends", "List available TUI backends and exit")
    .option("--save-config", "Save TUI config and exit")
    .option("--validate-config", "Validate TUI config and exit")
    .option("--verbose", "Enable verbose TUI logging")
    .action(async (opts) => {
      const argv: string[] = [];
      if (opts.http) argv.push("--http");
      if (opts.url) argv.push("--url", String(opts.url));
      if (opts.config) argv.push("--config", String(opts.config));
      if (opts.theme) argv.push("--theme", String(opts.theme));
      if (opts.listBackends) argv.push("--list-backends");
      if (opts.saveConfig) argv.push("--save-config");
      if (opts.validateConfig) argv.push("--validate-config");
      if (opts.verbose) argv.push("--verbose");
      if (opts.token) {
        // Pass token through the TUI HTTP backend config when implemented.
        process.env.CDF_TUI_TOKEN = String(opts.token);
      }
      try {
        await runTuiCli(argv);
      } catch (err) {
        console.error("[tui] failed to launch:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}
