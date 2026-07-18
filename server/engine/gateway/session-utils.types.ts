import type { z } from 'zod';

export type SessionRunStatus = 'running' | 'done' | 'failed' | 'killed' | 'timeout';

export type GatewaySessionRow = {
  key: string;
  spawnedBy?: string;
  spawnedWorkspaceDir?: string;
  spawnedCwd?: string;
  forkedFromParent?: boolean;
  spawnDepth?: number;
  subagentRole?: string;
  subagentControlScope?: string;
  kind: 'direct' | 'group' | 'global' | 'unknown';
  label?: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  channel?: string;
  subject?: string;
  groupChannel?: string;
  space?: string;
  chatType?: string;
  origin?: string;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  thinkingLevels?: Array<{ id: string; label: string }>;
  thinkingOptions?: string[];
  thinkingDefault?: string;
  fastMode?: 'on' | 'off' | 'auto';
  effectiveFastMode?: 'on' | 'off';
  effectiveFastModeSource?: 'user' | 'system' | 'plugin';
  fastAutoOnSeconds?: number;
  verboseLevel?: string;
  traceLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  sendPolicy?: 'allow' | 'deny';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  goal?: { text: string; completed?: boolean };
  estimatedCostUsd?: number;
  status?: SessionRunStatus;
  hasActiveRun?: boolean;
  subagentRunState?: 'active' | 'interrupted' | 'historical';
  hasActiveSubagentRun?: boolean;
  startedAt?: number;
  endedAt?: number;
  runtimeMs?: number;
  parentSessionKey?: string;
  childSessions?: string[];
  responseUsage?: 'on' | 'off' | 'tokens' | 'full';
  modelProvider?: string;
  model?: string;
  agentRuntime?: string;
  contextTokens?: number;
  contextBudgetStatus?: 'ok' | 'warning' | 'critical';
  deliveryContext?: { channel: string; to: string };
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string;
  compactionCheckpointCount?: number;
  latestCompactionCheckpoint?: {
    checkpointId: string;
    createdAt: number;
    reason?: string;
  };
  pluginExtensions?: Array<{
    pluginId: string;
    extensionId: string;
    data: Record<string, unknown>;
  }>;
};

export type SessionPreviewItem = {
  role: 'user' | 'assistant' | 'tool' | 'system' | 'other';
  text: string;
};

export type SessionsPreviewEntry = {
  key: string;
  status: 'ok' | 'empty' | 'missing' | 'error';
  items: SessionPreviewItem[];
};

export type SessionsPreviewResult = {
  ts: number;
  previews: SessionsPreviewEntry[];
};

export type GatewaySessionsDefaults = {
  modelProvider: string | null;
  model: string | null;
  contextTokens: number | null;
  thinkingLevels?: Array<{ id: string; label: string }>;
  thinkingOptions?: string[];
  thinkingDefault?: string;
};

export type SessionsListResultBase = {
  ts: number;
  defaults: GatewaySessionsDefaults;
  total: number;
  rows: GatewaySessionRow[];
  hasMore?: boolean;
  cursor?: string;
};

export type SessionsListResult = SessionsListResultBase;

export type SessionsPatchResult = {
  ok: boolean;
  entry?: Record<string, unknown>;
  resolved?: {
    modelProvider?: string;
    model?: string;
    agentRuntime?: string;
  };
  error?: string;
};

export type GatewayAgentRow = {
  agentId: string;
  name: string;
  version?: string;
  description?: string;
  capabilities?: string[];
  defaultModel?: string;
  defaultProvider?: string;
};
