// Program command registry facade: exports core descriptors and registers core plus sub-CLIs.
// 移植自 openclaw/src/cli/program/command-registry.ts

import type { Command } from "commander";
import { resolveCliArgvInvocation } from "./argv-invocation.js";
import {
  getCoreCliCommandDescriptors,
  getCoreCliCommandNames,
  getCoreCliCommandsWithSubcommands,
  type CommandRegistration,
  registerCoreCliByName,
  registerCoreCliCommands,
} from "./command-registry-core.js";
import type { ProgramContext } from "./context.js";
import { registerSubCliCommands } from "./register.subclis.js";

export {
  getCoreCliCommandDescriptors,
  getCoreCliCommandNames,
  getCoreCliCommandsWithSubcommands,
  registerCoreCliByName,
  registerCoreCliCommands,
};

/** Core command registration contract re-exported for program builders and tests. */
export type { CommandRegistration };

/** Register all root-program commands for the current argv shape. */
export function registerProgramCommands(
  program: Command,
  ctx: ProgramContext,
  argv: string[] = process.argv,
) {
  registerCoreCliCommands(program, ctx, argv);
  registerSubCliCommands(program, argv);
}
