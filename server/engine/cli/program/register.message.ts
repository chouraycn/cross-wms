// Message command registration: core send/read/manage actions plus channel-specific admin helpers.
import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export type ProgramContext = {
  messageChannelOptions: string;
};

function createMessageCliHelpers(message: Command, channelOptions: string) {
  void message;
  void channelOptions;
  return {
    addChannelOption: (cmd: Command) => cmd,
    addTargetOption: (cmd: Command) => cmd,
  };
}

export function registerMessageCommands(program: Command, ctx: ProgramContext) {
  const message = program
    .command("message")
    .description("Send, read, and manage messages and channel actions")
    .action(() => {
      message.help({ error: true });
    });

  const helpers = createMessageCliHelpers(message, ctx.messageChannelOptions);
  void helpers;

  message
    .command("send")
    .description("Send a message")
    .option("--target <target>", "Message target")
    .option("--message <text>", "Message text")
    .option("--channel <channel>", "Channel name")
    .option("--json", "Output JSON", false)
    .action(async (opts): Promise<void> => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        defaultRuntime.log("message send: not fully implemented in cross-wms");
        defaultRuntime.log(`opts: ${JSON.stringify(opts)}`);
      });
    });

  message
    .command("read")
    .description("Read messages")
    .option("--target <target>", "Message target")
    .option("--channel <channel>", "Channel name")
    .option("--limit <n>", "Number of messages", "10")
    .option("--json", "Output JSON", false)
    .action(async (opts): Promise<void> => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        defaultRuntime.log("message read: not fully implemented in cross-wms");
        defaultRuntime.log(`opts: ${JSON.stringify(opts)}`);
      });
    });

  message
    .command("list")
    .description("List channels/conversations")
    .option("--channel <channel>", "Channel name")
    .option("--json", "Output JSON", false)
    .action(async (opts): Promise<void> => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        defaultRuntime.log("message list: not fully implemented in cross-wms");
        defaultRuntime.log(`opts: ${JSON.stringify(opts)}`);
      });
    });
}
