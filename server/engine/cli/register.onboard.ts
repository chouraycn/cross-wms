// Onboard command registration: guided setup for auth, models, gateway, workspace, channels, and skills.
// 移植自 openclaw/src/cli/program/register.onboard.ts
//
// 降级策略：
//  - 原模块依赖大量 OpenClaw 内部模块（terminal-core、commands/onboard*、runtime、
//    cli-utils 等）。cross-wms 未移植；此处注册命令结构，action 输出
//  "not available in cross-wms"。

import type { Command } from "commander";

/** Register the `onboard` command. */
export function registerOnboardCommand(program: Command): void {
  program
    .command("onboard")
    .description("Guided setup for auth, models, Gateway, workspace, channels, and skills")
    .option("--workspace <dir>", "Agent workspace directory (default: ~/.openclaw/workspace)")
    .option("--reset", "Reset config + credentials + sessions before running onboard")
    .option("--reset-scope <scope>", "Reset scope: config|config+creds+sessions|full")
    .option("--non-interactive", "Run without prompts", false)
    .option("--mode <mode>", "Onboard mode: local|remote")
    .option("--accept-risk", "Acknowledge risk (required for --non-interactive)", false)
    .option("--flow <flow>", "Onboard flow: quickstart|advanced|manual|import")
    .option("--gateway-port <port>", "Gateway port")
    .option("--gateway-bind <mode>", "Gateway bind: loopback|tailnet|lan|auto|custom")
    .option("--gateway-auth <mode>", "Gateway auth: token|password")
    .option("--remote-url <url>", "Remote Gateway WebSocket URL")
    .option("--remote-token <token>", "Remote Gateway token (optional)")
    .option("--install-daemon", "Install gateway service")
    .option("--skip-channels", "Skip channel setup")
    .option("--skip-skills", "Skip skills setup")
    .option("--json", "Output JSON summary", false)
    .action(() => {
      console.error("onboard is not available in cross-wms");
      process.exit(1);
    });
}
