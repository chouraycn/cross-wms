// Webhooks CLI registration for managing webhook endpoints.
// 移植自 openclaw/src/cli/webhooks-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `webhooks` CLI command and subcommands. */
export function registerWebhooksCli(program: Command): void {
  const webhooks = program.command("webhooks").description("Manage webhook endpoints");

  webhooks
    .command("list")
    .description("List configured webhooks")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw webhooks list is not available in cross-wms');
      process.exit(1);
    });

  webhooks
    .command("add")
    .description("Add a webhook endpoint")
    .argument("<url>", "Webhook URL")
    .action(() => {
      console.error('openclaw webhooks add is not available in cross-wms');
      process.exit(1);
    });

  webhooks
    .command("remove")
    .description("Remove a webhook endpoint")
    .argument("<url>", "Webhook URL")
    .action(() => {
      console.error('openclaw webhooks remove is not available in cross-wms');
      process.exit(1);
    });

  webhooks.action(() => {
    console.error('openclaw webhooks is not available in cross-wms');
      process.exit(1);
  });
}
