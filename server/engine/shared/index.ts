/**
 * 共享辅助模块入口 — 跨模块复用的小工具
 */
export {
  resolveGlobalSingleton,
  resolveGlobalMap,
} from "./global-singleton.js";

export {
  resolveNonNegativeInteger,
  resolveNonNegativeNumber,
  clampNumber,
  clampPositiveTimerTimeoutMs,
  resolveTimerTimeoutMs,
} from "./number-coercion.js";
