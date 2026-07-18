// System CLI registration for system info and diagnostics.
// 移植自 openclaw/src/cli/system-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `system` CLI command and subcommands. */
export function registerSystemCli(program: Command): void {
  const system = program.command("system").description("System info and diagnostics");

  system
    .command("info")
    .description("Show system information")
    .option("--json", "Output JSON", false)
    .action(() => {
      throw new Error(
        "openclaw system info: not supported in stub mode (runtime, gateway-rpc not ported).",
      );
    });

  system.action(() => {
    throw new Error(
      "openclaw system: not supported in stub mode (runtime, gateway-rpc not ported).",
    );
  });
}
