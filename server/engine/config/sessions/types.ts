import { z } from 'zod';

export const SessionStatusSchema = z.enum(['active', 'archived', 'daily_reset', 'deleted']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionTagSchema = z.string();
export type SessionTag = z.infer<typeof SessionTagSchema>;

export const SessionMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  model: z.string(),
  agentId: z.string().optional().nullable(),
  folderId: z.string().optional().nullable(),
  parentSessionId: z.string().optional().nullable(),
  status: SessionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  lastActiveAt: z.string(),
  sessionDate: z.string(),
  tags: z.array(SessionTagSchema),
  summary: z.string().optional(),
  messageCount: z.number().int().nonnegative(),
  schemaVersion: z.string(),
  extra: z.record(z.string(), z.unknown()),
});
export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

export const TranscriptMessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type TranscriptMessageRole = z.infer<typeof TranscriptMessageRoleSchema>;

export const TranscriptMessageSchema = z.object({
  id: z.string().optional(),
  role: TranscriptMessageRoleSchema,
  content: z.string(),
  timestamp: z.string(),
  toolCalls: z.array(z.unknown()).optional(),
  toolResult: z.unknown().optional(),
  attachments: z.array(z.unknown()).optional(),
  generatedFiles: z.array(z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()),
});
export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;

export const SessionGoalSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  progress: z.number().min(0).max(100),
  subtasks: z.array(z.object({
    id: z.string(),
    description: z.string(),
    completed: z.boolean(),
  })),
});
export type SessionGoal = z.infer<typeof SessionGoalSchema>;

export const SessionArtifactSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  path: z.string().optional(),
  size: z.number().int().nonnegative(),
  createdAt: z.string(),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
});
export type SessionArtifact = z.infer<typeof SessionArtifactSchema>;

export const SessionTargetSchema = z.object({
  type: z.string(),
  value: z.string(),
  label: z.string().optional(),
});
export type SessionTarget = z.infer<typeof SessionTargetSchema>;

export const ThreadInfoSchema = z.object({
  threadId: z.string(),
  parentThreadId: z.string().optional(),
  rootThreadId: z.string().optional(),
  depth: z.number().int().nonnegative(),
  branchFromMessageId: z.string().optional(),
});
export type ThreadInfo = z.infer<typeof ThreadInfoSchema>;

export const SessionDataSchema = z.object({
  metadata: SessionMetadataSchema,
  goals: z.array(SessionGoalSchema),
  artifacts: z.array(SessionArtifactSchema),
  targets: z.array(SessionTargetSchema),
  threadInfo: ThreadInfoSchema.optional(),
  extra: z.record(z.string(), z.unknown()),
});
export type SessionData = z.infer<typeof SessionDataSchema>;

export const SessionStoreStatsSchema = z.object({
  totalSessions: z.number().int().nonnegative(),
  activeSessions: z.number().int().nonnegative(),
  archivedSessions: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
  cacheHitCount: z.number().int().nonnegative(),
  cacheMissCount: z.number().int().nonnegative(),
});
export type SessionStoreStats = z.infer<typeof SessionStoreStatsSchema>;

export const DiskBudgetConfigSchema = z.object({
  maxTotalBytes: z.number().int().positive(),
  maxSessionSizeBytes: z.number().int().positive(),
  warningThresholdPercent: z.number().min(0).max(100),
  cleanupStrategy: z.enum(['oldest_first', 'largest_first', 'archived_first']),
});
export type DiskBudgetConfig = z.infer<typeof DiskBudgetConfigSchema>;

export const SessionStoreConfigSchema = z.object({
  baseDir: z.string(),
  archivedDir: z.string().optional(),
  cacheMaxSize: z.number().int().positive(),
  cacheTTLMs: z.number().int().positive(),
  enableFileLocking: z.boolean(),
  atomicWrites: z.boolean(),
  diskBudget: DiskBudgetConfigSchema,
  enableAutoMaintenance: z.boolean(),
  maintenanceIntervalMs: z.number().int().positive(),
});
export type SessionStoreConfig = z.infer<typeof SessionStoreConfigSchema>;

export const TranscriptFormatSchema = z.enum(['jsonl', 'json', 'markdown']);
export type TranscriptFormat = z.infer<typeof TranscriptFormatSchema>;

export const TranscriptWriteModeSchema = z.enum(['append', 'overwrite', 'stream']);
export type TranscriptWriteMode = z.infer<typeof TranscriptWriteModeSchema>;

export interface SessionKey {
  sessionId: string;
  timestamp: number;
  hash: string;
}

export interface SessionFileInfo {
  path: string;
  size: number;
  modifiedAt: Date;
  createdAt: Date;
  isArchived: boolean;
}

export interface StoreWriteResult {
  success: boolean;
  path?: string;
  error?: Error;
  durationMs: number;
}

export interface SessionListOptions {
  status?: SessionStatus | SessionStatus[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'lastActiveAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  searchQuery?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface SessionListResult {
  sessions: SessionMetadata[];
  total: number;
  hasMore: boolean;
}
