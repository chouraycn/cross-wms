// Lazy lifecycle runtime export hub used by gateway run-loop restart paths.
// 降级 stub：原模块依赖 agents/config/infra/logging/cron/process 等大量模块，
// cross-wms 暂未完整移植，这里仅保留导出结构。

export function abortEmbeddedAgentRun(): never {
  throw new Error("abortEmbeddedAgentRun not implemented");
}

export function getActiveEmbeddedRunCount(): never {
  throw new Error("getActiveEmbeddedRunCount not implemented");
}

export function listActiveEmbeddedRunSessionIds(): never {
  throw new Error("listActiveEmbeddedRunSessionIds not implemented");
}

export function listActiveEmbeddedRunSessionKeys(): never {
  throw new Error("listActiveEmbeddedRunSessionKeys not implemented");
}

export function waitForActiveEmbeddedRuns(): never {
  throw new Error("waitForActiveEmbeddedRuns not implemented");
}

export function markRestartAbortedMainSessions(): never {
  throw new Error("markRestartAbortedMainSessions not implemented");
}

export function getRuntimeConfig(): never {
  throw new Error("getRuntimeConfig not implemented");
}

export function respawnGatewayProcessForUpdate(): never {
  throw new Error("respawnGatewayProcessForUpdate not implemented");
}

export function restartGatewayProcessWithFreshPid(): never {
  throw new Error("restartGatewayProcessWithFreshPid not implemented");
}

export function resolveGatewayRestartDeferralTimeoutMs(): never {
  throw new Error("resolveGatewayRestartDeferralTimeoutMs not implemented");
}

export function consumeGatewayRestartIntentPayloadSync(): never {
  throw new Error("consumeGatewayRestartIntentPayloadSync not implemented");
}

export function consumeGatewaySigusr1RestartIntent(): never {
  throw new Error("consumeGatewaySigusr1RestartIntent not implemented");
}

export function consumeGatewayRestartIntentSync(): never {
  throw new Error("consumeGatewayRestartIntentSync not implemented");
}

export function consumeGatewaySigusr1RestartAuthorization(): never {
  throw new Error("consumeGatewaySigusr1RestartAuthorization not implemented");
}

export function isGatewaySigusr1RestartExternallyAllowed(): never {
  throw new Error("isGatewaySigusr1RestartExternallyAllowed not implemented");
}

export function markGatewaySigusr1RestartHandled(): never {
  throw new Error("markGatewaySigusr1RestartHandled not implemented");
}

export function peekGatewaySigusr1RestartReason(): never {
  throw new Error("peekGatewaySigusr1RestartReason not implemented");
}

export function resetGatewayRestartStateForInProcessRestart(): never {
  throw new Error("resetGatewayRestartStateForInProcessRestart not implemented");
}

export function scheduleGatewaySigusr1Restart(): never {
  throw new Error("scheduleGatewaySigusr1Restart not implemented");
}

export function writeGatewayRestartHandoffSync(): never {
  throw new Error("writeGatewayRestartHandoffSync not implemented");
}

export function rotateAgentEventLifecycleGeneration(): never {
  throw new Error("rotateAgentEventLifecycleGeneration not implemented");
}

export function markUpdateRestartSentinelFailure(): never {
  throw new Error("markUpdateRestartSentinelFailure not implemented");
}

export function detectRespawnSupervisor(): never {
  throw new Error("detectRespawnSupervisor not implemented");
}

export function writeDiagnosticStabilityBundleForFailureSync(): never {
  throw new Error("writeDiagnosticStabilityBundleForFailureSync not implemented");
}

export function advanceCronActiveJobGeneration(): never {
  throw new Error("advanceCronActiveJobGeneration not implemented");
}

export function resetCronActiveJobs(): never {
  throw new Error("resetCronActiveJobs not implemented");
}

export function waitForActiveCronJobs(): never {
  throw new Error("waitForActiveCronJobs not implemented");
}

export function abortActiveCronTaskRuns(): never {
  throw new Error("abortActiveCronTaskRuns not implemented");
}

export function retireActiveCronTaskRunTracking(): never {
  throw new Error("retireActiveCronTaskRunTracking not implemented");
}

export function waitForActiveCronTaskRuns(): never {
  throw new Error("waitForActiveCronTaskRuns not implemented");
}

export function getActiveTaskCount(): never {
  throw new Error("getActiveTaskCount not implemented");
}

export function markGatewayDraining(): never {
  throw new Error("markGatewayDraining not implemented");
}

export function resetAllLanes(): never {
  throw new Error("resetAllLanes not implemented");
}

export function waitForActiveTasks(): never {
  throw new Error("waitForActiveTasks not implemented");
}

export function getInspectableActiveTaskRestartBlockers(): never {
  throw new Error("getInspectableActiveTaskRestartBlockers not implemented");
}

export function reloadTaskRegistryFromStore(): never {
  throw new Error("reloadTaskRegistryFromStore not implemented");
}
