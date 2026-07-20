// registerMessageCommands: CLI command registration ported from openclaw.
// 移植自 openclaw/src/cli/program/register.message.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块（terminal-core, runtime, cli-utils 等）。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

function notAvailable(name: string): () => void {
  return () => {
    console.error(`${name} is not available in cross-wms`);
    process.exit(1);
  };
}

/** Register the message command(s). */
export function registerMessageCommands(program: Command, ctx: { agentChannelOptions: string }): void {
  program
    .command("message")
    .description("Send, read, and manage messages and channel actions")
    .action(notAvailable("message"));
}
