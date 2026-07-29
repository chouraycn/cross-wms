/**
 * 会话生命周期（session-lifecycle）
 *
 * 参考 openclaw/src/config/sessions/lifecycle.ts：
 * - 定义会话的创建/重置/终止时机
 * - cross-wms 简化为纯配置类型，运行时由 session-manager 消费
 */

import { z } from 'zod';

/** 会话重置模式 */
export const SessionResetModeSchema = z.enum(['daily', 'idle', 'manual']);

/** 会话重置配置 */
const SessionResetConfigSchema = z
  .object({
    mode: SessionResetModeSchema.optional(),
    /** daily 模式：在指定小时重置（0-23） */
    atHour: z.number().int().min(0).max(23).optional(),
    /** idle 模式：空闲多少分钟后重置 */
    idleMinutes: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

/** 会话作用域 */
export const SessionScopeSchema = z.enum(['per-sender', 'global']);

/** DM 作用域 */
export const SessionDmScopeSchema = z.enum([
  'main',
  'per-peer',
  'per-channel-peer',
  'per-account-channel-peer',
]);

/** 会话生命周期配置 */
export const SessionLifecycleConfigSchema = z
  .object({
    /** 会话作用域 */
    scope: SessionScopeSchema.optional(),
    /** DM 作用域 */
    dmScope: SessionDmScopeSchema.optional(),
    /** 空闲多少分钟后视为过期（自动清理） */
    idleMinutes: z.number().int().positive().optional(),
    /** 重置触发器：命中这些关键字时主动重置 */
    resetTriggers: z.array(z.string()).optional(),
    /** 重置配置 */
    reset: SessionResetConfigSchema,
    /** 按会话类型覆盖重置配置 */
    resetByType: z
      .object({
        direct: SessionResetConfigSchema,
        /** @deprecated 使用 direct 代替 */
        dm: SessionResetConfigSchema,
        group: SessionResetConfigSchema,
        thread: SessionResetConfigSchema,
      })
      .strict()
      .optional(),
    /** 按渠道覆盖重置配置 */
    resetByChannel: z.record(z.string(), SessionResetConfigSchema).optional(),
    /** Agent-to-agent 通信限制 */
    agentToAgent: z
      .object({
        maxPingPongTurns: z.number().int().min(0).max(20).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional();

export type SessionLifecycleConfig = z.infer<typeof SessionLifecycleConfigSchema>;

export const DEFAULT_SESSION_LIFECYCLE_CONFIG: SessionLifecycleConfig = {
  scope: 'per-sender',
  dmScope: 'per-peer',
  idleMinutes: 60,
  reset: {
    mode: 'idle',
    idleMinutes: 60,
  },
  agentToAgent: {
    maxPingPongTurns: 5,
  },
};
