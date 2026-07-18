// 早期 JSON 输出检测与 console-log 路由，保证可解析的 CLI stdout。
// 移植自 openclaw/src/cli/json-output-mode.ts。
//
// 降级策略：原模块仅依赖 ../logging/state.js（cross-wms 已存在），此处直接迁移实现。

import { loggingState } from "../logging/state.js";

/** 在 Commander 解析选项之前检测 CLI JSON 模式，遇到 argv sentinel 时停止。 */
export function hasJsonOutputFlag(argv: readonly string[]): boolean {
  for (const arg of argv) {
    if (arg === "--") {
      return false;
    }
    if (arg === "--json" || arg.startsWith("--json=")) {
      return true;
    }
  }
  return false;
}

/** 将附带的 console log 路由到 stderr，保持结构化 JSON stdout 干净。 */
export async function withConsoleLogsRoutedToStderrForJson<T>(
  argv: readonly string[],
  run: () => Promise<T>,
): Promise<T> {
  if (!hasJsonOutputFlag(argv)) {
    return run();
  }
  const previousForceStderr = loggingState.forceConsoleToStderr;
  loggingState.forceConsoleToStderr = true;
  try {
    return await run();
  } finally {
    // 恢复进程级日志开关，使嵌套/串行 CLI 调用保留各自输出模式。
    loggingState.forceConsoleToStderr = previousForceStderr;
  }
}
