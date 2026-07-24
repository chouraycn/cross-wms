// === MIGRATED — 已移植到真实实现 ===
// Source: openclaw/src/process/exec.ts
// Real implementation: server/engine/process/exec.ts
//
// 移植了核心的 runCommandWithTimeout 和 runExec 函数（超时、AbortSignal、输出截断、进程树终止）。
// 移除了 Windows 特定逻辑（cross-wms 运行在 macOS/Linux）。

export type {
  SpawnResult,
  CommandOptions,
} from "../process/exec.js";

export {
  runCommandWithTimeout,
  runExec,
  resolveProcessExitCode,
} from "../process/exec.js";
