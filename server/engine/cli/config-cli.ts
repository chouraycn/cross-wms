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
      throw new Error(
        "openclaw config get: not supported in stub mode (config/* not ported).",
      );
    });

  config
    .command("set")
    .description("Set a config value")
    .argument("<key>", "Config key path")
    .argument("<value>", "Config value")
    .option("--dry-run", "Show what would change without writing", false)
    .action(() => {
      throw new Error(
        "openclaw config set: not supported in stub mode (config/* not ported).",
      );
    });

  config
    .command("list")
    .description("List all config keys")
    .option("--json", "Output JSON", false)
    .action(() => {
      throw new Error(
        "openclaw config list: not supported in stub mode (config/* not ported).",
      );
    });

  config
    .command("delete")
    .description("Delete a config value")
    .argument("<key>", "Config key path")
    .action(() => {
      throw new Error(
        "openclaw config delete: not supported in stub mode (config/* not ported).",
      );
    });

  config.action(() => {
    throw new Error(
      "openclaw config: not supported in stub mode (config/* not ported).",
    );
  });
}
