// Builds the root Commander program, context, help, hooks, and command registry.
// 移植自 openclaw/src/cli/program/build-program.ts
//
// 降级策略：
//  - 原模块依赖 ./command-registry.js, ./context.js, ./help.js, ./preaction.js,
//    ./program-context.js；cross-wms 均已移植。
//  - preaction 原实现依赖大量 OpenClaw 内部模块，此处提供简化版本。

import process from "node:process";
import { Command } from "commander";
import { registerProgramCommands } from "./command-registry.js";
import { createProgramContext } from "./context.js";
import { configureProgramHelp } from "./help.js";
import { registerPreActionHooks } from "./preaction.js";
import { setProgramContext } from "./program-context.js";

export function buildProgram() {
  const program = new Command();
  program.enablePositionalOptions();
  program.exitOverride((err) => {
    process.exitCode = typeof err.exitCode === "number" ? err.exitCode : 1;
    throw err;
  });
  const ctx = createProgramContext();
  const argv = process.argv;

  setProgramContext(program, ctx);
  configureProgramHelp(program, ctx);
  registerPreActionHooks(program, ctx.programVersion);

  registerProgramCommands(program, ctx, argv);

  return program;
}
