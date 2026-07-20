// 移植自 openclaw/src/infra/restart-stale-pids.ts
// 降级：进程管理依赖简化

import { execSync } from "node:child_process";

/** Gets the current process and its ancestor PIDs synchronously. */
export function getSelfAndAncestorPidsSync(): number[] {
  const pids: number[] = [process.pid];
  try {
    if (process.platform === "win32") return pids;
    const ppid = process.ppid;
    if (ppid && ppid !== process.pid) {
      pids.push(ppid);
    }
  } catch {
    // ppid not available
  }
  return pids;
}

/** Finds gateway PIDs listening on a given port synchronously. */
export function findGatewayPidsOnPortSync(_port: number): number[] {
  // Simplified: no lsof/netstat access
  return [];
}

/** Cleans stale gateway processes synchronously. */
export function cleanStaleGatewayProcessesSync(_params: {
  port?: number;
  excludePids?: readonly number[];
}): { cleaned: number[] } {
  // Simplified: no process management
  return { cleaned: [] };
}

export const testing_restart_stale_pids = { getSelfAndAncestorPidsSync, findGatewayPidsOnPortSync, cleanStaleGatewayProcessesSync };
export type __testing_restart_stale_pids = typeof testing_restart_stale_pids;
