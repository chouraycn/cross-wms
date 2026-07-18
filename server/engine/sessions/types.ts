/**
 * 会话管理系统类型定义
 *
 * 定义会话相关的核心类型、枚举和接口
 */

export type SessionKind = 'cron' | 'direct' | 'group' | 'global' | 'spawn-child' | 'unknown';

export type SessionChatType = 'direct' | 'group' | 'channel' | 'unknown';

export type SessionSendPolicyDecision = 'allow' | 'deny';

export type InputProvenanceKind = 'external_user' | 'inter_session' | 'internal_system';

export interface InputProvenance {
  kind: InputProvenanceKind;
  originSessionId?: string;
  sourceSessionKey?: string;
  sourceChannel?: string;
  sourceTool?: string;
}

export interface SessionMetadata {
  name?: string;
  agentId?: string;
  provider?: string;
  modelId?: string;
  workspaceDir?: string;
  source?: SessionSource;
  tags?: Record<string, string>;
  chatType?: SessionChatType;
  channel?: string;
  spawnedBy?: string;
  sendPolicy?: SessionSendPolicyDecision;
}

export type SessionSource = 'chat' | 'api' | 'cron' | 'subagent' | 'tool';

export type SessionStatus = 'active' | 'idle' | 'compacting' | 'streaming' | 'deleted';

export interface SessionStats {
  messageCount: number;
  toolCallCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  lastActivityAt: number;
  createdAt: number;
  totalDurationMs: number;
}

export interface SessionRecord {
  id: string;
  key: string;
  filePath?: string;
  status: SessionStatus;
  metadata: SessionMetadata;
  stats: SessionStats;
  isNew?: boolean;
}

export interface ModelOverrideSelection {
  provider: string;
  model: string;
  isDefault?: boolean;
}

export interface SessionLifecycleEvent {
  sessionKey: string;
  reason: string;
  parentSessionKey?: string;
  label?: string;
  displayName?: string;
}

export interface PersistedUserTurnMessage {
  role: 'user';
  content: string;
  timestamp: number;
  idempotencyKey?: string;
  provenance?: InputProvenance;
  MediaPath?: string;
  MediaPaths?: string[];
  MediaType?: string;
  MediaTypes?: string[];
}

export interface PersistedUserTurnMediaInput {
  path?: string;
  url?: string;
  contentType?: string;
  kind?: string;
}

export interface UserTurnInput {
  text?: string;
  media?: PersistedUserTurnMediaInput[];
  timestamp?: number;
  idempotencyKey?: string;
  provenance?: InputProvenance;
  mediaOnlyText?: string;
}

export type UserTurnTranscriptUpdateMode = 'inline' | 'append';

export interface UserTurnTranscriptPersistResult {
  sessionFile: string;
  messageId: string;
  message: PersistedUserTurnMessage;
}
