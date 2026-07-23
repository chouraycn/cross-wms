/**
 * 移植自 openclaw/src/agents/subagent-registry.types.ts
 *
 * 子代理运行记录类型定义。
 */

export type PendingFinalDeliveryPayload = unknown;

export interface SubagentExecutionState {
  transcriptFile?: string;
  [key: string]: unknown;
}

export interface SubagentCompletionState {
  status: string;
  error?: string;
  [key: string]: unknown;
}

export type SubagentCompletionDeliveryState = SubagentCompletionState;

export interface SubagentRunRecord {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  requesterOrigin?: unknown;
  requesterRunId?: string;
  workspaceDir?: string;
  agentDir?: string;
  cleanup?: "delete" | "keep";
  runTimeoutSeconds?: number;
  spawnMode?: string;
  createdAt: number;
  cleanupHandled: boolean;
  suppressAnnounceReason?: string;
  endedAt?: number;
  outcome?: SubagentCompletionState;
  cleanupCompletedAt?: number;
  execution?: SubagentExecutionState;
  frozenResult?: unknown;
  [key: string]: unknown;
}
