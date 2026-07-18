/**
 * 频道传输层 — 长时运行频道传输的辅助工具
 */

// 可武装空闲看门狗 — 当武装的传输空闲超时报告一次
export {
  createArmableStallWatchdog,
  type StallWatchdogRuntimeEnv,
  type StallWatchdogTimeoutMeta,
  type ArmableStallWatchdog,
} from "./stall-watchdog.js";
