// 移植自 openclaw/src/infra/system-presence.ts（降级实现）
// 系统存在性检测。
import os from "node:os";

export type SystemPresence = {
  hostname: string;
  platform: string;
  arch: string;
  uptime: number;
  pid: number;
};

/** 解析当前系统存在性 */
export function resolveSystemPresence(): SystemPresence {
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    uptime: Math.floor(os.uptime() * 1000),
    pid: process.pid,
  };
}

/** 序列化系统存在性 */
export function serializeSystemPresence(presence: SystemPresence): string {
  return JSON.stringify(presence);
}

/** 反序列化系统存在性 */
export function deserializeSystemPresence(raw: string): SystemPresence | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SystemPresence>;
    if (typeof parsed.hostname !== "string" || typeof parsed.platform !== "string") return null;
    return {
      hostname: parsed.hostname,
      platform: parsed.platform,
      arch: parsed.arch ?? process.arch,
      uptime: parsed.uptime ?? 0,
      pid: parsed.pid ?? 0,
    };
  } catch {
    return null;
  }
}

/** 比较两个系统存在性是否匹配 */
export function systemPresenceMatches(a: SystemPresence, b: SystemPresence): boolean {
  return a.hostname === b.hostname && a.platform === b.platform;
}
