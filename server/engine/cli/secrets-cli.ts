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
      throw new Error(
        "openclaw secrets list: not supported in stub mode (secrets/*, runtime not ported).",
      );
    });

  secrets
    .command("get")
    .description("Get a secret value")
    .argument("<key>", "Secret key")
    .action(() => {
      throw new Error(
        "openclaw secrets get: not supported in stub mode (secrets/*, runtime not ported).",
      );
    });

  secrets
    .command("set")
    .description("Set a secret value")
    .argument("<key>", "Secret key")
    .argument("<value>", "Secret value")
    .action(() => {
      throw new Error(
        "openclaw secrets set: not supported in stub mode (secrets/*, runtime not ported).",
      );
    });

  secrets
    .command("delete")
    .description("Delete a secret")
    .argument("<key>", "Secret key")
    .action(() => {
      throw new Error(
        "openclaw secrets delete: not supported in stub mode (secrets/*, runtime not ported).",
      );
    });

  secrets.action(() => {
    throw new Error(
      "openclaw secrets: not supported in stub mode (secrets/*, runtime not ported).",
    );
  });
}
