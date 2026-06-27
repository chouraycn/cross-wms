/**
 * ACP Control Plane Types
 * ACP 控制平面类型定义
 */

import type { Readable } from "node:stream";
import type { AcpTurnEvent as AcpTurnEventType, TurnResult, ContentBlock, ToolCall, ToolResult } from "./acpTypes.js";

// ============= Session Types =============

export type AcpSessionMode = "oneshot" | "converse" | "interactive";
export type AcpSessionState = "initializing" | "idle" | "running" | "error" | "closed";

export interface SessionAcpMeta {
  backend: string;
  agent: string;
  runtimeSessionName: string;
  identity?: string;
  mode: AcpSessionMode;
  runtimeOptions?: AcpSessionRuntimeOptions;
  cwd?: string;
  state: AcpSessionState;
  lastActivityAt: number;
  lastError?: string;
}

// Alias for compatibility
export type AcpSessionMeta = SessionAcpMeta;

export interface AcpSessionRuntimeOptions {
  runtimeMode?: string;
  model?: string;
  thinking?: string;
  cwd?: string;
  permissionProfile?: string;
  timeoutSeconds?: number;
  backendExtras?: Record<string, string>;
}

// ============= Turn Types =============

export type AcpTurnMode = "prompt" | "continue" | "pause" | "resume";
export type AcpTurnStatus = "pending" | "active" | "completed" | "failed" | "cancelled" | "timeout";

export interface AcpRunTurnInput {
  requestId: string;
  sessionKey: string;
  text: string;
  attachments?: AcpAttachment[];
  mode: AcpTurnMode;
  cfg: AcpTurnConfig;
  signal?: AbortSignal;
  onLifecycle?: (event: AcpTurnLifecycleEvent) => void;
  onEvent?: (event: AcpTurnEvent) => void;
}

export interface AcpTurnConfig {
  acp?: {
    backend?: string;
    fallbacks?: string[];
  };
  model?: string;
  thinking?: string;
  permissionProfile?: string;
  timeoutSeconds?: number;
}

export interface AcpAttachment {
  type: "text" | "image" | "file";
  content: string;
  mimeType?: string;
  name?: string;
}

export interface AcpTurnLifecycleEvent {
  type: "prompt_submitted" | "turn_started" | "turn_completed" | "turn_failed";
  at: number;
  error?: string;
}

export type AcpTurnEvent = AcpTurnEventType;
export type { TurnResult, ContentBlock, ToolCall, ToolResult };

// ============= Runtime Types =============

export interface AcpRuntime {
  name: string;
  version: string;
  capabilities: AcpRuntimeCapabilities;
  createSession(options: AcpRuntimeSessionOptions): Promise<AcpRuntimeHandle>;
  close(options: { handle: AcpRuntimeHandle; reason: string }): Promise<void>;
  executeTurn(params: {
    handle: AcpRuntimeHandle;
    text: string;
    attachments?: AcpAttachment[];
    mode: AcpTurnMode;
    signal: AbortSignal;
    requestId: string;
  }): Promise<{ stream?: AsyncIterable<AcpTurnEvent> }>;
}

export interface AcpRuntimeCapabilities {
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsAttachments: boolean;
  supportsMultipleModes: boolean;
  maxContextTokens?: number;
  supportedModels?: string[];
}

export interface AcpRuntimeHandle {
  id: string;
  sessionId: string;
  runtimeName: string;
  status: "active" | "idle" | "error";
}

export interface AcpRuntimeSessionOptions {
  model?: string;
  thinking?: string;
  permissionProfile?: string;
  backendExtras?: Record<string, string>;
  signal?: AbortSignal;
}

// ============= Manager Types =============

export interface AcpSessionManagerDeps {
  readSessionEntry(params: {
    cfg: unknown;
    sessionKey: string;
    clone: boolean;
  }): { acp?: SessionAcpMeta } | null;
  upsertSessionMeta(params: {
    cfg: unknown;
    sessionKey: string;
    mutate: (
      current: SessionAcpMeta | undefined,
      entry: { acp?: SessionAcpMeta } | undefined,
    ) => SessionAcpMeta | null | undefined;
    skipMaintenance?: boolean;
    takeCacheOwnership?: boolean;
  }): Promise<{ acp?: SessionAcpMeta } | null>;
  createRuntime(options: { backend: string; meta: SessionAcpMeta }): Promise<AcpRuntime>;
}

export interface AcpInitializeSessionInput {
  cfg: unknown;
  sessionKey: string;
  backend?: string;
  agent?: string;
  mode?: AcpSessionMode;
  runtimeOptions?: AcpSessionRuntimeOptions;
}

export interface AcpCloseSessionInput {
  cfg: unknown;
  sessionKey: string;
  reason?: string;
}

export interface AcpCloseSessionResult {
  sessionKey: string;
  closedAt: number;
}

export interface AcpCancelSessionInput {
  cfg: unknown;
  sessionKey: string;
  reason?: string;
}

export interface AcpSessionResolution {
  kind: "ready" | "stale" | "none";
  sessionKey: string;
  meta?: SessionAcpMeta;
  error?: string;
}

export interface AcpManagerObservabilitySnapshot {
  runtimeCache: {
    size: number;
    entries: Array<{
      actorKey: string;
      backend: string;
      agent: string;
      mode: string;
      idleMs: number;
    }>;
  };
  turns: {
    active: number;
    queueDepth: number;
    completed: number;
    failed: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
  };
  errorsByCode: Record<string, number>;
}

// ============= Turn Runner Types =============

export interface ActiveTurnState {
  runtime: AcpRuntime;
  handle: AcpRuntimeHandle;
  abortController: AbortController;
  startedAt: number;
}

export interface TurnLatencyStats {
  completed: number;
  failed: number;
  totalMs: number;
  maxMs: number;
}

// ============= Cached Runtime State =============

export interface CachedRuntimeState {
  runtime: AcpRuntime;
  handle: AcpRuntimeHandle;
  backend: string;
  agent: string;
  mode: AcpSessionMode;
  cwd?: string;
  configSignature: string;
  appliedControlSignature?: string;
  lastTouchedAt: number;
}

// ============= Error Types =============

export const AcpRuntimeErrorCode = {
  ACP_SESSION_INIT_FAILED: "ACP_SESSION_INIT_FAILED",
  ACP_SESSION_NOT_FOUND: "ACP_SESSION_NOT_FOUND",
  ACP_SESSION_CLOSED: "ACP_SESSION_CLOSED",
  ACP_TURN_FAILED: "ACP_TURN_FAILED",
  ACP_TURN_TIMEOUT: "ACP_TURN_TIMEOUT",
  ACP_TURN_CANCELLED: "ACP_TURN_CANCELLED",
  ACP_RUNTIME_ERROR: "ACP_RUNTIME_ERROR",
  ACP_INVALID_RUNTIME_OPTION: "ACP_INVALID_RUNTIME_OPTION",
  ACP_BACKEND_FAILOVER_EXHAUSTED: "ACP_BACKEND_FAILOVER_EXHAUSTED",
  ACP_MAX_CONCURRENT_SESSIONS: "ACP_MAX_CONCURRENT_SESSIONS",
} as const;

export type AcpRuntimeErrorCode = (typeof AcpRuntimeErrorCode)[keyof typeof AcpRuntimeErrorCode];

export class AcpRuntimeError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "AcpRuntimeError";
  }
}

// ============= Backend Types =============

export interface BackendCandidate {
  backend: string;
  priority: number;
}

export interface BackendAttempt {
  backend: string;
  error: string;
  code: string;
  sawOutput: boolean;
}
