// Status, health, sessions, commitments, and task/flow command registration.
// 移植自 openclaw/src/cli/program/register.status-health-sessions.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块（terminal-core, runtime, globals, cli-utils,
//    commands/sessions+commitments+tasks+flows 等）。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

function notAvailable(name: string): () => void {
  return () => {
    console.error(`${name} is not available in cross-wms`);
    process.exit(1);
  };
}

/** Register status, health, sessions, commitments, and tasks commands. */
export function registerStatusHealthSessionsCommands(program: Command): void {
  // Top-level status command
  program
    .command("status")
    .description("Show channel health and recent session recipients")
    .option("--json", "Output as JSON", false)
    .option("--verbose", "Verbose logging", false)
    .action(notAvailable("status"));

  program
    .command("health")
    .description("Fetch health from the running gateway")
    .option("--json", "Output as JSON", false)
    .action(notAvailable("health"));

  // Sessions sub-commands
  const sessions = program
    .command("sessions")
    .description("List stored conversation sessions");

  sessions
    .command("list")
    .description("List stored conversation sessions")
    .option("--json", "Output as JSON", false)
    .action(notAvailable("sessions list"));

  sessions
    .command("cleanup")
    .description("Run session-store maintenance now")
    .action(notAvailable("sessions cleanup"));

  sessions
    .command("tail")
    .description("Tail human-readable session trajectory progress")
    .action(notAvailable("sessions tail"));

  sessions
    .command("export-trajectory")
    .description("Export a redacted trajectory bundle for a stored session")
    .action(notAvailable("sessions export-trajectory"));

  sessions
    .command("compact")
    .description("Compact a stored session transcript via the running gateway")
    .argument("<key>", "Session key")
    .action(notAvailable("sessions compact"));

  // Commitments sub-commands
  const commitments = program
    .command("commitments")
    .description("List and manage inferred follow-up commitments");

  commitments
    .command("list")
    .description("List inferred follow-up commitments")
    .action(notAvailable("commitments list"));

  commitments
    .command("dismiss")
    .description("Dismiss inferred follow-up commitments")
    .argument("<ids...>", "Commitment IDs to dismiss")
    .action(notAvailable("commitments dismiss"));

  // Tasks sub-commands
  const tasks = program
    .command("tasks")
    .description("Inspect durable background tasks and TaskFlow state");

  tasks
    .command("list")
    .description("List tracked background tasks")
    .option("--json", "Output as JSON", false)
    .action(notAvailable("tasks list"));

  tasks
    .command("audit")
    .description("Show stale or broken background tasks and TaskFlows")
    .action(notAvailable("tasks audit"));

  tasks
    .command("maintenance")
    .description("Preview or apply tasks and TaskFlow maintenance")
    .action(notAvailable("tasks maintenance"));

  tasks
    .command("show")
    .description("Show one background task by task id, run id, or session key")
    .argument("<id>", "Task identifier")
    .action(notAvailable("tasks show"));

  tasks
    .command("notify")
    .description("Set task notify policy")
    .action(notAvailable("tasks notify"));

  tasks
    .command("cancel")
    .description("Cancel a running background task")
    .argument("<id>", "Task identifier")
    .action(notAvailable("tasks cancel"));

  // TaskFlow sub-commands
  const flow = tasks
    .command("flow")
    .description("Inspect durable TaskFlow state under tasks");

  flow
    .command("list")
    .description("List tracked TaskFlows")
    .action(notAvailable("tasks flow list"));

  flow
    .command("show")
    .description("Show one TaskFlow by flow id or owner key")
    .argument("<id>", "Flow identifier")
    .action(notAvailable("tasks flow show"));

  flow
    .command("cancel")
    .description("Cancel a running TaskFlow")
    .argument("<id>", "Flow identifier")
    .action(notAvailable("tasks flow cancel"));
}
