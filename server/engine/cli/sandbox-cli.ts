// Sandbox CLI registration for managing agent execution sandboxes.
// 移植自 openclaw/src/cli/sandbox-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `../agents/sandbox/*`、`./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `sandbox` CLI command and subcommands. */
export function registerSandboxCli(program: Command): void {
  const sandbox = program.command("sandbox").description("Manage agent execution sandboxes");

  sandbox
    .command("status")
    .description("Show sandbox status")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw sandbox status is not available in cross-wms');
      process.exit(1);
    });

  sandbox.action(() => {
    console.error('openclaw sandbox is not available in cross-wms');
      process.exit(1);
  });
}
