// Clawbot CLI registration for the bundled clawbot assistant.
// 移植自 openclaw/src/cli/clawbot-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `./gateway-rpc.ts` 等。这里仅注册命令占位，action 抛出 "not supported" 错误。

import type { Command } from "commander";

/** Register the `clawbot` CLI command. */
export function registerClawbotCli(program: Command): void {
  const clawbot = program
    .command("clawbot")
    .description("Run the bundled clawbot assistant");

  clawbot
    .option("--url <url>", "Gateway WebSocket URL")
    .option("--token <token>", "Gateway token")
    .option("--session <key>", "Session key")
    .action(() => {
      console.error('openclaw clawbot is not available in cross-wms');
      process.exit(1);
    });
}
