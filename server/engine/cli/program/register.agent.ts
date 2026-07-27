// Agent and agents command registration with lazy command-module loading for startup speed.
import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { collectOption } from "./helpers.js";

async function runAgentsCommandAction(
  action: () => Promise<void>,
): Promise<void> {
  await runCommandWithRuntime(defaultRuntime, action);
}

export function registerAgentsCommands(program: Command): void {
  const agents = program
    .command("agents")
    .description("Manage isolated agents (workspaces + auth + routing)");

  agents
    .command("list")
    .description("List configured agents")
    .option("--json", "Output JSON instead of text", false)
    .option("--bindings", "Include routing bindings", false)
    .action(async (opts): Promise<void> => {
      await runAgentsCommandAction(async () => {
        defaultRuntime.log("agents list: not fully implemented in cross-wms");
        defaultRuntime.log(`opts: ${JSON.stringify(opts)}`);
      });
    });

  agents
    .command("bindings")
    .description("List routing bindings")
    .option("--agent <id>", "Filter by agent id")
    .option("--json", "Output JSON instead of text", false)
    .action(async (opts): Promise<void> => {
      await runAgentsCommandAction(async () => {
        defaultRuntime.log("agents bindings: not fully implemented in cross-wms");
        defaultRuntime.log(`opts: ${JSON.stringify(opts)}`);
      });
    });

  agents
    .command("bind")
    .description("Add routing bindings for an agent")
    .option("--agent <id>", "Agent id (defaults to current default agent)")
    .option(
      "--bind <channel[:accountId]>",
      "Binding to add (repeatable). If omitted, accountId is resolved by channel defaults/hooks.",
      collectOption,
      [],
    )
    .option("--json", "Output JSON summary", false)
    .action(async (opts): Promise<void> => {
      await runAgentsCommandAction(async () => {
        defaultRuntime.log("agents bind: not fully implemented in cross-wms");
        defaultRuntime.log(`opts: ${JSON.stringify(opts)}`);
      });
    });

  agents
    .command("unbind")
    .description("Remove routing bindings for an agent")
    .option("--agent <id>", "Agent id (defaults to current default agent)")
    .option("--bind <channel[:accountId]>", "Binding to remove (repeatable)", collectOption, [])
    .option("--all", "Remove all bindings for this agent", false)
    .option("--json", "Output JSON summary", false)
    .action(async (opts): Promise<void> => {
      await runAgentsCommandAction(async () => {
        defaultRuntime.log("agents unbind: not fully implemented in cross-wms");
        defaultRuntime.log(`opts: ${JSON.stringify(opts)}`);
      });
    });

  agents
    .command("add [name]")
    .description("Add a new isolated agent")
    .option("--workspace <dir>", "Workspace directory for the new agent")
    .option("--model <id>", "Model id for this agent")
    .option("--agent-dir <dir>", "Agent state directory for this agent")
    .option("--bind <channel[:accountId]>", "Route channel binding (repeatable)", collectOption, [])
    .option("--non-interactive", "Disable prompts; requires --workspace", false)
    .option("--json", "Output JSON summary", false)
    .action(async (name, opts): Promise<void> => {
      await runAgentsCommandAction(async () => {
        defaultRuntime.log("agents add: not fully implemented in cross-wms");
        defaultRuntime.log(`name: ${name}, opts: ${JSON.stringify(opts)}`);
      });
    });

  agents
    .command("set-identity")
    .description("Update an agent identity (name/theme/emoji/avatar)")
    .option("--agent <id>", "Agent id to update")
    .option("--workspace <dir>", "Workspace directory used to locate the agent + IDENTITY.md")
    .option("--identity-file <path>", "Explicit IDENTITY.md path to read")
    .option("--from-identity", "Read values from IDENTITY.md", false)
    .option("--name <name>", "Identity name")
    .option("--theme <theme>", "Identity theme")
    .option("--emoji <emoji>", "Identity emoji")
    .option("--avatar <value>", "Identity avatar (workspace path, http(s) URL, or data URI)")
    .option("--json", "Output JSON summary", false)
    .action(async (opts): Promise<void> => {
      await runAgentsCommandAction(async () => {
        defaultRuntime.log("agents set-identity: not fully implemented in cross-wms");
        defaultRuntime.log(`opts: ${JSON.stringify(opts)}`);
      });
    });

  agents
    .command("delete <id>")
    .description("Delete an agent and prune workspace/state")
    .option("--force", "Skip confirmation", false)
    .option("--json", "Output JSON summary", false)
    .action(async (id, opts): Promise<void> => {
      await runAgentsCommandAction(async () => {
        defaultRuntime.log("agents delete: not fully implemented in cross-wms");
        defaultRuntime.log(`id: ${id}, opts: ${JSON.stringify(opts)}`);
      });
    });

  agents.action(async (): Promise<void> => {
    await runAgentsCommandAction(async () => {
      defaultRuntime.log("agents: not fully implemented in cross-wms");
    });
  });
}
