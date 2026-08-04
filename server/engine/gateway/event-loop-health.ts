// Re-export of the canonical implementation to eliminate duplicated code (jscpd consolidation).
// 与 ./server/event-loop-health.ts 仅差注释，且仅依赖 node:perf_hooks（无相对依赖），re-export 不改变行为。
export * from "./server/event-loop-health.js";
