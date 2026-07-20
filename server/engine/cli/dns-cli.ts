// DNS CLI registration for managing DNS resolution and overrides.
// 移植自 openclaw/src/cli/dns-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `dns` CLI command and subcommands. */
export function registerDnsCli(program: Command): void {
  const dns = program.command("dns").description("Manage DNS resolution and overrides");

  dns
    .command("status")
    .description("Show DNS resolution status")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw dns status is not available in cross-wms');
      process.exit(1);
    });

  dns.action(() => {
    console.error('openclaw dns is not available in cross-wms');
      process.exit(1);
  });
}
