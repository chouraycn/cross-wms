// CLI for showing and applying exec policy presets across config and approvals.
// 移植自 openclaw/src/cli/exec-policy-cli.ts。
//
// 降级策略：
//  - 原模块依赖大量未移植模块：`../../packages/terminal-core/src/*`（links/safe-text/table/theme）、
//    `../config/config.js`、`../config/types.openclaw.js`、
//    `../infra/exec-approval-command-display.js`、`../infra/exec-approvals-effective.js`、
//    `../infra/exec-approvals.js`、`../runtime.js`。
//  - 这里仅保留 `registerExecPolicyCli` 函数签名并注册命令占位，
//    action 抛出 "not supported" 错误，保留函数签名以便未来替换为正式实现。

import type { Command } from "commander";

/**
 * Register the exec policy CLI commands.
 *
 * 降级实现：openclaw 的 exec-policy 相关模块（config、infra/exec-approvals*、
 * terminal-core/*）未移植；这里仅注册命令占位，action 抛出 "not supported" 错误。
 */
export function registerExecPolicyCli(program: Command): void {
  const policy = program.command("exec-policy").description("Show and apply exec policy presets");

  policy
    .command("show")
    .description("Show current effective exec policy")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw exec-policy show is not available in cross-wms');
      process.exit(1);
    });

  policy
    .command("apply")
    .description("Apply an exec policy preset")
    .argument("<preset>", "Preset name (yolo | cautious | deny-all)")
    .action(() => {
      console.error('openclaw exec-policy apply is not available in cross-wms');
      process.exit(1);
    });
}
