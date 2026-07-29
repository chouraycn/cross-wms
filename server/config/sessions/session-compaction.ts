/**
 * 会话压缩配置（session-compaction）
 *
 * 参考 openclaw/src/config/sessions/compaction-session-file.ts：
 * - 定义会话上下文超长时的压缩策略
 * - 阈值触发：条目数/字节数/Token 数
 */

import { z } from 'zod';

/** 压缩触发条件 */
const CompactionTriggerSchema = z
  .object({
    /** 条目数阈值 */
    maxEntries: z.number().int().positive().optional(),
    /** 字节数阈值 */
    maxBytes: z.number().int().positive().optional(),
    /** Token 数阈值 */
    maxTokens: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

/** 压缩策略 */
export const CompactionStrategySchema = z.enum(['summarize', 'truncate', 'off']);

/** 会话压缩配置 */
export const SessionCompactionConfigSchema = z
  .object({
    /** 是否启用自动压缩 */
    enabled: z.boolean().optional(),
    /** 压缩策略 */
    strategy: CompactionStrategySchema.optional(),
    /** 触发条件 */
    trigger: CompactionTriggerSchema,
    /** 压缩后保留的最近条目数（用于上下文连续性） */
    keepRecentEntries: z.number().int().positive().optional(),
    /** 压缩超时（毫秒） */
    timeoutMs: z.number().int().positive().optional(),
    /** 压缩失败时是否降级为截断（避免阻塞主流程） */
    fallbackToTruncate: z.boolean().optional(),
  })
  .strict()
  .optional();

export type SessionCompactionConfig = z.infer<typeof SessionCompactionConfigSchema>;

export const DEFAULT_SESSION_COMPACTION_CONFIG: SessionCompactionConfig = {
  enabled: true,
  strategy: 'summarize',
  trigger: {
    maxEntries: 200,
    maxBytes: 100 * 1024, // 100KB
    maxTokens: 16_000,
  },
  keepRecentEntries: 20,
  timeoutMs: 30_000,
  fallbackToTruncate: true,
};
