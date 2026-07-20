// CLI for reading and mutating exec approval allowlists locally, via gateway, or via node.
// 移植自 openclaw/src/cli/exec-approvals-cli.ts。
//
// 降级策略：
//  - 原模块依赖大量未移植模块：`@openclaw/normalization-core/string-coerce`、
//    `json5`、`../../packages/terminal-core/src/*`（ansi/links/table/theme）、
//    `../config/config.js`、`../infra/errors.js`、
//    `../infra/exec-approvals-effective.js`、`../infra/exec-approvals.js`、
//    `../infra/format-time/format-relative.ts`、`../runtime.js`、
//    `./gateway-rpc.js`、`./nodes-cli/rpc.js`、`./nodes-cli/types.js`、
//    `./program/parent-default-help.js`。
//  - 这里仅保留 `registerExecApprovalsCli` 函数签名并注册命令占位，
//    action 抛出 "not supported" 错误，保留函数签名以便未来替换为正式实现。

import type { Command } from "commander";

/**
 * Register the exec approvals CLI commands.
 *
 * 降级实现：openclaw 的 exec-approvals 相关模块（config、infra/exec-approvals*、
 * nodes-cli/rpc、terminal-core/*）未移植；这里仅注册命令占位，
 * action 抛出 "not supported" 错误。
 */
export function registerExecApprovalsCli(program: Command): void {
  const approvals = program
    .command("approvals")
    .description("Manage exec approval allowlists");

  approvals
    .command("get")
    .description("Show current exec approvals")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw approvals get is not available in cross-wms');
      process.exit(1);
    });

  approvals
    .command("add")
    .description("Add an entry to the exec approval allowlist")
    .argument("<command>", "Command to allowlist")
    .action(() => {
      console.error('openclaw approvals add is not available in cross-wms');
      process.exit(1);
    });

  approvals
    .command("remove")
    .description("Remove an entry from the exec approval allowlist")
    .argument("<command>", "Command to remove")
    .action(() => {
      console.error('openclaw approvals remove is not available in cross-wms');
      process.exit(1);
    });
}
