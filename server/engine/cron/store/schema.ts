/**
 * Cron Store Schema - 存储 schema 定义
 *
 * 由于 cross-wms 使用 JSON 文件存储而非 SQLite，这里定义的是 JSON 结构的 schema
 * 验证和类型定义，用于确保存储数据的结构验证。
 */

import { z } from "zod";

/** Cron 任务状态 schema */
export const cronJobStateSchema = z.object({
  nextRunAtMs: z.number().optional(),
  runningAtMs: z.number().optional(),
  lastRunAtMs: z.number().optional(),
  lastRunStatus: z.enum(["ok", "error", "skipped"]).optional(),
  lastStatus: z.enum(["ok", "error", "skipped"]).optional(),
  lastError: z.string().optional(),
  lastDiagnostics: z.any().optional(),
  lastDiagnosticSummary: z.string().optional(),
  lastErrorReason: z.string().optional(),
  lastDurationMs: z.number().optional(),
  lastSuccessAtMs: z.number().optional(),
  consecutiveErrors: z.number().optional(),
  consecutiveSkipped: z.number().optional(),
  lastFailureAlertAtMs: z.number().optional(),
  scheduleErrorCount: z.number().optional(),
  lastDeliveryStatus: z.enum(["delivered", "not-delivered", "unknown", "not-requested"]).optional(),
  lastDeliveryError: z.string().optional(),
  lastDelivered: z.boolean().optional(),
  lastFailureNotificationDelivered: z.boolean().optional(),
  lastFailureNotificationDeliveryStatus: z.enum(["delivered", "not-delivered", "unknown", "not-requested"]).optional(),
  lastFailureNotificationDeliveryError: z.string().optional(),
}).passthrough();

/** Cron 调度 schema */
export const cronScheduleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("at"),
    at: z.union([z.string(), z.number()]),
  }),
  z.object({
    kind: z.literal("every"),
    everyMs: z.number(),
    anchorMs: z.number().optional(),
  }),
  z.object({
    kind: z.literal("cron"),
    expr: z.string(),
    tz: z.string().optional(),
    staggerMs: z.number().optional(),
  }),
]);

/** Cron payload schema */
export const cronPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("systemEvent"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("agentTurn"),
    message: z.string(),
    model: z.string().optional().nullable(),
    fallbacks: z.array(z.string()).optional().nullable(),
    thinking: z.string().optional().nullable(),
    timeoutSeconds: z.number().optional().nullable(),
    allowUnsafeExternalContent: z.boolean().optional().nullable(),
    lightContext: z.boolean().optional().nullable(),
    toolsAllow: z.array(z.string()).optional().nullable(),
  }),
  z.object({
    kind: z.literal("command"),
    argv: z.array(z.string()),
    cwd: z.string().optional().nullable(),
    env: z.record(z.string(), z.string()).optional().nullable(),
    input: z.string().optional().nullable(),
    timeoutSeconds: z.number().optional().nullable(),
    noOutputTimeoutSeconds: z.number().optional().nullable(),
    outputMaxBytes: z.number().optional().nullable(),
  }),
]);

/** Cron 投递 schema */
export const cronDeliverySchema = z.object({
  mode: z.enum(["none", "announce", "webhook"]),
  channel: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  threadId: z.union([z.string(), z.number()]).optional().nullable(),
  accountId: z.string().optional().nullable(),
  bestEffort: z.boolean().optional().nullable(),
  completionDestination: z.object({
    mode: z.literal("webhook"),
    to: z.string().optional().nullable(),
  }).optional().nullable(),
  failureDestination: z.object({
    channel: z.string().optional().nullable(),
    to: z.string().optional().nullable(),
    accountId: z.string().optional().nullable(),
    mode: z.enum(["announce", "webhook"]).optional().nullable(),
  }).optional().nullable(),
});

/** Cron 失败告警 schema */
export const cronFailureAlertSchema = z.object({
  after: z.number().optional().nullable(),
  channel: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  cooldownMs: z.number().optional().nullable(),
  includeSkipped: z.boolean().optional().nullable(),
  mode: z.enum(["announce", "webhook"]).optional().nullable(),
  accountId: z.string().optional().nullable(),
});

/** Cron 任务 schema */
export const cronJobSchema = z.object({
  id: z.string(),
  agentId: z.string().optional().nullable(),
  sessionKey: z.string().optional().nullable(),
  name: z.string(),
  description: z.string().optional().nullable(),
  enabled: z.boolean(),
  deleteAfterRun: z.boolean().optional().nullable(),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
  schedule: cronScheduleSchema,
  sessionTarget: z.union([
    z.literal("main"),
    z.literal("isolated"),
    z.literal("current"),
    z.string().refine((s) => s.startsWith("session:")),
  ]),
  wakeMode: z.enum(["next-heartbeat", "now"]),
  payload: cronPayloadSchema,
  delivery: cronDeliverySchema.optional().nullable(),
  failureAlert: z.union([cronFailureAlertSchema, z.literal(false)]).optional().nullable(),
  state: cronJobStateSchema.default({}),
});

/** Cron 存储文件 schema */
export const cronStoreFileSchema = z.object({
  version: z.literal(1),
  jobs: z.array(cronJobSchema),
});

/** 隔离文件 schema */
export const cronQuarantineFileSchema = z.object({
  version: z.literal(1),
  jobs: z.array(z.object({
    quarantinedAtMs: z.number(),
    sourceIndex: z.number(),
    reason: z.string(),
    job: z.any().optional(),
    raw: z.any().optional(),
    state: z.any().optional(),
    updatedAtMs: z.number().optional(),
    scheduleIdentity: z.string().optional(),
  })),
});

/** 验证 cron 存储文件 */
export function validateCronStoreFile(data: unknown): data is { version: 1; jobs: unknown[] } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return record.version === 1 && Array.isArray(record.jobs);
}
