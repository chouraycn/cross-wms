// 移植自 openclaw/src/infra/restart-stale-pids.ts（降级实现）
// 清理过期的 gateway 进程 PID。
import { isPidAlive } from "./_runtime-stubs.js";

export type GatewayPidsOnPort = {
  port: number;
  pids: number[];
};

/**
 * 在端口上查找 gateway PID。
 * 降级实现：返回空数组。
 */
export function findGatewayPidsOnPortSync(_port: number): number[] {
  return [];
}

/**
 * 清理过期的 gateway 进程。
 * 降级实现：仅检查 PID 存活性，不发送信号。
 */
export function cleanStaleGatewayProcessesSync(params: {
  pids: readonly number[];
}): { cleaned: number[]; skipped: number[] } {
  const cleaned: number[] = [];
  const skipped: number[] = [];
  for (const pid of params.pids) {
    if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) {
      skipped.push(pid);
      continue;
    }
    if (!isPidAlive(pid)) {
      cleaned.push(pid);
    } else {
      skipped.push(pid);
    }
  }
  return { cleaned, skipped };
}

/** 过滤存活的 PID */
export function filterAlivePids(pids: readonly number[]): number[] {
  return pids.filter((pid) => typeof pid === "number" && Number.isFinite(pid) && pid > 0 && isPidAlive(pid));
}
