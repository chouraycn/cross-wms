// Docs CLI registration for opening or generating OpenClaw documentation.
// 移植自 openclaw/src/cli/docs-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `docs` CLI command. */
export function registerDocsCli(program: Command): void {
  const docs = program.command("docs").description("Open or generate OpenClaw documentation");

  docs
    .option("--url", "Print the docs URL instead of opening", false)
    .action(() => {
      throw new Error(
        "openclaw docs: not supported in stub mode (terminal-core/* not ported).",
      );
    });
}
