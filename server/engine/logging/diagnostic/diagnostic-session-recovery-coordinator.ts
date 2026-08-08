import {
  emitInternalDiagnosticEvent as emitDiagnosticEvent,
  getInternalDiagnosticEventSequence,
} from "../../infra/diagnostic-events.js";
import { markDiagnosticActivity as markActivity } from "./diagnostic-runtime.js";

type SessionAttentionClassification = {
  eventType: 'session.stuck' | 'session.stalled' | 'session.long_running';
  reason: string;
  classification: string;
  activeWorkKind?: string;
  recoveryEligible: boolean;
};

type StuckSessionRecoveryRequest = {
  sessionId?: string;
  sessionKey?: string;
  sessionFile?: string;
  ageMs: number;
  queueDepth?: number;
  allowActiveAbort?: boolean;
  expectedState?: string;
  stateGeneration?: number;
  staleActiveProgressAbortMs?: number;
};

type StuckSessionRecoveryOutcome =
  | {
      status: 'aborted';
      action: 'abort_embedded_run';
      aborted: boolean;
      drained: boolean;
      forceCleared: boolean;
      released: number;
      queuedCount?: number;
      sessionId?: string;
      sessionKey?: string;
      activeSessionId?: string;
      lane?: string;
      activeWorkKind?: string;
    }
  | {
      status: 'released';
      action: 'release_lane';
      released: number;
      sessionId?: string;
      sessionKey?: string;
      activeSessionId?: string;
      lane?: string;
      activeWorkKind?: string;
    }
  | {
      status: 'skipped';
      action: 'observe_only' | 'keep_lane';
      reason: string;
      activeCount?: number;
      queuedCount?: number;
      sessionId?: string;
      sessionKey?: string;
      activeSessionId?: string;
      lane?: string;
      activeWorkKind?: string;
    }
  | {
      status: 'noop';
      action: 'none';
      reason: string;
      sessionId?: string;
      sessionKey?: string;
      activeSessionId?: string;
      lane?: string;
      activeWorkKind?: string;
    }
  | {
      status: 'failed';
      action: 'none';
      reason: 'exception';
      error: string;
      sessionId?: string;
      sessionKey?: string;
      activeSessionId?: string;
      lane?: string;
      activeWorkKind?: string;
    };

export type RecoverStuckSession = (
  params: StuckSessionRecoveryRequest,
) => void | StuckSessionRecoveryOutcome | Promise<void | StuckSessionRecoveryOutcome>;

type RequestStuckSessionRecoveryParams = {
  recover: RecoverStuckSession;
  request: StuckSessionRecoveryRequest;
  classification: SessionAttentionClassification;
};

const recoveryRequestsInFlight = new Set<string>();

function resolveStuckSessionRecoveryRef(
  params: Pick<StuckSessionRecoveryRequest, 'sessionId' | 'sessionKey'>,
): string | undefined {
  return params.sessionKey?.trim() || params.sessionId?.trim() || undefined;
}

function recoveryOutcomeMutatesSessionState(
  outcome: StuckSessionRecoveryOutcome | undefined,
): boolean {
  if (!outcome) {
    return false;
  }
  return (
    outcome.status === 'aborted' ||
    outcome.status === 'released' ||
    (outcome.status === 'noop' && outcome.reason === 'no_active_work')
  );
}

function recoveryOutcomeClearsQueuedSessionState(
  outcome: StuckSessionRecoveryOutcome,
): boolean {
  return (
    outcome.status === 'released' ||
    (outcome.status === 'aborted' && outcome.released > 0 && (outcome.queuedCount ?? 0) === 0) ||
    (outcome.status === 'noop' && outcome.reason === 'no_active_work')
  );
}

function recoveryOutcomeReleasedCount(outcome: StuckSessionRecoveryOutcome): number {
  return 'released' in outcome ? outcome.released : 0;
}

type SessionStateEntry = {
  sessionId?: string;
  sessionKey?: string;
  state: string;
  lastActivity: number;
  queueDepth: number;
  generation: number;
  messageCount: number;
  startedAt: number;
  lastStuckWarnAgeMs?: number;
  lastLongRunningWarnAgeMs?: number;
};

const sessionStates = new Map<string, SessionStateEntry>();

function sessionKey(ref: { sessionId?: string; sessionKey?: string }): string {
  return ref.sessionKey ?? ref.sessionId ?? 'unknown';
}

function getDiagnosticSessionState(ref: { sessionId?: string; sessionKey?: string }): SessionStateEntry {
  const key = sessionKey(ref);
  let entry = sessionStates.get(key);
  if (!entry) {
    entry = {
      sessionId: ref.sessionId,
      sessionKey: ref.sessionKey,
      state: 'idle',
      lastActivity: Date.now(),
      queueDepth: 0,
      generation: 0,
      messageCount: 0,
      startedAt: Date.now(),
    };
    sessionStates.set(key, entry);
  }
  return entry;
}

function peekDiagnosticSessionState(
  ref: { sessionId?: string; sessionKey?: string },
): SessionStateEntry | undefined {
  const key = sessionKey(ref);
  return sessionStates.get(key);
}

function isDiagnosticSessionStateCurrent(params: {
  sessionId?: string;
  sessionKey?: string;
  generation?: number;
  state?: string;
}): boolean {
  const entry = peekDiagnosticSessionState(params);
  if (!entry) {
    return false;
  }
  if (params.state && entry.state !== params.state) {
    return false;
  }
  if (params.generation !== undefined && entry.generation !== params.generation) {
    return false;
  }
  return true;
}

let embeddedRunActivitySequence = 0;

function getDiagnosticEmbeddedRunActivitySequence(): number {
  return embeddedRunActivitySequence;
}

function clearDiagnosticEmbeddedRunActivityForSession(params: {
  sessionId?: string;
  sessionKey?: string;
  activeSessionId?: string;
  recoveryStartedAfterEmbeddedRunSequence?: number;
  recoveryStartedAfterDiagnosticEventSequence?: number;
}): { blockedByActiveEmbeddedRun: boolean } {
  embeddedRunActivitySequence++;
  return { blockedByActiveEmbeddedRun: false };
}

function emitSessionRecoveryRequested(params: {
  request: StuckSessionRecoveryRequest;
  classification: SessionAttentionClassification;
}): void {
  emitDiagnosticEvent({
    type: 'session.recovery.requested',
    sessionId: params.request.sessionId,
    sessionKey: params.request.sessionKey,
    state: params.request.expectedState ?? 'processing',
    stateGeneration: params.request.stateGeneration,
    ageMs: params.request.ageMs,
    queueDepth: params.request.queueDepth,
    reason: params.classification.reason,
    activeWorkKind: params.classification.activeWorkKind,
    allowActiveAbort: params.request.allowActiveAbort,
  });
}

function emitSessionRecoveryCompleted(params: {
  request: StuckSessionRecoveryRequest;
  outcome: StuckSessionRecoveryOutcome;
  stale?: boolean;
}): void {
  emitDiagnosticEvent({
    type: 'session.recovery.completed',
    sessionId: params.request.sessionId,
    sessionKey: params.request.sessionKey,
    state: params.request.expectedState ?? 'processing',
    stateGeneration: params.request.stateGeneration,
    ageMs: params.request.ageMs,
    queueDepth: params.request.queueDepth,
    activeWorkKind: params.outcome.activeWorkKind,
    status: params.outcome.status,
    action: params.outcome.action,
    outcomeReason: 'reason' in params.outcome ? params.outcome.reason : undefined,
    released: recoveryOutcomeReleasedCount(params.outcome) || undefined,
    stale: params.stale,
  });
}

function recoveryRequestKey(request: StuckSessionRecoveryRequest): string | undefined {
  return resolveStuckSessionRecoveryRef(request);
}

function isRecoveryPromiseLike(
  value: void | StuckSessionRecoveryOutcome | Promise<void | StuckSessionRecoveryOutcome>,
): value is Promise<void | StuckSessionRecoveryOutcome> {
  return (
    typeof (value as Promise<void | StuckSessionRecoveryOutcome> | undefined)?.then === 'function'
  );
}

function recoveryOutcomeHasQueuedLaneWork(outcome: StuckSessionRecoveryOutcome): boolean {
  return outcome.status === 'aborted' && (outcome.queuedCount ?? 0) > 0;
}

function applyRecoveryOutcomeToDiagnosticState(params: {
  request: StuckSessionRecoveryRequest;
  outcome: StuckSessionRecoveryOutcome | undefined;
  recoveryStartedAfterEmbeddedRunSequence?: number;
  recoveryStartedAfterDiagnosticEventSequence?: number;
}): void {
  if (!params.outcome) {
    return;
  }
  if (!recoveryOutcomeMutatesSessionState(params.outcome)) {
    emitSessionRecoveryCompleted({ request: params.request, outcome: params.outcome });
    return;
  }
  const expectedState = params.request.expectedState ?? 'processing';
  const currentState = peekDiagnosticSessionState(params.request);
  const currentGeneration = currentState?.generation ?? 0;
  const requestGeneration = params.request.stateGeneration ?? 0;
  const stateIsCurrent =
    expectedState === 'idle' &&
    params.request.stateGeneration !== undefined &&
    params.outcome.action === 'abort_embedded_run'
      ? currentState?.state === 'idle' &&
        (currentGeneration === requestGeneration || currentGeneration === requestGeneration + 1)
      : isDiagnosticSessionStateCurrent({
          sessionId: params.request.sessionId,
          sessionKey: params.request.sessionKey,
          generation: params.request.stateGeneration,
          state: expectedState,
        });
  if (!stateIsCurrent) {
    emitSessionRecoveryCompleted({
      request: params.request,
      outcome: params.outcome,
      stale: true,
    });
    return;
  }
  const state = getDiagnosticSessionState(params.request);
  const activityClear = clearDiagnosticEmbeddedRunActivityForSession({
    sessionId: state.sessionId,
    sessionKey: state.sessionKey,
    activeSessionId: params.outcome.activeSessionId,
    recoveryStartedAfterEmbeddedRunSequence: params.recoveryStartedAfterEmbeddedRunSequence,
    recoveryStartedAfterDiagnosticEventSequence: params.recoveryStartedAfterDiagnosticEventSequence,
  });
  if (activityClear.blockedByActiveEmbeddedRun) {
    emitSessionRecoveryCompleted({
      request: params.request,
      outcome: params.outcome,
      stale: true,
    });
    return;
  }
  const prevState = state.state;
  state.state = 'idle';
  state.lastActivity = Date.now();
  state.generation = (state.generation ?? 0) + 1;
  state.lastStuckWarnAgeMs = undefined;
  state.lastLongRunningWarnAgeMs = undefined;
  const preserveQueuedIdleWork =
    params.request.expectedState === 'idle' && recoveryOutcomeHasQueuedLaneWork(params.outcome);
  state.queueDepth = recoveryOutcomeClearsQueuedSessionState(params.outcome)
    ? 0
    : preserveQueuedIdleWork
      ? Math.max(state.queueDepth, params.request.queueDepth ?? 0)
      : Math.max(0, state.queueDepth - 1);
  emitDiagnosticEvent({
    type: 'session.state',
    sessionId: state.sessionId,
    sessionKey: state.sessionKey,
    prevState,
    state: 'idle',
    reason: `stuck_recovery:${params.outcome.status}`,
    queueDepth: state.queueDepth,
  });
  emitSessionRecoveryCompleted({ request: params.request, outcome: params.outcome });
  markActivity();
}

export function requestStuckSessionRecoveryOutcome(
  params: RequestStuckSessionRecoveryParams,
): Promise<StuckSessionRecoveryOutcome | undefined> {
  const inFlightKey = recoveryRequestKey(params.request);
  if (inFlightKey && recoveryRequestsInFlight.has(inFlightKey)) {
    const outcome: StuckSessionRecoveryOutcome = {
      status: 'skipped',
      action: 'observe_only',
      reason: 'already_in_flight',
      sessionId: params.request.sessionId,
      sessionKey: params.request.sessionKey,
      activeWorkKind: params.classification.activeWorkKind,
    };
    emitSessionRecoveryCompleted({ request: params.request, outcome });
    return Promise.resolve(outcome);
  }
  if (inFlightKey) {
    recoveryRequestsInFlight.add(inFlightKey);
  }
  emitSessionRecoveryRequested({
    request: params.request,
    classification: params.classification,
  });
  const recoveryStartedAfterEmbeddedRunSequence = getDiagnosticEmbeddedRunActivitySequence();
  const recoveryStartedAfterDiagnosticEventSequence = getInternalDiagnosticEventSequence() as number | undefined;
  const clearInFlight = () => {
    if (inFlightKey) {
      recoveryRequestsInFlight.delete(inFlightKey);
    }
  };
  const completeRecovery = (outcome: StuckSessionRecoveryOutcome | undefined) => {
    applyRecoveryOutcomeToDiagnosticState({
      request: params.request,
      outcome,
      recoveryStartedAfterEmbeddedRunSequence,
      recoveryStartedAfterDiagnosticEventSequence,
    });
    return outcome;
  };
  const failRecovery = (err: any) => {
    const outcome: StuckSessionRecoveryOutcome = {
      status: 'failed',
      action: 'none',
      reason: 'exception',
      error: String(err),
      sessionId: params.request.sessionId,
      sessionKey: params.request.sessionKey,
    };
    applyRecoveryOutcomeToDiagnosticState({
      request: params.request,
      outcome,
      recoveryStartedAfterEmbeddedRunSequence,
      recoveryStartedAfterDiagnosticEventSequence,
    });
    return outcome;
  };
  try {
    const result = params.recover(params.request);
    if (isRecoveryPromiseLike(result)) {
      return result
        .then((outcome) => completeRecovery(outcome ?? undefined))
        .catch(failRecovery)
        .finally(clearInFlight);
    }
    const outcome = completeRecovery(result ?? undefined);
    clearInFlight();
    return Promise.resolve(outcome);
  } catch (err) {
    try {
      return Promise.resolve(failRecovery(err));
    } finally {
      clearInFlight();
    }
  }
}

export function requestStuckSessionRecovery(params: RequestStuckSessionRecoveryParams): void {
  void requestStuckSessionRecoveryOutcome(params);
}

export function resetDiagnosticSessionRecoveryCoordinatorForTest(): void {
  recoveryRequestsInFlight.clear();
}
