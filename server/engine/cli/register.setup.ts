// Setup command registration: baseline setup by default, onboarding wizard when wizard flags appear.
// 移植自 openclaw/src/cli/program/register.setup.ts
//
// 降级策略：
//  - 原模块依赖 terminal-core/links+theme、command-options、cli-utils、runtime、
//    commands/onboard+setup。cross-wms 未移植；此处注册命令结构，action 输出
//  "not available in cross-wms"。

import type { Command } from "commander";

/** Register the `setup` command and route wizard-style invocations to onboarding. */
export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Create baseline config/workspace files; use --wizard for full onboarding")
    .option(
      "--workspace <dir>",
      "Agent workspace directory (default: ~/.openclaw/workspace; stored as agents.defaults.workspace)",
    )
    .option("--wizard", "Run interactive onboarding", false)
    .option("--non-interactive", "Run onboarding without prompts", false)
    .option(
      "--accept-risk",
      "Acknowledge that agents are powerful and full system access is risky (required for --non-interactive)",
      false,
    )
    .option("--mode <mode>", "Onboard mode: local|remote")
    .option("--import-from <provider>", "Migration provider to run during onboarding")
    .option("--import-source <path>", "Source agent home for --import-from")
    .option("--import-secrets", "Import supported secrets during onboarding migration", false)
    .option("--remote-url <url>", "Remote Gateway WebSocket URL")
    .option("--remote-token <token>", "Remote Gateway token (optional)")
    .action(() => {
      console.error("setup is not available in cross-wms");
      process.exit(1);
    });
}
