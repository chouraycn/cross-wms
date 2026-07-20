// Secrets CLI registration for managing secret stores.
// 移植自 openclaw/src/cli/secrets-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `../secrets/*`、`./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `secrets` CLI command and subcommands. */
export function registerSecretsCli(program: Command): void {
  const secrets = program.command("secrets").description("Manage secret stores");

  secrets
    .command("list")
    .description("List secret keys")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw secrets list is not available in cross-wms');
      process.exit(1);
    });

  secrets
    .command("get")
    .description("Get a secret value")
    .argument("<key>", "Secret key")
    .action(() => {
      console.error('openclaw secrets get is not available in cross-wms');
      process.exit(1);
    });

  secrets
    .command("set")
    .description("Set a secret value")
    .argument("<key>", "Secret key")
    .argument("<value>", "Secret value")
    .action(() => {
      console.error('openclaw secrets set is not available in cross-wms');
      process.exit(1);
    });

  secrets
    .command("delete")
    .description("Delete a secret")
    .argument("<key>", "Secret key")
    .action(() => {
      console.error('openclaw secrets delete is not available in cross-wms');
      process.exit(1);
    });

  secrets.action(() => {
    console.error('openclaw secrets is not available in cross-wms');
      process.exit(1);
  });
}
