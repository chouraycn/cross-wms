/**
 * ACP Control Plane — 下一代 Agent 执行引擎
 *
 * ⚠️  实验性：当前主流量对话仍通过 chatService + /api/agent-chat 提供
 *
 * 架构定位：
 * - 参照 openclaw ACP 协议设计的统一 Agent 运行时
 * - 支持多运行时（embedded runtime、子代理、工具执行器等）
 * - SessionActorQueue 保证同会话串行执行
 * - turnRunner 管理 attempt 生命周期与失败回退
 *
 * 与现有框架的关系：
 * - chatService（旧）→ /api/chat（兼容层）
 * - agentChat（当前主入口）→ /api/agent-chat → 调用 chatService
 * - ACP（未来）→ 直接接管会话管理与回合执行
 *
 * 迁移路线：agentChat → 逐步替换底层为 ACP → 最终 chatService 退休
 */

// Types
export * from "./types.js";
export type { AcpSessionCreateRequest, AcpSessionCloseRequest, AcpTurnRequest } from "./acpTypes.js";

// ACP Server
export {
  getAcpServer,
  startAcpServer,
  stopAcpServer,
  handleAcpRequest,
  resetAcpServerForTests,
} from "./acpServer.js";
export type {
  AcpServer,
  AcpRequestEnvelope,
  AcpResponseEnvelope,
  AcpSession,
  AcpTurn,
  AcpServerContext,
} from "./acpServer.js";

// Core Components
export { AcpSessionManager } from "./sessionManager.js";
export type { AcpSessionManager as IAcpSessionManager } from "./sessionManager.js";
export { SessionActorQueue } from "./sessionActorQueue.js";
export { RuntimeCache, RuntimeHandleCache } from "./runtimeCache.js";
export {
  markAcpTurnActive,
  clearAcpTurnActive,
  isAcpTurnActive,
  getAcpTurnActive,
  getActiveTurnSessionKeys,
  getActiveTurnCount,
  resetActiveTurnsForTests,
} from "./activeTurns.js";
export { runManagerTurn } from "./turnRunner.js";

// Turn Stream
export {
  consumeTurnEvents,
  createEventGate,
  closeEventGate,
  waitForQueuedEvents,
  mergeTurnStreams,
  createTurnStreamBuffer,
  applyEventToBuffer,
  getBufferedMainText,
  getBufferedThinkingText,
  StreamRateLimiter,
} from "./turnStream.js";
export type {
  TurnEventGate,
  TurnStreamOutcome,
  TurnStreamBuffer,
} from "./turnStream.js";

// Background Task
export {
  BackgroundTaskManager,
  getBackgroundTaskManager,
  resetBackgroundTaskManagerForTests,
} from "./backgroundTask.js";
export type {
  BackgroundTask,
  BackgroundTaskStatus,
  CreateBackgroundTaskParams,
} from "./backgroundTask.js";

// Identity Reconcile
export {
  reconcileRuntimeSessionIdentities,
  startupIdentityReconcile,
  buildRuntimeSessionName,
  verifySessionIdentity,
  generateSessionIdentityFingerprint,
  isSameSessionIdentity,
} from "./identityReconcile.js";

// Resume State
export {
  ResumeStateStore,
  getResumeStateStore,
  resetResumeStateStoreForTests,
  shouldResumeFromCrash,
  resumeFromCrash,
  markSessionSafelyClosed,
  recoverCrashSessions,
} from "./resumeState.js";
export type {
  ResumeState,
  SaveResumeStateParams,
} from "./resumeState.js";

// Turn Results
export {
  createTurnResultAccumulator,
  applyEventToAccumulator,
  finalizeTurnResult,
  processTurnEvents,
  normalizeTurnResult,
  validateTurnResult,
  summarizeTurnResult,
  turnResultToStorable,
  turnResultFromStored,
} from "./turnResults.js";
export type {
  ProcessedTurnResult,
  TurnResultAccumulator,
} from "./turnResults.js";

// Runtime Options
export {
  normalizeRuntimeOptions,
  validateRuntimeOptionPatch,
  mergeRuntimeOptions,
  buildRuntimeControlSignature,
  runtimeOptionsEqual,
  validateRuntimeModeInput,
  validateRuntimeModelInput,
  validateRuntimeThinkingInput,
  validateRuntimePermissionProfileInput,
  validateRuntimeCwdInput,
} from "./runtimeOptions.js";

// Runtime Registry
export { RuntimeRegistry, getRuntimeRegistry, resetRuntimeRegistryForTests } from "./runtimeRegistry.js";
export type { RuntimeBackend } from "./runtimeRegistry.js";

// Singleton accessor
let ACP_SESSION_MANAGER_SINGLETON: import("./sessionManager.js").AcpSessionManager | null = null;

export interface AcpSessionManagerDeps {
  readSessionEntry(params: {
    cfg: unknown;
    sessionKey: string;
    clone: boolean;
  }): { acp?: import("./types.js").SessionAcpMeta } | null;
  upsertSessionMeta(params: {
    cfg: unknown;
    sessionKey: string;
    mutate: (
      current: import("./types.js").SessionAcpMeta | undefined,
      entry: { acp?: import("./types.js").SessionAcpMeta } | undefined,
    ) => import("./types.js").SessionAcpMeta | null | undefined;
    skipMaintenance?: boolean;
    takeCacheOwnership?: boolean;
  }): Promise<{ acp?: import("./types.js").SessionAcpMeta } | null>;
  createRuntime(options: { backend: string; meta: import("./types.js").SessionAcpMeta }): Promise<import("./types.js").AcpRuntime>;
}

export function getAcpSessionManager(deps?: AcpSessionManagerDeps): import("./sessionManager.js").AcpSessionManager {
  if (!ACP_SESSION_MANAGER_SINGLETON && deps) {
    ACP_SESSION_MANAGER_SINGLETON = new (require("./sessionManager.js").AcpSessionManager)(deps);
  }
  if (!ACP_SESSION_MANAGER_SINGLETON) {
    throw new Error("ACP session manager not initialized. Provide deps on first call.");
  }
  return ACP_SESSION_MANAGER_SINGLETON;
}

export function initializeAcpSessionManager(deps: AcpSessionManagerDeps): import("./sessionManager.js").AcpSessionManager {
  const manager = new (require("./sessionManager.js").AcpSessionManager)(deps);
  ACP_SESSION_MANAGER_SINGLETON = manager;
  return manager;
}

export function resetAcpSessionManagerForTests(): void {
  ACP_SESSION_MANAGER_SINGLETON = null;
}

export const acpTesting = {
  resetAcpSessionManagerForTests,
  setAcpSessionManagerForTests(manager: import("./sessionManager.js").AcpSessionManager | null) {
    ACP_SESSION_MANAGER_SINGLETON = manager;
  },
};
