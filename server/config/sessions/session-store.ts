/**
 * 会话存储配置（session-store）
 *
 * 参考 openclaw/src/config/sessions/store.ts：
 * - 定义会话存储路径、写入锁、磁盘预算等配置项
 * - cross-wms 简化为纯配置类型，运行时由 dao/session 模块消费
 */

import { z } from 'zod';
import { sensitive } from '../zod-schema.sensitive.js';

/** 写入锁配置：防止并发写入同一会话文件 */
const WriteLockConfigSchema = z
  .object({
    acquireTimeoutMs: z.number().int().positive().optional(),
    staleMs: z.number().int().positive().optional(),
    maxHoldMs: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

/** 单个会话存储条目（运行时元数据，不直接由用户配置） */
export const SessionStoreEntrySchema = z
  .object({
    sessionId: z.string(),
    sessionFile: z.string().optional(),
    store: z.string().optional(),
    mainKey: z.string().optional().register(sensitive),
  })
  .strict();

/** 会话存储配置 */
export const SessionStoreConfigSchema = z
  .object({
    /** 存储目录（默认 AppPaths.sessionsDir） */
    storeDir: z.string().optional(),
    /** 主会话别名，用于多端会话同步 */
    mainKey: z.string().optional().register(sensitive),
    /** 写入锁 */
    writeLock: WriteLockConfigSchema,
    /** 是否启用 fsync（保证落盘，默认 false） */
    fsync: z.boolean().optional(),
    /** 单会话文件最大字节数（超出时触发压缩/轮转） */
    maxFileBytes: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

export type SessionStoreConfig = z.infer<typeof SessionStoreConfigSchema>;
export type SessionStoreEntry = z.infer<typeof SessionStoreEntrySchema>;

/** 默认会话存储配置 */
export const DEFAULT_SESSION_STORE_CONFIG: SessionStoreConfig = {
  fsync: false,
  writeLock: {
    acquireTimeoutMs: 5000,
    staleMs: 30_000,
    maxHoldMs: 60_000,
  },
};
