/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run.overflow-compaction.harness.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export class MockedFailoverError {
  // Stub: not fully ported
}
export function resetRunOverflowCompactionHarnessMocks(..._args: unknown[]): unknown {
  return undefined;
}
export function loadRunOverflowCompactionHarness(..._args: unknown[]): unknown {
  return undefined;
}
export const mockedGlobalHookRunner: unknown = undefined;
export const mockedContextEngine: unknown = undefined;
export const mockedCompactDirect: unknown = undefined;
export const mockedResolveContextEngine: unknown = undefined;
export const mockedResolveContextEngineOwnerPluginId: unknown = undefined;
export const mockedBuildAgentRuntimePlan: unknown = undefined;
export const mockedRunPostCompactionSideEffects: unknown = undefined;
export const mockedSleepWithAbort: unknown = undefined;
export const mockedEnsureRuntimePluginsLoaded: unknown = undefined;
export const mockedResolveModelAsync: unknown = undefined;
export const mockedPrepareProviderRuntimeAuth: unknown = undefined;
export const mockedRunEmbeddedAttempt: unknown = undefined;
export const mockedBuildEmbeddedRunPayloads: unknown = undefined;
export const mockedRunContextEngineMaintenance: unknown = undefined;
export const mockedWaitForDeferredTurnMaintenanceForSession: unknown = undefined;
export const mockedSessionLikelyHasOversizedToolResults: unknown = undefined;
export const mockedResolveLiveToolResultMaxChars: unknown = undefined;
export const mockedTruncateOversizedToolResultsInSession: unknown = undefined;
export const mockedCoerceToFailoverError: unknown = undefined;
export const mockedDescribeFailoverError: unknown = undefined;
export const mockedResolveFailoverStatus: unknown = undefined;
export const mockedLog: unknown = undefined;
export const mockedFormatBillingErrorMessage: unknown = undefined;
export const mockedClassifyFailoverReason: unknown = undefined;
export const mockedClassifyAssistantFailoverReason: unknown = undefined;
export const mockedExtractObservedOverflowTokenCount: unknown = undefined;
export const mockedFormatAssistantErrorText: unknown = undefined;
export const mockedIsAuthAssistantError: unknown = undefined;
export const mockedIsBillingAssistantError: unknown = undefined;
export const mockedIsCompactionFailureError: unknown = undefined;
export const mockedIsFailoverAssistantError: unknown = undefined;
export const mockedIsFailoverErrorMessage: unknown = undefined;
export const mockedIsGenericUnknownStreamErrorMessage: unknown = undefined;
export const mockedIsLikelyContextOverflowError: unknown = undefined;
export const mockedParseImageSizeError: unknown = undefined;
export const mockedParseImageDimensionError: unknown = undefined;
export const mockedIsRateLimitAssistantError: unknown = undefined;
export const mockedIsTimeoutErrorMessage: unknown = undefined;
export const mockedPickFallbackThinkingLevel: unknown = undefined;
export const mockedEvaluateContextWindowGuard: unknown = undefined;
export const mockedResolveContextWindowInfo: unknown = undefined;
export const mockedFormatContextWindowWarningMessage: unknown = undefined;
export const mockedFormatContextWindowBlockMessage: unknown = undefined;
export const mockedGetApiKeyForModel: unknown = undefined;
export const mockedMarkAuthProfileFailure: unknown = undefined;
export const mockedEnsureAuthProfileStore: unknown = undefined;
export const mockedEnsureAuthProfileStoreWithoutExternalProfiles: unknown = undefined;
export const mockedResolveAuthProfileOrder: unknown = undefined;
export const mockedMarkAuthProfileSuccess: unknown = undefined;
export const mockedShouldPreferExplicitConfigApiKeyAuth: unknown = undefined;
export const overflowBaseRunParams: unknown = undefined;
