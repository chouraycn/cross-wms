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
      console.error('openclaw directory status is not available in cross-wms');
      process.exit(1);
    });

  directory.action(() => {
    console.error('openclaw directory is not available in cross-wms');
      process.exit(1);
  });
}
