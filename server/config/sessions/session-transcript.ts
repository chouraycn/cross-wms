/**
 * 会话转录配置（session-transcript）
 *
 * 参考 openclaw/src/config/sessions/transcript.ts：
 * - 定义会话转录文件的格式、追加策略、镜像路径
 * - cross-wms 简化为纯配置类型，运行时由 transcript 模块消费
 */

import { z } from 'zod';

/** 转录格式 */
export const TranscriptFormatSchema = z.enum(['jsonl', 'json', 'ndjson']);

/** 转录追加策略 */
export const TranscriptAppendStrategySchema = z.enum([
  'append', // 追加到现有文件
  'rotate', // 超过阈值时轮转
  'truncate', // 截断重写
]);

/** 转录镜像配置：把转录文件镜像到另一个路径（备份/同步用） */
const TranscriptMirrorConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    targetDir: z.string().optional(),
    /** 镜像写入失败时是否阻塞主流程 */
    failClosed: z.boolean().optional(),
  })
  .strict()
  .optional();

/** 会话转录配置 */
export const SessionTranscriptConfigSchema = z
  .object({
    /** 转录格式（默认 jsonl） */
    format: TranscriptFormatSchema.optional(),
    /** 追加策略 */
    appendStrategy: TranscriptAppendStrategySchema.optional(),
    /** 轮转阈值（字节） */
    rotateBytes: z.number().int().positive().optional(),
    /** 镜像配置 */
    mirror: TranscriptMirrorConfigSchema,
    /** 是否记录工具调用明细 */
    includeToolCalls: z.boolean().optional(),
    /** 是否记录 thinking 内容 */
    includeThinking: z.boolean().optional(),
    /** 是否记录 usage / token 计数 */
    includeUsage: z.boolean().optional(),
  })
  .strict()
  .optional();

export type SessionTranscriptConfig = z.infer<typeof SessionTranscriptConfigSchema>;

export const DEFAULT_SESSION_TRANSCRIPT_CONFIG: SessionTranscriptConfig = {
  format: 'jsonl',
  appendStrategy: 'append',
  rotateBytes: 10 * 1024 * 1024, // 10 MB
  includeToolCalls: true,
  includeThinking: false,
  includeUsage: true,
};
