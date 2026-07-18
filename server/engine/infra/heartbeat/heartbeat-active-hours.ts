// 移植自 openclaw/src/infra/heartbeat-active-hours.ts
// 评估心跳 active-hours 窗口。
//
// 降级策略：
//  - 源文件依赖 ../agents/date-time.js 的 resolveUserTimezone 与
//    ../config/types.agent-defaults.js 的 AgentDefaultsConfig 类型。
//  - cross-wms 未移植这些模块，此处将 resolveUserTimezone 降级为返回宿主时区，
//    AgentDefaultsConfig 降级为 unknown 占位类型。
//  - OpenClawConfig 类型来自 _runtime-stubs.ts 的降级定义。
import type { OpenClawConfig } from "../_runtime-stubs.js";

type HeartbeatConfig = HeartbeatActiveHoursConfig;

/** 心跳 active-hours 配置（降级类型，仅保留源文件用到的字段） */
export type HeartbeatActiveHoursConfig = {
  every?: string;
  prompt?: string;
  target?: string;
  model?: string;
  ackMaxChars?: number;
  timeoutSeconds?: number;
  activeHours?: {
    start?: string;
    end?: string;
    timezone?: string;
  };
};

const ACTIVE_HOURS_TIME_PATTERN = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

/** 解析心跳 active-hours 使用的时区。降级实现：未知时区回退到宿主时区。 */
export function resolveActiveHoursTimezone(cfg: OpenClawConfig, raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "user") {
    return resolveUserTimezone(cfg);
  }
  if (trimmed === "local") {
    const host = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return host?.trim() || "UTC";
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return resolveUserTimezone(cfg);
  }
}

function parseActiveHoursTime(opts: { allow24: boolean }, raw?: string): number | null {
  if (!raw || !ACTIVE_HOURS_TIME_PATTERN.test(raw)) {
    return null;
  }
  const [hourStr, minuteStr] = raw.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  if (hour === 24) {
    if (!opts.allow24 || minute !== 0) {
      return null;
    }
    return 24 * 60;
  }
  return hour * 60 + minute;
}

function resolveMinutesInTimeZone(nowMs: number, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(nowMs));
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    }
    const hour = Number(map.hour);
    const minute = Number(map.minute);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

/**
 * 解析用户时区。
 * 降级实现：openclaw 的 ../agents/date-time.js 中 resolveUserTimezone 接受
 * cfg.agents?.defaults?.userTimezone 参数。cross-wms 未移植该模块，此处从
 * 降级的 OpenClawConfig 中尽力提取 userTimezone，否则回退到宿主时区。
 */
function resolveUserTimezone(cfg: OpenClawConfig): string {
  const agents = cfg.agents as { defaults?: { userTimezone?: string } } | undefined;
  const configured = agents?.defaults?.userTimezone?.trim();
  if (configured) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: configured }).format(new Date());
      return configured;
    } catch {
      // 回退到宿主时区
    }
  }
  const host = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return host?.trim() || "UTC";
}

/** 当当前时间在配置的心跳窗口内时返回 true。 */
export function isWithinActiveHours(
  cfg: OpenClawConfig,
  heartbeat?: HeartbeatConfig,
  nowMs?: number,
): boolean {
  const active = heartbeat?.activeHours;
  if (!active) {
    return true;
  }

  const startMin = parseActiveHoursTime({ allow24: false }, active.start);
  const endMin = parseActiveHoursTime({ allow24: true }, active.end);
  if (startMin === null || endMin === null) {
    return true;
  }
  if (startMin === endMin) {
    return false;
  }

  const timeZone = resolveActiveHoursTimezone(cfg, active.timezone);
  const currentMin = resolveMinutesInTimeZone(nowMs ?? Date.now(), timeZone);
  if (currentMin === null) {
    return true;
  }

  if (endMin > startMin) {
    return currentMin >= startMin && currentMin < endMin;
  }
  return currentMin >= startMin || currentMin < endMin;
}
