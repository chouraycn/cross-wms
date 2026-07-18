// 移植自 openclaw/src/infra/diagnostic-events.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

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
export type DiagnosticEventMetadata = unknown;
export type DiagnosticModelCallContent = unknown;
export type DiagnosticToolCallContent = unknown;
export type DiagnosticEventPrivateData = unknown;
export function isDiagnosticsEnabled(...args: unknown[]): unknown {
  throw new Error("not implemented: isDiagnosticsEnabled");
}
export function setDiagnosticsEnabledForProcess(...args: unknown[]): unknown {
  throw new Error("not implemented: setDiagnosticsEnabledForProcess");
}
export function areDiagnosticsEnabledForProcess(...args: unknown[]): unknown {
  throw new Error("not implemented: areDiagnosticsEnabledForProcess");
}
export function waitForDiagnosticEventsDrained(...args: unknown[]): unknown {
  throw new Error("not implemented: waitForDiagnosticEventsDrained");
}
export function emitDiagnosticEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: emitDiagnosticEvent");
}
export function emitDiagnosticEventWithTrustedTraceContext(...args: unknown[]): unknown {
  throw new Error("not implemented: emitDiagnosticEventWithTrustedTraceContext");
}
export function emitInternalDiagnosticEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: emitInternalDiagnosticEvent");
}
export function getInternalDiagnosticEventSequence(...args: unknown[]): unknown {
  throw new Error("not implemented: getInternalDiagnosticEventSequence");
}
export function emitTrustedDiagnosticEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: emitTrustedDiagnosticEvent");
}
export function emitTrustedDiagnosticEventWithPrivateData(...args: unknown[]): unknown {
  throw new Error("not implemented: emitTrustedDiagnosticEventWithPrivateData");
}
export function emitTrustedSecurityEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: emitTrustedSecurityEvent");
}
export function emitFailoverEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: emitFailoverEvent");
}
export function onInternalDiagnosticEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: onInternalDiagnosticEvent");
}
export function onTrustedInternalDiagnosticEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: onTrustedInternalDiagnosticEvent");
}
export function hasPendingInternalDiagnosticEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: hasPendingInternalDiagnosticEvent");
}
export function onDiagnosticEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: onDiagnosticEvent");
}
export function formatDiagnosticTraceparentForPropagation(...args: unknown[]): unknown {
  throw new Error("not implemented: formatDiagnosticTraceparentForPropagation");
}
export function isInternalDiagnosticEventMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: isInternalDiagnosticEventMetadata");
}
export function resetDiagnosticEventsForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: resetDiagnosticEventsForTest");
}
