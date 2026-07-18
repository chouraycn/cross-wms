// 判断持久化的锁文件所有者是否已失效
import {
  getProcessStartTime as defaultGetProcessStartTime,
  isPidDefinitelyDead as defaultIsPidDefinitelyDead,
} from "../shared/pid-alive.js";

export type LockFileOwnerPayload = {
  pid?: number;
  createdAt?: string;
  starttime?: number;
};

export function readLockFileOwnerPayload(
  payload: Record<string, unknown> | null,
): LockFileOwnerPayload | null {
  if (!payload) {
    return null;
  }
  return {
    pid: typeof payload.pid === "number" ? payload.pid : undefined,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : undefined,
    starttime: typeof payload.starttime === "number" ? payload.starttime : undefined,
  };
}

export function shouldRemoveDeadOwnerOrExpiredLock(params: {
  payload: Record<string, unknown> | null;
  staleMs: number;
  nowMs?: number;
  isPidDefinitelyDead?: (pid: number) => boolean;
  getProcessStartTime?: (pid: number) => number | null;
}): boolean {
  const payload = readLockFileOwnerPayload(params.payload);
  if (payload?.pid) {
    // 仅靠时间戳无法证明所有者已停止写入。
    // 只有进程启动时间不匹配才能在 PID 存活期间证明 PID 复用。
    if (payload.starttime !== undefined) {
      const currentStarttime = (params.getProcessStartTime ?? defaultGetProcessStartTime)(
        payload.pid,
      );
      if (currentStarttime !== null && currentStarttime !== payload.starttime) {
        return true;
      }
    }
    return (params.isPidDefinitelyDead ?? defaultIsPidDefinitelyDead)(payload.pid);
  }
  if (payload?.createdAt) {
    const createdAt = Date.parse(payload.createdAt);
    if (!Number.isFinite(createdAt) || (params.nowMs ?? Date.now()) - createdAt > params.staleMs) {
      return true;
    }
  }
  return false;
}
