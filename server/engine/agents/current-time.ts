/**
 * Formats cron-style current-time prompt text with local and UTC references.
 *
 * 移植自 openclaw/src/agents/current-time.ts。
 * 降级策略：
 *   - `resolveDateTimestampMs` 来自 @openclaw/normalization-core/number-coercion，
 *     本地内联最小实现（Number.isFinite 守卫）。
 *   - `TimeFormatPreference`、`formatUserTime`、`resolveUserTimeFormat`、
 *     `resolveUserTimezone` 来自 ./date-time.js（cross-wms 的 date-time.ts 未导出这些），
 *     本地内联最小实现。
 */

export type TimeFormatPreference = "auto" | "12" | "24";
type ResolvedTimeFormat = "12" | "24";

let cachedTimeFormat: ResolvedTimeFormat | undefined;

/** 内联降级实现：将输入归一化为有限毫秒时间戳。 */
function resolveDateTimestampMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

/** Resolve a valid IANA timezone from config, host preferences, or UTC. */
function resolveUserTimezone(configured?: string): string {
  const trimmed = configured?.trim();
  if (trimmed) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
      return trimmed;
    } catch {
      // ignore invalid timezone
    }
  }
  const host = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return host?.trim() || "UTC";
}

/** Resolve 12/24-hour display preference, detecting the host for `auto`. */
function resolveUserTimeFormat(preference?: TimeFormatPreference): ResolvedTimeFormat {
  if (preference === "12" || preference === "24") {
    return preference;
  }
  if (cachedTimeFormat) {
    return cachedTimeFormat;
  }
  cachedTimeFormat = detectSystemTimeFormat() ? "24" : "12";
  return cachedTimeFormat;
}

function detectSystemTimeFormat(): boolean {
  try {
    const sample = new Date(2000, 0, 1, 13, 0);
    const formatted = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(sample);
    return formatted.includes("13");
  } catch {
    return false;
  }
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) {
    return "th";
  }
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** Format the prompt-facing localized time string with weekday and date. */
function formatUserTime(
  date: Date,
  timeZone: string,
  format: ResolvedTimeFormat,
): string | undefined {
  const use24Hour = format === "24";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: use24Hour ? "2-digit" : "numeric",
      minute: "2-digit",
      hourCycle: use24Hour ? "h23" : "h12",
    }).formatToParts(date);
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    }
    if (!map.weekday || !map.year || !map.month || !map.day || !map.hour || !map.minute) {
      return undefined;
    }
    const dayNum = Number.parseInt(map.day, 10);
    const suffix = ordinalSuffix(dayNum);
    const timePart = use24Hour
      ? `${map.hour}:${map.minute}`
      : `${map.hour}:${map.minute} ${map.dayPeriod ?? ""}`.trim();
    return `${map.weekday}, ${map.month} ${dayNum}${suffix}, ${map.year} - ${timePart}`;
  } catch {
    return undefined;
  }
}

export type CronStyleNow = {
  userTimezone: string;
  formattedTime: string;
  timeLine: string;
};

type TimeConfigLike = {
  agents?: {
    defaults?: {
      userTimezone?: string;
      timeFormat?: TimeFormatPreference;
    };
  };
};

/** Resolve localized and UTC current-time text for agent prompts. */
export function resolveCronStyleNow(cfg: TimeConfigLike, nowMs: number): CronStyleNow {
  const userTimezone = resolveUserTimezone(cfg.agents?.defaults?.userTimezone);
  const userTimeFormat = resolveUserTimeFormat(cfg.agents?.defaults?.timeFormat);
  const timestampMs = resolveDateTimestampMs(nowMs);
  const date = new Date(timestampMs);
  const formattedTime = formatUserTime(date, userTimezone, userTimeFormat) ?? date.toISOString();
  const utcTime = date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const timeLine = `Current time: ${formattedTime} (${userTimezone})\nReference UTC: ${utcTime}`;
  return { userTimezone, formattedTime, timeLine };
}

/**
 * Append a fresh current-time block, or refresh a previously helper-injected one,
 * so heartbeat/cron prompts flowing through this helper repeatedly never leak a
 * stale `Current time:` value (issue #44993).
 */
// Matches the helper's own injected two-line `Current time: ...\nReference UTC: ...` block.
// Upstream #42654 split the helper output across two lines:
//   Line 1: `Current time: <formattedTime> (<userTimezone>)`
//   Line 2: `Reference UTC: YYYY-MM-DD HH:MM UTC`
// The natural-language `formattedTime` portion is locale/format-dependent (e.g.
// `Thursday, April 30th, 2026 - 10:00 AM` from `formatUserTime`, or an ISO fallback),
// so we anchor on the helper-only deterministic shape: `(<TZ>)` on line 1 immediately
// followed by `Reference UTC: <ISO UTC>` on line 2. The `(TZ)` group rejects parens (so
// timezone IDs like `Asia/Seoul` are accepted), and the strict `Reference UTC:` prefix
// plus ISO+UTC tail rejects user-authored reminder lines that happen to start with
// `Current time:` but lack the helper's exact two-line tail format.
const CURRENT_TIME_LINE_RE =
  /^Current time: .+? \([^)]+\)\nReference UTC: \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/gm;

export function appendCronStyleCurrentTimeLine(text: string, cfg: TimeConfigLike, nowMs: number) {
  const base = text.trimEnd();
  if (!base) {
    return base;
  }
  const { timeLine } = resolveCronStyleNow(cfg, nowMs);
  if (!CURRENT_TIME_LINE_RE.test(base)) {
    return `${base}\n${timeLine}`;
  }
  CURRENT_TIME_LINE_RE.lastIndex = 0;
  let replaced = false;
  const refreshed = base.replace(CURRENT_TIME_LINE_RE, () => {
    if (replaced) {
      return "";
    }
    replaced = true;
    return timeLine;
  });
  return refreshed
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n+(?=Current time:)/g, "\n")
    .trimEnd();
}
