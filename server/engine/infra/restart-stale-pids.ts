// 移植自 openclaw/src/infra/restart-stale-pids.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function getSelfAndAncestorPidsSync(...args: unknown[]): unknown {
  throw new Error("not implemented: getSelfAndAncestorPidsSync");
}
export function findGatewayPidsOnPortSync(...args: unknown[]): number[] {
  throw new Error("not implemented: findGatewayPidsOnPortSync");
}
export function cleanStaleGatewayProcessesSync(...args: unknown[]): unknown {
  throw new Error("not implemented: cleanStaleGatewayProcessesSync");
}
export const testing_restart_stale_pids: unknown = undefined;
export type __testing_restart_stale_pids = unknown;
