// 移植自 openclaw/src/infra/diagnostic-events.ts

export type DiagnosticSessionState = unknown;
export type DiagnosticUsageEvent = unknown;
export type DiagnosticFailoverEvent = unknown;
export type DiagnosticSecurityEventActor = unknown;
export type DiagnosticSecurityEventTarget = unknown;
export type DiagnosticSecurityEventPolicy = unknown;
export type DiagnosticSecurityEventControl = unknown;
export type DiagnosticSecurityEvent = unknown;
export type DiagnosticSecurityEventInput = unknown;
export type DiagnosticWebhookReceivedEvent = unknown;
export type DiagnosticWebhookProcessedEvent = unknown;
export type DiagnosticWebhookErrorEvent = unknown;
export type DiagnosticMessageQueuedEvent = unknown;
export type DiagnosticMessageReceivedEvent = unknown;
export type DiagnosticMessageDispatchStartedEvent = unknown;
export type DiagnosticMessageDispatchCompletedEvent = unknown;
export type DiagnosticMessageProcessedEvent = unknown;
export type DiagnosticMessageDeliveryKind = unknown;
export type DiagnosticMessageDeliveryStartedEvent = unknown;
export type DiagnosticMessageDeliveryCompletedEvent = unknown;
export type DiagnosticMessageDeliveryErrorEvent = unknown;
export type DiagnosticTalkEvent = unknown;
export type DiagnosticSessionStateEvent = unknown;
export type DiagnosticSessionActiveWorkKind = unknown;
export type DiagnosticSessionAttentionClassification = unknown;
export type DiagnosticSessionLongRunningEvent = unknown;
export type DiagnosticSessionStalledEvent = unknown;
export type DiagnosticSessionStuckEvent = unknown;
export type DiagnosticSessionRecoveryStatus = unknown;
export type DiagnosticSessionRecoveryRequestedEvent = unknown;
export type DiagnosticSessionRecoveryCompletedEvent = unknown;
export type DiagnosticSessionTurnCreatedEvent = unknown;
export type DiagnosticLaneEnqueueEvent = unknown;
export type DiagnosticLaneDequeueEvent = unknown;
export type DiagnosticRunAttemptEvent = unknown;
export type DiagnosticRunProgressEvent = unknown;
export type DiagnosticHeartbeatEvent = unknown;
export type DiagnosticLivenessWarningReason = unknown;
export type DiagnosticPhaseDetails = unknown;
export type DiagnosticPhaseSnapshot = unknown;
export type DiagnosticLivenessWarningEvent = unknown;
export type DiagnosticPhaseCompletedEvent = unknown;
export type DiagnosticToolLoopEvent = unknown;
export type DiagnosticToolParamsSummary = unknown;
export type DiagnosticToolSource = unknown;
export type DiagnosticToolExecutionStartedEvent = unknown;
export type DiagnosticToolExecutionCompletedEvent = unknown;
export type DiagnosticToolExecutionErrorEvent = unknown;
export type DiagnosticToolExecutionBlockedEvent = unknown;
export type DiagnosticSkillTelemetrySource = unknown;
export type DiagnosticSkillActivation = unknown;
export type DiagnosticSkillUsedEvent = unknown;
export type DiagnosticExecProcessCompletedEvent = unknown;
export type DiagnosticRunStartedEvent = unknown;
export type DiagnosticRunCompletedEvent = unknown;
export type DiagnosticHarnessRunPhase = unknown;
export type DiagnosticHarnessRunOutcome = unknown;
export type DiagnosticHarnessRunStartedEvent = unknown;
export type DiagnosticHarnessRunCompletedEvent = unknown;
export type DiagnosticHarnessRunErrorEvent = unknown;
export type DiagnosticModelCallStartedEvent = unknown;
export type DiagnosticModelCallCompletedEvent = unknown;
export type DiagnosticModelCallErrorEvent = unknown;
export type DiagnosticContextAssembledEvent = unknown;
export type DiagnosticMemoryUsage = unknown;
export type DiagnosticMemorySampleEvent = unknown;
export type DiagnosticMemoryPressureEvent = unknown;
export type DiagnosticPayloadLargeEvent = unknown;
export type DiagnosticLogRecordEvent = unknown;
export type DiagnosticTelemetryExporterEvent = unknown;
export type DiagnosticAsyncQueueDroppedEvent = unknown;
export type DiagnosticEventPayload = unknown;
export type DiagnosticEventInput = unknown;
export type DiagnosticEventMetadata = { trusted?: boolean; internal?: boolean; seq?: number; trustedTraceContext?: boolean };
export type DiagnosticModelCallContent = unknown;
export type DiagnosticToolCallContent = unknown;
export type DiagnosticEventPrivateData = unknown;

type DiagnosticEventListener = (evt: any, metadata: DiagnosticEventMetadata) => void;
type TrustedDiagnosticEventListener = (evt: any, metadata: DiagnosticEventMetadata, privateData?: any) => void;

type DiagnosticEventsState = {
  enabled: boolean;
  seq: number;
  listeners: Set<DiagnosticEventListener>;
  trustedListeners: Set<TrustedDiagnosticEventListener>;
};

const DIAGNOSTIC_EVENTS_STATE_KEY = Symbol.for("openclaw.diagnosticEvents.state.v1");

function createDiagnosticEventsState(): DiagnosticEventsState {
  return {
    enabled: true,
    seq: 0,
    listeners: new Set<DiagnosticEventListener>(),
    trustedListeners: new Set<TrustedDiagnosticEventListener>(),
  };
}

function getDiagnosticEventsState(): DiagnosticEventsState {
  const globalRecord = globalThis as Record<PropertyKey, unknown>;
  const existing = globalRecord[DIAGNOSTIC_EVENTS_STATE_KEY];
  if (existing && typeof existing === "object" && (existing as any).listeners instanceof Set) {
    return existing as DiagnosticEventsState;
  }
  const state = createDiagnosticEventsState();
  Object.defineProperty(globalThis, DIAGNOSTIC_EVENTS_STATE_KEY, {
    configurable: true,
    enumerable: false,
    value: state,
    writable: false,
  });
  return state;
}

function dispatchDiagnosticEvent(
  state: DiagnosticEventsState,
  event: any,
  metadata: DiagnosticEventMetadata,
  privateData?: any,
): void {
  for (const listener of state.listeners) {
    try {
      listener(event, metadata);
    } catch {
      // listener errors are silently ignored to prevent dispatch breakage
    }
  }
  for (const listener of state.trustedListeners) {
    try {
      listener(event, metadata, privateData);
    } catch {
      // listener errors are silently ignored to prevent dispatch breakage
    }
  }
}

function emitDiagnosticEventWithTrust(
  event: any,
  trusted: boolean,
  options: { internal?: boolean; privateData?: any; trustedTraceContext?: boolean } = {},
): void {
  const state = getDiagnosticEventsState();
  if (!state.enabled) {
    return;
  }
  state.seq += 1;
  const metadata: DiagnosticEventMetadata = {
    seq: state.seq,
    trusted,
    ...(options.internal ? { internal: true } : {}),
    ...(options.trustedTraceContext ? { trustedTraceContext: true } : {}),
  };
  dispatchDiagnosticEvent(state, event, metadata, options.privateData);
}

export function isDiagnosticsEnabled(config?: { diagnostics?: { enabled?: boolean } }): boolean {
  return config?.diagnostics?.enabled !== false;
}

export function setDiagnosticsEnabledForProcess(enabled: boolean): void {
  getDiagnosticEventsState().enabled = enabled;
}

export function areDiagnosticsEnabledForProcess(): boolean {
  return getDiagnosticEventsState().enabled;
}

export function waitForDiagnosticEventsDrained(): Promise<void> {
  return Promise.resolve();
}

export function emitDiagnosticEvent(event: any): void {
  emitDiagnosticEventWithTrust(event, false);
}

export function emitDiagnosticEventWithTrustedTraceContext(event: any): void {
  emitDiagnosticEventWithTrust(event, false, { trustedTraceContext: true });
}

export function emitInternalDiagnosticEvent(event: any): void {
  emitDiagnosticEventWithTrust(event, false, { internal: true });
}

export function getInternalDiagnosticEventSequence(): number {
  return getDiagnosticEventsState().seq;
}

export function emitTrustedDiagnosticEvent(event: any): void {
  emitDiagnosticEventWithTrust(event, true);
}

export function emitTrustedDiagnosticEventWithPrivateData(event: any, privateData?: any): void {
  emitDiagnosticEventWithTrust(event, true, { privateData });
}

export function emitTrustedSecurityEvent(event: any): void {
  emitDiagnosticEventWithTrust({ type: "security.event", ...event }, true);
}

export function emitFailoverEvent(event: any): void {
  emitDiagnosticEventWithTrust({ type: "failover.event", ...event }, false);
}

export function onInternalDiagnosticEvent(listener: DiagnosticEventListener): () => void {
  const state = getDiagnosticEventsState();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function onTrustedInternalDiagnosticEvent(listener: TrustedDiagnosticEventListener): () => void {
  const state = getDiagnosticEventsState();
  state.trustedListeners.add(listener);
  return () => {
    state.trustedListeners.delete(listener);
  };
}

export function hasPendingInternalDiagnosticEvent(): boolean {
  return false;
}

export function onDiagnosticEvent(listener: (evt: any) => void): () => void {
  return onInternalDiagnosticEvent((event, metadata) => {
    if (metadata.trusted || event.type === "log.record") {
      return;
    }
    listener(event);
  });
}

export function formatDiagnosticTraceparentForPropagation(): string | undefined {
  return undefined;
}

export function isInternalDiagnosticEventMetadata(metadata: DiagnosticEventMetadata): boolean {
  return metadata?.internal === true;
}

export function resetDiagnosticEventsForTest(): void {
  const state = getDiagnosticEventsState();
  state.listeners.clear();
  state.trustedListeners.clear();
  state.seq = 0;
  state.enabled = true;
}
