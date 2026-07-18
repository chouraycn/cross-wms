// PID liveness 辅助函数：检查进程 ID 是否仍指向活动进程
import fsSync from "node:fs";

function isValidPid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 0;
}

/**
 * 通过读取 /proc/<pid>/status 检查进程是否为僵尸进程。
 * 非 Linux 平台或无法读取 proc 文件时返回 false。
 */
function isZombieProcess(pid: number): boolean {
  if (process.platform !== "linux") {
    return false;
  }
  try {
    const status = fsSync.readFileSync(`/proc/${pid}/status`, "utf8");
    const stateMatch = status.match(/^State:\s+(\S)/m);
    return stateMatch?.[1] === "Z";
  } catch {
    return false;
  }
}

/** 仅当 PID 为正整数、存活且非 Linux 僵尸进程时返回 true。 */
export function isPidAlive(pid: number): boolean {
  if (!isValidPid(pid)) {
    return false;
  }
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (isZombieProcess(pid)) {
    return false;
  }
  return true;
}

/** 仅当 PID 无效、缺失或确认为 Linux 僵尸进程时返回 true。 */
export function isPidDefinitelyDead(pid: number): boolean {
  if (!isValidPid(pid)) {
    return true;
  }
  try {
    process.kill(pid, 0);
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH";
  }
  return isZombieProcess(pid);
}

/**
 * 从 /proc/<pid>/stat 读取进程启动时间（字段 22 "starttime"）。
 * 返回自系统启动以来的时钟节拍数；非 Linux 平台或无法读取时返回 null。
 *
 * 用于检测 PID 复用：若同一 PID 的两次读取返回不同的 starttime，
 * 说明该 PID 已被另一个进程复用。
 */
export function getProcessStartTime(pid: number): number | null {
  if (process.platform !== "linux") {
    return null;
  }
  if (!isValidPid(pid)) {
    return null;
  }
  try {
    const stat = fsSync.readFileSync(`/proc/${pid}/stat`, "utf8");
    const commEndIndex = stat.lastIndexOf(")");
    if (commEndIndex < 0) {
      return null;
    }
    // comm 字段（字段 2）被括号包裹且可能包含空格，
    // 因此从最后一个 ")" 之后切分，可靠地获取字段 3..N。
    const afterComm = stat.slice(commEndIndex + 1).trimStart();
    const fields = afterComm.split(/\s+/);
    // 字段 22 (starttime) = comm-split 后的索引 19（字段 3 为索引 0）。
    const starttime = Number(fields[19]);
    return Number.isInteger(starttime) && starttime >= 0 ? starttime : null;
  } catch {
    return null;
  }
}
