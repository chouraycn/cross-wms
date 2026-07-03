/**
 * Normalize - 任务规范化
 *
 * 对齐 openclaw/src/cron/normalize.ts：在持久化与校验之前，把松散的 cron job
 * 输入规范化为统一形态，并按 create 语义补齐默认值。
 *
 * 三种负载类型（CronPayloadType）：
 * - systemEvent ：系统事件，sessionTarget 默认 main
 * - agentTurn   ：agent 对话，sessionTarget 默认 isolated
 * - command     ：命令执行，sessionTarget 默认 isolated
 *
 * 默认值规则：
 * - wakeMode 缺省 → "now"
 * - enabled 缺省 → true
 * - schedule.kind === "at" 且未显式指定 deleteAfterRun → true
 * - detached 投递（isolated / current / session:* 任务，且负载为 agentTurn/command）
 *   缺省 delivery.mode = "announce"
 */

import { parseAbsoluteTime } from "./parse.js";
import { parseScheduleType } from "./schedule.js";

/** Cron 负载类型 */
export type CronPayloadType = "systemEvent" | "agentTurn" | "command";

/** 合法的 sessionTarget 枚举 */
export type CronSessionTarget = "main" | "isolated" | "current" | `session:${string}`;

/** 合法的 wakeMode 枚举 */
export type CronWakeMode = "now" | "next-heartbeat";

type UnknownRecord = Record<string, unknown>;

/** 规范化选项 */
export interface NormalizeCronJobOptions {
  /** 是否补齐 create 时的默认值，默认 false（patch 语义不补默认值） */
  applyDefaults?: boolean;
  /** 会话上下文，用于解析 "current" sessionTarget 的实际会话 */
  sessionContext?: { sessionKey?: string };
}

/** 是否为普通对象（非数组、非 null） */
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 规范化可选字符串：非字符串或空白返回 undefined */
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** 规范化为小写字符串（空白返回空串） */
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** 规范化为可选小写字符串 */
function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  const lower = normalizeLowercaseStringOrEmpty(value);
  return lower ? lower : undefined;
}

/** 把 epoch 毫秒转成 ISO 字符串 */
function timestampMsToIsoString(ms: number): string {
  return new Date(ms).toISOString();
}

/** 规范化负载类型字符串为标准枚举形式 */
function coercePayloadKind(raw: unknown): CronPayloadType | undefined {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  if (lower === "agentturn") return "agentTurn";
  if (lower === "systemevent") return "systemEvent";
  if (lower === "command") return "command";
  return undefined;
}

/** 规范化 sessionTarget */
function normalizeSessionTarget(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  const lower = normalizeLowercaseStringOrEmpty(trimmed);
  if (lower === "main" || lower === "isolated" || lower === "current") {
    return lower;
  }
  // 自定义 session 目标必须以 session: 前缀，且 id 非空、不含路径分隔符
  if (lower.startsWith("session:")) {
    const id = trimmed.slice(8).trim();
    if (!id || id.includes("/") || id.includes("\\") || id.includes("\0")) {
      return undefined;
    }
    return `session:${id}`;
  }
  return undefined;
}

/** 规范化 wakeMode */
function normalizeWakeMode(raw: unknown): CronWakeMode | undefined {
  const lower = normalizeLowercaseStringOrEmpty(raw);
  if (lower === "now" || lower === "next-heartbeat") {
    return lower;
  }
  return undefined;
}

/** 规范化 agentId（去空白，简单校验） */
function normalizeAgentId(raw: unknown): string | undefined {
  const trimmed = normalizeOptionalString(raw);
  if (!trimmed) {
    return undefined;
  }
  // 复用与 session-target 一致的安全校验，避免路径注入
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) {
    return undefined;
  }
  return trimmed;
}

/** 规范化非空字符串数组 */
function normalizeTrimmedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  if (value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    return undefined;
  }
  return value.map((entry) => (entry as string).trim());
}

/** 规范化字符串到字符串的记录 */
function normalizeTrimmedStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const entries: Array<[string, string]> = [];
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizeOptionalString(rawKey);
    const val = typeof rawValue === "string" ? rawValue : undefined;
    if (!key || val === undefined) {
      return undefined;
    }
    entries.push([key, val]);
  }
  return Object.fromEntries(entries);
}

/** 规范化命令 argv */
function normalizeCommandArgv(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  if (value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    return undefined;
  }
  return [...value];
}

/** 仅 agentTurn 负载才会出现的字段提示 */
function hasAgentTurnOnlyPayloadHint(payload: UnknownRecord): boolean {
  return (
    "model" in payload ||
    "fallbacks" in payload ||
    "thinking" in payload ||
    "timeoutSeconds" in payload ||
    "toolsAllow" in payload ||
    typeof payload.lightContext === "boolean" ||
    typeof payload.allowUnsafeExternalContent === "boolean"
  );
}

/** 规范化 schedule 子对象 */
function coerceSchedule(schedule: UnknownRecord): UnknownRecord {
  const next: UnknownRecord = { ...schedule };
  const rawKind = normalizeLowercaseStringOrEmpty(schedule.kind);
  const kind = rawKind === "at" || rawKind === "every" || rawKind === "cron" ? rawKind : undefined;
  const exprRaw = normalizeOptionalString(schedule.expr) ?? "";
  const atString = normalizeOptionalString(schedule.at) ?? "";
  const parsedAtMs = atString ? parseAbsoluteTime(atString) : null;

  if (kind) {
    next.kind = kind;
  }

  // 把 at 规范化为 UTC ISO 字符串
  const parsedAtIso = parsedAtMs !== null ? timestampMsToIsoString(parsedAtMs) : undefined;
  if (atString) {
    next.at = parsedAtIso ?? atString;
  } else if (parsedAtIso !== undefined) {
    next.at = parsedAtIso;
  }

  if (exprRaw) {
    next.expr = exprRaw;
  } else if ("expr" in next) {
    delete next.expr;
  }

  if (typeof schedule.everyMs === "number" && Number.isFinite(schedule.everyMs) && schedule.everyMs >= 1) {
    next.everyMs = Math.floor(schedule.everyMs);
  } else if (typeof schedule.everyMs === "string") {
    const n = Number(schedule.everyMs.trim());
    if (Number.isFinite(n) && n >= 1) {
      next.everyMs = Math.floor(n);
    } else {
      delete next.everyMs;
    }
  } else if ("everyMs" in next) {
    delete next.everyMs;
  }

  if (typeof schedule.anchorMs === "number" && Number.isFinite(schedule.anchorMs) && schedule.anchorMs >= 0) {
    next.anchorMs = Math.floor(schedule.anchorMs);
  } else if ("anchorMs" in next) {
    delete next.anchorMs;
  }

  // 每个 kind 保留各自字段，剔除其他 kind 的残留，避免持久化后留下陈旧配置
  if (next.kind === "at") {
    delete next.everyMs;
    delete next.anchorMs;
    delete next.expr;
    delete next.tz;
    delete next.staggerMs;
  } else if (next.kind === "every") {
    delete next.at;
    delete next.expr;
    delete next.tz;
    delete next.staggerMs;
  } else if (next.kind === "cron") {
    delete next.at;
    delete next.everyMs;
    delete next.anchorMs;
  }

  return next;
}

/** 规范化 payload 子对象 */
function coercePayload(payload: UnknownRecord): UnknownRecord {
  const next: UnknownRecord = { ...payload };
  const kind = coercePayloadKind(next.kind);
  if (kind) {
    next.kind = kind;
  }

  if (typeof next.message === "string") {
    next.message = normalizeOptionalString(next.message) ?? "";
  }
  if (typeof next.text === "string") {
    next.text = normalizeOptionalString(next.text) ?? "";
  }

  if ("argv" in next) {
    const argv = normalizeCommandArgv(next.argv);
    if (Array.isArray(argv) && argv.length > 0) {
      next.argv = argv;
    } else {
      delete next.argv;
    }
  }
  if ("cwd" in next) {
    const cwd = normalizeOptionalString(next.cwd);
    if (cwd) {
      next.cwd = cwd;
    } else {
      delete next.cwd;
    }
  }
  if ("env" in next) {
    const env = normalizeTrimmedStringRecord(next.env);
    if (env) {
      next.env = env;
    } else {
      delete next.env;
    }
  }
  if ("fallbacks" in next) {
    const fallbacks = normalizeTrimmedStringArray(next.fallbacks);
    if (fallbacks) {
      next.fallbacks = fallbacks;
    } else {
      delete next.fallbacks;
    }
  }
  if ("toolsAllow" in next) {
    const toolsAllow = normalizeTrimmedStringArray(next.toolsAllow);
    if (toolsAllow) {
      next.toolsAllow = toolsAllow;
    } else {
      delete next.toolsAllow;
    }
  }

  // 未显式给出 kind，但携带 agentTurn 专属字段时，按 agentTurn 推断
  if (!("kind" in next) && typeof next.text === "string" && hasAgentTurnOnlyPayloadHint(next)) {
    next.kind = "agentTurn";
    next.message = next.text;
  }

  // 各 kind 互斥字段清理
  if (next.kind === "systemEvent") {
    delete next.message;
    delete next.model;
    delete next.fallbacks;
    delete next.thinking;
    delete next.timeoutSeconds;
    delete next.lightContext;
    delete next.allowUnsafeExternalContent;
    delete next.toolsAllow;
    delete next.argv;
    delete next.cwd;
    delete next.env;
    delete next.input;
  } else if (next.kind === "agentTurn") {
    delete next.text;
    delete next.argv;
    delete next.cwd;
    delete next.env;
    delete next.input;
  } else if (next.kind === "command") {
    delete next.text;
    delete next.message;
    delete next.model;
    delete next.fallbacks;
    delete next.thinking;
    delete next.lightContext;
    delete next.allowUnsafeExternalContent;
    delete next.toolsAllow;
  }
  return next;
}

/** 规范化 delivery 子对象 */
function coerceDelivery(delivery: UnknownRecord): UnknownRecord {
  const next: UnknownRecord = { ...delivery };
  const mode = normalizeOptionalLowercaseString(next.mode);
  if (mode === "announce" || mode === "webhook") {
    next.mode = mode;
  } else if (mode) {
    delete next.mode;
  }
  if (typeof next.channel === "string") {
    const channel = normalizeOptionalLowercaseString(next.channel);
    if (channel) {
      next.channel = channel;
    } else {
      delete next.channel;
    }
  }
  if (typeof next.to === "string") {
    const to = normalizeOptionalString(next.to);
    if (to) {
      next.to = to;
    } else {
      delete next.to;
    }
  }
  if (typeof next.accountId === "string") {
    const accountId = normalizeOptionalString(next.accountId);
    if (accountId) {
      next.accountId = accountId;
    } else {
      delete next.accountId;
    }
  }
  if (isRecord(next.failureDestination)) {
    next.failureDestination = coerceFailureDestination(next.failureDestination);
  } else if (next.failureDestination === null) {
    next.failureDestination = null;
  } else if ("failureDestination" in next) {
    delete next.failureDestination;
  }
  return next;
}

/** 规范化 failureDestination 子对象 */
function coerceFailureDestination(value: UnknownRecord): UnknownRecord {
  const next: UnknownRecord = { ...value };
  if (typeof next.channel === "string") {
    const channel = normalizeOptionalLowercaseString(next.channel);
    if (channel) {
      next.channel = channel;
    } else {
      delete next.channel;
    }
  }
  if (typeof next.to === "string") {
    const to = normalizeOptionalString(next.to);
    if (to) {
      next.to = to;
    } else {
      delete next.to;
    }
  }
  if (typeof next.mode === "string") {
    const mode = normalizeOptionalLowercaseString(next.mode);
    if (mode === "announce" || mode === "webhook") {
      next.mode = mode;
    } else {
      delete next.mode;
    }
  }
  return next;
}

/** 推断任务名输入 */
export interface InferCronJobNameInput {
  schedule?: { kind?: unknown; at?: unknown; everyMs?: unknown; expr?: unknown };
  payload?: { kind?: unknown; text?: unknown; message?: unknown; argv?: unknown };
}

/**
 * 自动推断 cron 任务名
 * 规则：负载类型前缀 + 调度描述
 */
export function inferCronJobName(input: InferCronJobNameInput): string {
  const parts: string[] = [];

  const payloadKind = coercePayloadKind(input.payload?.kind);
  if (payloadKind === "systemEvent") {
    parts.push("system-event");
  } else if (payloadKind === "agentTurn") {
    parts.push("agent-turn");
  } else if (payloadKind === "command") {
    parts.push("command");
  }

  // 调度描述
  const schedule = input.schedule ?? {};
  const kind = normalizeLowercaseStringOrEmpty(schedule.kind);
  if (kind === "at" || (kind === "" && schedule.at !== undefined)) {
    const atMs = parseAbsoluteTime(schedule.at as string | number);
    if (atMs !== null) {
      parts.push(`at-${new Date(atMs).toISOString()}`);
    } else {
      parts.push("one-shot");
    }
  } else if (kind === "every" || (kind === "" && schedule.everyMs !== undefined)) {
    const everyMs = typeof schedule.everyMs === "number" ? schedule.everyMs : Number(schedule.everyMs);
    if (Number.isFinite(everyMs)) {
      parts.push(`every-${Math.floor(everyMs)}ms`);
    } else {
      parts.push("every");
    }
  } else if (kind === "cron" || (kind === "" && typeof schedule.expr === "string")) {
    const expr = typeof schedule.expr === "string" ? schedule.expr.trim() : "";
    parts.push(expr ? `cron-${expr}` : "cron");
  }

  // 负载摘要：取消息或命令首段
  if (payloadKind === "agentTurn" || payloadKind === "systemEvent") {
    const msg = normalizeOptionalString(input.payload?.message ?? input.payload?.text);
    if (msg) {
      parts.push(msg.slice(0, 40));
    }
  } else if (payloadKind === "command") {
    const argv = normalizeCommandArgv(input.payload?.argv);
    if (argv && argv.length > 0) {
      parts.push(argv[0]);
    }
  }

  const name = parts.join(" ").trim();
  return name ? name : "cron-job";
}

/**
 * 规范化 cron job 输入
 * @param raw 原始输入
 * @param options.applyDefaults 是否补齐 create 默认值（默认 false）
 * @param options.sessionContext 会话上下文，用于解析 "current" sessionTarget
 * @returns 规范化后的 cron job 记录，输入非对象时返回 null
 */
export function normalizeCronJob(
  raw: unknown,
  options: NormalizeCronJobOptions = {},
): UnknownRecord | null {
  if (!isRecord(raw)) {
    return null;
  }
  const applyDefaults = options.applyDefaults ?? false;
  const next: UnknownRecord = { ...raw };

  // agentId
  if ("agentId" in raw) {
    if (raw.agentId === null) {
      next.agentId = null;
    } else {
      const agentId = normalizeAgentId(raw.agentId);
      if (agentId) {
        next.agentId = agentId;
      } else {
        delete next.agentId;
      }
    }
  }

  // sessionKey
  if ("sessionKey" in raw) {
    if (raw.sessionKey === null) {
      next.sessionKey = null;
    } else {
      const sessionKey = normalizeOptionalString(raw.sessionKey);
      if (sessionKey) {
        next.sessionKey = sessionKey;
      } else {
        delete next.sessionKey;
      }
    }
  }

  // enabled
  if ("enabled" in raw) {
    const enabled = raw.enabled;
    if (typeof enabled === "boolean") {
      next.enabled = enabled;
    } else if (typeof enabled === "string") {
      const lower = normalizeLowercaseStringOrEmpty(enabled);
      if (lower === "true") {
        next.enabled = true;
      } else if (lower === "false") {
        next.enabled = false;
      }
    }
  }

  // sessionTarget
  if ("sessionTarget" in raw) {
    const normalized = normalizeSessionTarget(raw.sessionTarget);
    if (normalized) {
      next.sessionTarget = normalized;
    } else {
      delete next.sessionTarget;
    }
  }

  // wakeMode
  if ("wakeMode" in raw) {
    const normalized = normalizeWakeMode(raw.wakeMode);
    if (normalized) {
      next.wakeMode = normalized;
    } else {
      delete next.wakeMode;
    }
  }

  // schedule
  if (isRecord(raw.schedule)) {
    next.schedule = coerceSchedule(raw.schedule);
  }

  // payload
  if (isRecord(raw.payload)) {
    next.payload = coercePayload(raw.payload);
  }

  // delivery
  if (isRecord(raw.delivery)) {
    next.delivery = coerceDelivery(raw.delivery);
  }

  if (!applyDefaults) {
    // patch 语义：保留未提供字段，避免局部更新改写无关配置
    return next;
  }

  // —— 以下为 create 时的默认值补齐 ——

  if (!next.wakeMode) {
    next.wakeMode = "now";
  }
  if (typeof next.enabled !== "boolean") {
    next.enabled = true;
  }

  // 自动命名
  if ((typeof next.name !== "string" || !next.name.trim()) && isRecord(next.schedule) && isRecord(next.payload)) {
    next.name = inferCronJobName({
      schedule: next.schedule as InferCronJobNameInput["schedule"],
      payload: next.payload as InferCronJobNameInput["payload"],
    });
  } else if (typeof next.name === "string") {
    const trimmed = next.name.trim();
    if (trimmed) {
      next.name = trimmed;
    }
  }

  // sessionTarget 默认值：systemEvent → main；agentTurn/command → isolated
  if (!next.sessionTarget && isRecord(next.payload)) {
    const kind = coercePayloadKind(next.payload.kind);
    if (kind === "systemEvent") {
      next.sessionTarget = "main";
    } else if (kind === "agentTurn" || kind === "command") {
      next.sessionTarget = "isolated";
    }
  }

  // 解析 "current" sessionTarget 为实际会话 key（若有上下文）
  if (next.sessionTarget === "current" && options.sessionContext?.sessionKey) {
    next.sessionTarget = `session:${options.sessionContext.sessionKey}`;
  }

  // at 类型默认运行后删除
  if (isRecord(next.schedule) && parseScheduleType(next.schedule) === "at" && !("deleteAfterRun" in next)) {
    next.deleteAfterRun = true;
  }

  // detached 投递默认 announce：isolated / current / session:* 任务，
  // 且负载为 agentTurn/command，且未显式配置 delivery
  const payloadKind = isRecord(next.payload) ? coercePayloadKind(next.payload.kind) : undefined;
  const sessionTarget = typeof next.sessionTarget === "string" ? next.sessionTarget : "";
  const isDetachedDeliveryJob =
    sessionTarget === "isolated" ||
    sessionTarget === "current" ||
    sessionTarget.startsWith("session:") ||
    (sessionTarget === "" && (payloadKind === "agentTurn" || payloadKind === "command"));
  const hasDelivery = "delivery" in next && next.delivery !== undefined;
  if (!hasDelivery && isDetachedDeliveryJob && (payloadKind === "agentTurn" || payloadKind === "command")) {
    next.delivery = { mode: "announce" };
  }

  return next;
}

/** 规范化 cron create 请求并补齐 create 默认值 */
export function normalizeCronJobCreate(
  raw: unknown,
  options?: Omit<NormalizeCronJobOptions, "applyDefaults">,
): UnknownRecord | null {
  return normalizeCronJob(raw, { applyDefaults: true, ...options });
}

/** 规范化 cron patch 请求（不补齐默认值） */
export function normalizeCronJobPatch(
  raw: unknown,
  options?: NormalizeCronJobOptions,
): UnknownRecord | null {
  return normalizeCronJob(raw, { applyDefaults: false, ...options });
}
