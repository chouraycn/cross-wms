// Test helper for running Commander commands with captured output.
// Ported from openclaw/src/test-utils/command-runner.ts.
import { Command } from "commander";

/** Runs a CLI registrar against Commander using user-style argv. */
export async function runRegisteredCli(params: {
  register: (program: Command) => void;
  argv: string[];
}): Promise<void> {
  const program = new Command();
  params.register(program);
  await program.parseAsync(params.argv, { from: "user" });
}
