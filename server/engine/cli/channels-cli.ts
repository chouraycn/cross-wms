// Channels CLI registration for channel management subcommands.
// 移植自 openclaw/src/cli/channels-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../channels/*`、
// `../runtime.js`、`./channel-auth.ts`、`./gateway-rpc.ts` 等。
// 这里仅注册命令占位，action 抛出 "not supported" 错误。

import type { Command } from "commander";

/** Register the `channels` CLI command and subcommands. */
export function registerChannelsCli(program: Command): void {
  const channels = program
    .command("channels")
    .description("Manage messaging channels and accounts");

  channels
    .command("list")
    .description("List configured channels")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw channels list is not available in cross-wms');
      process.exit(1);
    });

  channels
    .command("login")
    .description("Login to a channel account")
    .option("--channel <id>", "Channel id")
    .option("--account <id>", "Account id")
    .action(() => {
      console.error('openclaw channels login is not available in cross-wms');
      process.exit(1);
    });

  channels
    .command("logout")
    .description("Logout from a channel account")
    .option("--channel <id>", "Channel id")
    .option("--account <id>", "Account id")
    .action(() => {
      console.error('openclaw channels logout is not available in cross-wms');
      process.exit(1);
    });

  channels.action(() => {
    console.error('openclaw channels is not available in cross-wms');
      process.exit(1);
  });
}
