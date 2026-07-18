type SessionAttentionClassification = {
  eventType: 'session.stuck' | 'session.stalled' | 'session.long_running';
  reason: string;
  classification: string;
  activeWorkKind?: string;
  recoveryEligible: boolean;
};

type SessionAttentionParams = {
  state?: 'idle' | 'processing' | 'waiting';
  queueDepth: number;
  activity?: {
    lastProgressAgeMs?: number;
    lastProgressReason?: string;
    activeToolName?: string;
    activeToolAgeMs?: number;
    hasActiveEmbeddedRun?: boolean;
    activeWorkKind?: string;
  };
  staleMs: number;
  stuckSessionAbortMs?: number;
};

export function classifySessionAttention(
  params: SessionAttentionParams,
): SessionAttentionClassification {
  const { state, queueDepth, activity, staleMs } = params;
  const lastProgressAge = activity?.lastProgressAgeMs ?? 0;

  if (state === 'idle' && queueDepth > 0) {
    return {
      eventType: 'session.stalled',
      reason: 'idle_with_queued_work',
      classification: 'idle_queue_backlog',
      activeWorkKind: activity?.activeWorkKind,
      recoveryEligible: lastProgressAge > staleMs * 2,
    };
  }

  if (state === 'waiting') {
    return {
      eventType: 'session.stuck',
      reason: 'waiting_state_stale',
      classification: 'stale_waiting_state',
      activeWorkKind: activity?.activeWorkKind,
      recoveryEligible: lastProgressAge > staleMs * 2,
    };
  }

  if (state === 'processing') {
    if (activity?.activeToolName && activity.activeToolAgeMs && activity.activeToolAgeMs > staleMs * 3) {
      return {
        eventType: 'session.stalled',
        reason: 'tool_call_stale',
        classification: 'blocked_tool_call',
        activeWorkKind: 'tool_call',
        recoveryEligible: true,
      };
    }

    if (activity?.hasActiveEmbeddedRun && lastProgressAge > staleMs * 2) {
      return {
        eventType: 'session.stalled',
        reason: 'embedded_run_stale',
        classification: 'stalled_agent_run',
        activeWorkKind: 'embedded_run',
        recoveryEligible: true,
      };
    }

    if (lastProgressAge > staleMs * 4) {
      return {
        eventType: 'session.stuck',
        reason: 'no_progress',
        classification: 'stale_session_state',
        activeWorkKind: activity?.activeWorkKind,
        recoveryEligible: true,
      };
    }

    if (lastProgressAge > staleMs) {
      return {
        eventType: 'session.long_running',
        reason: 'long_running_operation',
        classification: 'long_running',
        activeWorkKind: activity?.activeWorkKind,
        recoveryEligible: false,
      };
    }
  }

  return {
    eventType: 'session.long_running',
    reason: 'active',
    classification: 'normal',
    activeWorkKind: activity?.activeWorkKind,
    recoveryEligible: false,
  };
}

export function isTerminalDiagnosticProgressReason(reason?: string): boolean {
  if (!reason) return false;
  const terminalReasons = [
    'waiting_for_user',
    'waiting_for_approval',
    'waiting_for_input',
    'paused',
  ];
  return terminalReasons.includes(reason);
}

export function resetDiagnosticSessionAttentionForTest(): void {
  // no state to reset
}
