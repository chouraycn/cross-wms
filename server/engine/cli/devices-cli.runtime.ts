// Runtime helpers for devices CLI commands.
// 移植自 openclaw/src/cli/devices-cli.runtime.ts。
//
// 降级策略：原模块依赖 `../runtime.js` 的 `defaultRuntime`、
// `./cli-utils.js` 的 `runCommandWithRuntime`。这里提供降级 `defaultRuntime`。

import { runCommandWithRuntime } from "./cli-utils.js";

// ===== 内联降级：defaultRuntime =====
export const defaultRuntime = {
  log: (message: string) => {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现。
    console.log(message);
  },
  error: (message: string) => {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现。
    console.error(message);
  },
  exit: (code: number) => {
    process.exit(code);
  },
};
// ===== defaultRuntime 结束 =====

export function runDevicesCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action);
}
