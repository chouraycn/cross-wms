/**
 * Subagent Spawn Types — 子代理生成相关类型定义
 *
 * 定义子代理生成的模式、选项和结果类型。
 */

import { z } from 'zod';

export const SUBAGENT_SPAWN_MODES = ['run', 'session'] as const;
export type SpawnSubagentMode = (typeof SUBAGENT_SPAWN_MODES)[number];

export const SUBAGENT_SPAWN_SANDBOX_MODES = ['inherit', 'require'] as const;
export type SpawnSubagentSandboxMode = (typeof SUBAGENT_SPAWN_SANDBOX_MODES)[number];

export const SUBAGENT_SPAWN_CONTEXT_MODES = ['isolated', 'fork'] as const;
export type SpawnSubagentContextMode = (typeof SUBAGENT_SPAWN_CONTEXT_MODES)[number];

export const SpawnSubagentModeSchema = z.enum(SUBAGENT_SPAWN_MODES);
export const SpawnSubagentSandboxModeSchema = z.enum(SUBAGENT_SPAWN_SANDBOX_MODES);
export const SpawnSubagentContextModeSchema = z.enum(SUBAGENT_SPAWN_CONTEXT_MODES);

export interface SpawnOptions {
  task: string;
  label?: string;
  agentId?: string;
  model?: string;
  taskName?: string;
  thinking?: string;
  cwd?: string;
  runTimeoutSeconds?: number;
  thread?: boolean;
  mode?: SpawnSubagentMode;
  cleanup?: 'delete' | 'keep';
  sandbox?: SpawnSubagentSandboxMode;
  context?: SpawnSubagentContextMode;
  lightContext?: boolean;
  expectsCompletionMessage?: boolean;
  attachments?: Array<{
    name: string;
    content: string;
    encoding?: 'utf8' | 'base64';
    mimeType?: string;
  }>;
  attachMountPath?: string;
  metadata?: Record<string, unknown>;
}

export interface SpawnContext {
  agentSessionKey?: string;
  completionOwnerKey?: string;
  agentChannel?: string;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  agentMemberRoleIds?: string[];
  requesterAgentIdOverride?: string;
  workspaceDir?: string;
  inheritedToolAllowlist?: string[];
  inheritedToolDenylist?: string[];
  parentSessionKey?: string;
}

export interface SpawnResult {
  status: 'accepted' | 'forbidden' | 'error';
  childSessionKey?: string;
  runId?: string;
  mode?: SpawnSubagentMode;
  taskName?: string;
  note?: string;
  resolvedModel?: string;
  resolvedProvider?: string;
  modelApplied?: boolean;
  error?: string;
  attachments?: {
    count: number;
    totalBytes: number;
    files: Array<{ name: string; bytes: number; sha256: string }>;
    relDir: string;
  };
  instanceId?: string;
}

export const SpawnOptionsSchema = z.object({
  task: z.string().min(1),
  label: z.string().optional(),
  agentId: z.string().optional(),
  model: z.string().optional(),
  taskName: z.string().optional(),
  thinking: z.string().optional(),
  cwd: z.string().optional(),
  runTimeoutSeconds: z.number().int().nonnegative().optional(),
  thread: z.boolean().optional(),
  mode: SpawnSubagentModeSchema.optional(),
  cleanup: z.enum(['delete', 'keep']).optional(),
  sandbox: SpawnSubagentSandboxModeSchema.optional(),
  context: SpawnSubagentContextModeSchema.optional(),
  lightContext: z.boolean().optional(),
  expectsCompletionMessage: z.boolean().optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        content: z.string(),
        encoding: z.enum(['utf8', 'base64']).optional(),
        mimeType: z.string().optional(),
      }),
    )
    .optional(),
  attachMountPath: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SpawnContextSchema = z.object({
  agentSessionKey: z.string().optional(),
  completionOwnerKey: z.string().optional(),
  agentChannel: z.string().optional(),
  agentAccountId: z.string().optional(),
  agentTo: z.string().optional(),
  agentThreadId: z.union([z.string(), z.number()]).optional(),
  agentGroupId: z.string().nullable().optional(),
  agentGroupChannel: z.string().nullable().optional(),
  agentGroupSpace: z.string().nullable().optional(),
  agentMemberRoleIds: z.array(z.string()).optional(),
  requesterAgentIdOverride: z.string().optional(),
  workspaceDir: z.string().optional(),
  inheritedToolAllowlist: z.array(z.string()).optional(),
  inheritedToolDenylist: z.array(z.string()).optional(),
  parentSessionKey: z.string().optional(),
});

export const SpawnResultSchema = z.object({
  status: z.enum(['accepted', 'forbidden', 'error']),
  childSessionKey: z.string().optional(),
  runId: z.string().optional(),
  mode: SpawnSubagentModeSchema.optional(),
  taskName: z.string().optional(),
  note: z.string().optional(),
  resolvedModel: z.string().optional(),
  resolvedProvider: z.string().optional(),
  modelApplied: z.boolean().optional(),
  error: z.string().optional(),
  attachments: z
    .object({
      count: z.number().int().nonnegative(),
      totalBytes: z.number().int().nonnegative(),
      files: z.array(
        z.object({
          name: z.string(),
          bytes: z.number().int().nonnegative(),
          sha256: z.string(),
        }),
      ),
      relDir: z.string(),
    })
    .optional(),
  instanceId: z.string().optional(),
});
