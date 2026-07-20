// registerDiscordAdminCommands: CLI command registration.
// 移植自 openclaw/src/cli/program/register.discord-admin.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

/** Register the discord-admin command(s). */
export function registerDiscordAdminCommands(program: Command): void {
  program
    .command("discord-admin")
    .description("Discord admin commands")
    .action(() => {
      console.error("discord-admin is not available in cross-wms");
      process.exit(1);
    });
}
