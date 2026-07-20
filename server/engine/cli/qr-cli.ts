// QR CLI registration for generating QR codes for pairing and sharing.
// 移植自 openclaw/src/cli/qr-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`。
// 这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `qr` CLI command. */
export function registerQrCli(program: Command): void {
  program
    .command("qr")
    .description("Generate QR codes for pairing and sharing")
    .argument("<text>", "Text to encode")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw qr is not available in cross-wms');
      process.exit(1);
    });
}
