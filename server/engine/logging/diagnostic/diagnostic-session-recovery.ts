type StuckSessionRecoveryRequest = {
  sessionId?: string;
  sessionKey?: string;
  sessionFile?: string;
  ageMs: number;
  queueDepth: number;
  expectedState?: string;
  stateGeneration?: number;
  allowActiveAbort?: boolean;
  staleActiveProgressAbortMs?: number;
};

type StuckSessionRecoveryOutcome = {
  status: 'recovered' | 'failed' | 'skipped';
  action: string;
  reason: string;
  sessionId?: string;
  sessionKey?: string;
  error?: string;
  released?: number;
};

type RecoveryCoordinatorState = {
  pendingRequests: Map<string, StuckSessionRecoveryRequest>;
  inProgress: Set<string>;
  completed: Map<string, StuckSessionRecoveryOutcome>;
};

const state: RecoveryCoordinatorState = {
  pendingRequests: new Map(),
  inProgress: new Set(),
  completed: new Map(),
};

function requestKey(req: StuckSessionRecoveryRequest): string {
  return req.sessionKey ?? req.sessionId ?? 'unknown';
}

export function requestStuckSessionRecovery(params: {
  recover: (req: StuckSessionRecoveryRequest) => Promise<StuckSessionRecoveryOutcome>;
  classification: { recoveryEligible: boolean };
  request: StuckSessionRecoveryRequest;
}): StuckSessionRecoveryOutcome | undefined {
  if (!params.classification.recoveryEligible) {
    return undefined;
  }

  const key = requestKey(params.request);

  if (state.inProgress.has(key)) {
    return state.completed.get(key) ?? {
      status: 'skipped',
      action: 'none',
      reason: 'recovery_in_progress',
      sessionId: params.request.sessionId,
      sessionKey: params.request.sessionKey,
    };
  }

  state.pendingRequests.set(key, params.request);
  state.inProgress.add(key);

  params.recover(params.request)
    .then((outcome) => {
      state.completed.set(key, outcome);
      state.pendingRequests.delete(key);
      state.inProgress.delete(key);
    })
    .catch((err) => {
      state.completed.set(key, {
        status: 'failed',
        action: 'none',
        reason: 'exception',
        sessionId: params.request.sessionId,
        sessionKey: params.request.sessionKey,
        error: String(err),
      });
      state.pendingRequests.delete(key);
      state.inProgress.delete(key);
    });

  return {
    status: 'skipped',
    action: 'requested',
    reason: 'recovery_scheduled',
    sessionId: params.request.sessionId,
    sessionKey: params.request.sessionKey,
  };
}

export function requestStuckSessionRecoveryOutcome(params: {
  recover: (req: StuckSessionRecoveryRequest) => Promise<StuckSessionRecoveryOutcome>;
  classification: { recoveryEligible: boolean };
  request: StuckSessionRecoveryRequest;
}): StuckSessionRecoveryOutcome | undefined {
  return requestStuckSessionRecovery(params);
}

export function getRecoveryStatus(
  ref: { sessionId?: string; sessionKey?: string },
): StuckSessionRecoveryOutcome | undefined {
  const key = ref.sessionKey ?? ref.sessionId ?? 'unknown';
  return state.completed.get(key);
}

export function resetDiagnosticSessionRecoveryCoordinatorForTest(): void {
  state.pendingRequests.clear();
  state.inProgress.clear();
  state.completed.clear();
}
