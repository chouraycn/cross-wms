// Native hook relay CLI registration for OS-level event hooks.
// 移植自 openclaw/src/cli/native-hook-relay-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `native-hook-relay` CLI command. */
export function registerNativeHookRelayCli(program: Command): void {
  program
    .command("native-hook-relay")
    .description("Relay OS-level native hook events to the gateway")
    .option("--url <url>", "Gateway WebSocket URL")
    .option("--token <token>", "Gateway token")
    .action(() => {
      console.error('openclaw native-hook-relay is not available in cross-wms');
      process.exit(1);
    });
}
