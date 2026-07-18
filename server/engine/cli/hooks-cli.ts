// Hooks CLI registration for managing internal and plugin hooks.
// 移植自 openclaw/src/cli/hooks-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `../plugins/*`、`./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `hooks` CLI command and subcommands. */
export function registerHooksCli(program: Command): void {
  const hooks = program.command("hooks").description("Manage internal and plugin hooks");

  hooks
    .command("list")
    .description("List configured hooks")
    .option("--json", "Output JSON", false)
    .action(() => {
      throw new Error(
        "openclaw hooks list: not supported in stub mode (plugins/*, runtime not ported).",
      );
    });

  hooks
    .command("enable")
    .description("Enable a hook")
    .argument("<name>", "Hook name")
    .action(() => {
      throw new Error(
        "openclaw hooks enable: not supported in stub mode (plugins/*, runtime not ported).",
      );
    });

  hooks
    .command("disable")
    .description("Disable a hook")
    .argument("<name>", "Hook name")
    .action(() => {
      throw new Error(
        "openclaw hooks disable: not supported in stub mode (plugins/*, runtime not ported).",
      );
    });

  hooks.action(() => {
    throw new Error(
      "openclaw hooks: not supported in stub mode (plugins/*, runtime not ported).",
    );
  });
}
