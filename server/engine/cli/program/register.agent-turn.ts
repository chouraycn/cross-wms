// Single agent-turn command registration; delegates execution to the Gateway-backed agent command.
import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerAgentTurnCommand(
  program: Command,
  args: { agentChannelOptions: string },
): void {
  program
    .command("agent")
    .description("Run an agent turn via the Gateway (use --local for embedded)")
    .option("-m, --message <text>", "Message body for the agent")
    .option("--message-file <path>", "Read the agent message body from a UTF-8 file")
    .option("-t, --to <number>", "Recipient number in E.164 used to derive the session key")
    .option("--session-key <key>", "Explicit session key (agent:<id>:<key>, or scoped to --agent)")
    .option("--session-id <id>", "Use an explicit session id")
    .option("--agent <id>", "Agent id (overrides routing bindings)")
    .option("--model <id>", "Model override for this run (provider/model or model id)")
    .option(
      "--thinking <level>",
      "Thinking level: off | minimal | low | medium | high | xhigh | adaptive | max where supported",
    )
    .option("--verbose <on|off>", "Persist agent verbose level for the session")
    .option(
      "--channel <channel>",
      `Delivery channel: ${args.agentChannelOptions} (omit to use the main session channel)`,
    )
    .option("--reply-to <target>", "Delivery target override (separate from session routing)")
    .option("--reply-channel <channel>", "Delivery channel override (separate from routing)")
    .option("--reply-account <id>", "Delivery account id override")
    .option(
      "--local",
      "Run the embedded agent locally (requires model provider API keys in your shell)",
      false,
    )
    .option("--deliver", "Send the agent's reply back to the selected channel", false)
    .option("--json", "Output result as JSON", false)
    .option(
      "--timeout <seconds>",
      "Override agent command timeout (seconds, default 600 or config value)",
    )
    .action(async (opts): Promise<void> => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        defaultRuntime.log("agent command: not fully implemented in cross-wms");
        defaultRuntime.log(`opts: ${JSON.stringify(opts)}`);
      });
    });
}
