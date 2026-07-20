// Global Commander pre-action hook: simplified for cross-wms.
// 移植自 openclaw/src/cli/program/preaction.ts
//
// 降级策略：
//  - 原模块依赖大量 OpenClaw 内部模块（globals, logging, runtime, config guard,
//    command-execution-startup, command-startup-policy, plugin-install-config-policy 等）。
//    cross-wms 不具备这些依赖；此处提供简化版 pre-action hook，
//    仅设置进程标题和基本 verbose 模式。

import type { Command } from "commander";
import { resolveCliName } from "./cli-name.js";
import { getVerboseFlag, isHelpOrVersionInvocation } from "./argv.js";

function setProcessTitleForCommand(actionCommand: Command) {
  let current: Command = actionCommand;
  while (current.parent && current.parent.parent) {
    current = current.parent;
  }
  const name = current.name();
  const cliName = resolveCliName();
  if (!name || name === cliName) {
    return;
  }
  process.title = `${cliName}-${name}`;
}

/** Register global pre-action bootstrap hooks for every non-help command invocation. */
export function registerPreActionHooks(program: Command, _programVersion: string) {
  program.hook("preAction", async (_thisCommand, actionCommand) => {
    setProcessTitleForCommand(actionCommand);
    const argv = process.argv;
    if (isHelpOrVersionInvocation(argv)) {
      return;
    }
    const verbose = getVerboseFlag(argv, { includeDebug: true });
    if (!verbose) {
      process.env.NODE_NO_WARNINGS ??= "1";
    }
  });
}
