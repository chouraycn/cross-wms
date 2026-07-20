// Pairing CLI registration for device pairing flows.
// 移植自 openclaw/src/cli/pairing-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `pairing` CLI command and subcommands. */
export function registerPairingCli(program: Command): void {
  const pairing = program.command("pairing").description("Manage device pairing");

  pairing
    .command("start")
    .description("Start a pairing session")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw pairing start is not available in cross-wms');
      process.exit(1);
    });

  pairing
    .command("status")
    .description("Show pairing status")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw pairing status is not available in cross-wms');
      process.exit(1);
    });

  pairing.action(() => {
    console.error('openclaw pairing is not available in cross-wms');
      process.exit(1);
  });
}
