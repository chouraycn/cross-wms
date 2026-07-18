// Runtime helpers for model CLI commands and shared agent option handling.
// 移植自 openclaw/src/cli/models-cli.runtime.ts。
//
// 降级策略：
//  - 原模块依赖 `../runtime.js` 的 `defaultRuntime`、`./cli-utils.js` 的
//    `resolveOptionFromCommand`/`runCommandWithRuntime`、`./command-format.js` 的
//    `formatCliCommand`。其中 `../runtime.js` 未移植；这里提供降级 `defaultRuntime`
//    stub。`./cli-utils.js` 与 `./command-format.js` 已移植。
//  - 函数签名与导出保持与原模块一致。

import type { Command } from "commander";
import { resolveOptionFromCommand, runCommandWithRuntime } from "./cli-utils.js";
import { formatCliCommand } from "./command-format.js";

// ===== 内联降级：defaultRuntime =====
/**
 * CLI 运行时默认实现（降级占位）。
 *
 * 降级原因：openclaw 的 `runtime.js` 未移植。这里使用 console.log/error 作为默认实现，
 * `exit` 委托给 `process.exit`（与 `runCommandWithRuntime` 期望的签名兼容）。
 */
export const defaultRuntime = {
  log: (message: string) => {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现，需要向用户输出消息。
    console.log(message);
  },
  error: (message: string) => {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现，需要向用户输出错误。
    console.error(message);
  },
  exit: (code: number) => {
    process.exit(code);
  },
};
// ===== defaultRuntime 结束 =====

export function runModelsCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action);
}

export function resolveModelAgentOption(
  command: Command | undefined,
  opts?: { agent?: unknown },
): string | undefined {
  return (
    resolveOptionFromCommand<string>(command, "agent") ??
    (typeof opts?.agent === "string" ? opts.agent : undefined)
  );
}

export function rejectAgentScopedModelWrite(
  command: Command,
  commandName: "set" | "set-image",
): void {
  // Write commands update global defaults; accepting --agent here would imply per-agent mutation.
  const agent = resolveOptionFromCommand<string>(command, "agent");
  if (!agent) {
    return;
  }
  throw new Error(
    `openclaw models ${commandName} does not support --agent; it only updates global model defaults. Remove --agent, or run ${formatCliCommand("openclaw agents list")} and set the per-agent model in agent config.`,
  );
}
