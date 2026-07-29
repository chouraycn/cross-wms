/**
 * 会话清理配置（session-cleanup）
 *
 * 参考 openclaw/src/config/sessions/cleanup-service.ts：
 * - 定义过期会话的清理策略
 * - 维护模式：enforce=直接删除，warn=仅告警
 */

import { z } from 'zod';

/** 维护模式 */
export const SessionMaintenanceModeSchema = z.enum(['enforce', 'warn']);

/** 清理配置 */
export const SessionCleanupConfigSchema = z
  .object({
    /** 维护模式 */
    mode: SessionMaintenanceModeSchema.optional(),
    /** 保留时长（毫秒数或字符串如 '7d'） */
    pruneAfter: z.union([z.string(), z.number()]).optional(),
    /** @deprecated 使用 pruneAfter 代替 */
    pruneDays: z.number().int().positive().optional(),
    /** 单会话最大条目数 */
    maxEntries: z.number().int().positive().optional(),
    /** 轮转阈值（字节，字符串如 '10MB' 或数字） */
    rotateBytes: z.union([z.string(), z.number()]).optional(),
    /** 重置归档保留时长（false 表示不归档） */
    resetArchiveRetention: z.union([z.string(), z.number(), z.literal(false)]).optional(),
    /** 最大磁盘占用（字节，超出时触发清理） */
    maxDiskBytes: z.union([z.string(), z.number()]).optional(),
    /** 高水位（达到时触发预防性清理） */
    highWaterBytes: z.union([z.string(), z.number()]).optional(),
    /** 清理任务执行间隔（毫秒） */
    cleanupIntervalMs: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

export type SessionCleanupConfig = z.infer<typeof SessionCleanupConfigSchema>;

export const DEFAULT_SESSION_CLEANUP_CONFIG: SessionCleanupConfig = {
  mode: 'enforce',
  pruneAfter: '7d',
  maxEntries: 10_000,
  rotateBytes: 10 * 1024 * 1024,
  resetArchiveRetention: '30d',
  cleanupIntervalMs: 60 * 60 * 1000, // 1 小时
};
