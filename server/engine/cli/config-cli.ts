// Config CLI registration for reading/writing openclaw config values.
// 移植自 openclaw/src/cli/config-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../config/*`、
// `../runtime.js`、`./command-options.ts`、`./config-recovery-hints.ts`、
// `./config-set-*.ts` 等。其中 `config/*` 未移植；这里仅注册命令占位，
// action 抛出 "not supported" 错误。

import type { Command } from "commander";

/** Register the `config` CLI command and subcommands. */
export function registerConfigCli(program: Command): void {
  const config = program.command("config").description("Read and write openclaw config values");

  config
    .command("get")
    .description("Get a config value")
    .argument("<key>", "Config key path")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw config get is not available in cross-wms');
      process.exit(1);
    });

  config
    .command("set")
    .description("Set a config value")
    .argument("<key>", "Config key path")
    .argument("<value>", "Config value")
    .option("--dry-run", "Show what would change without writing", false)
    .action(() => {
      console.error('openclaw config set is not available in cross-wms');
      process.exit(1);
    });

  config
    .command("list")
    .description("List all config keys")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw config list is not available in cross-wms');
      process.exit(1);
    });

  config
    .command("delete")
    .description("Delete a config value")
    .argument("<key>", "Config key path")
    .action(() => {
      console.error('openclaw config delete is not available in cross-wms');
      process.exit(1);
    });

  config.action(() => {
    console.error('openclaw config is not available in cross-wms');
      process.exit(1);
  });
}
