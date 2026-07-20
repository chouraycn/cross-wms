// Agent management command registration: agents, list, add, bind, etc.
// 移植自 openclaw/src/cli/program/register.agent.ts
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

/** Register the `agents` command and subcommands. */
export function registerAgentsCommands(program: Command): void {
  const agents = program
    .command("agents")
    .description("Manage isolated agents (workspaces + auth + routing)");

  agents
    .command("list")
    .description("List configured agents")
    .option("--json", "Output as JSON", false)
    .action(notAvailable("agents list"));

  agents
    .command("add")
    .description("Add a new isolated agent")
    .argument("[name]", "Agent name")
    .action(notAvailable("agents add"));

  agents
    .command("delete")
    .description("Delete an agent and prune workspace/state")
    .argument("<id>", "Agent ID")
    .action(notAvailable("agents delete"));

  agents
    .command("bindings")
    .description("List routing bindings")
    .action(notAvailable("agents bindings"));

  agents
    .command("bind")
    .description("Add routing bindings for an agent")
    .action(notAvailable("agents bind"));

  agents
    .command("unbind")
    .description("Remove routing bindings for an agent")
    .action(notAvailable("agents unbind"));

  agents
    .command("set-identity")
    .description("Update an agent identity (name/theme/emoji/avatar)")
    .action(notAvailable("agents set-identity"));
}
