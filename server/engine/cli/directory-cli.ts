// Directory CLI registration for managing the OpenClaw directory service.
// 移植自 openclaw/src/cli/directory-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `directory` CLI command and subcommands. */
export function registerDirectoryCli(program: Command): void {
  const directory = program.command("directory").description("Manage the OpenClaw directory service");

  directory
    .command("status")
    .description("Show directory service status")
    .option("--json", "Output JSON", false)
    .action(() => {
      throw new Error(
        "openclaw directory status: not supported in stub mode (runtime, gateway-rpc not ported).",
      );
    });

  directory.action(() => {
    throw new Error(
      "openclaw directory: not supported in stub mode (runtime, gateway-rpc not ported).",
    );
  });
}
