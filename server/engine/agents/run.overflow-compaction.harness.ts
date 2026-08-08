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
export function resetRunOverflowCompactionHarnessMocks(..._args: any[]): any {
  return undefined;
}
export function loadRunOverflowCompactionHarness(..._args: any[]): any {
  return undefined;
}
export const mockedGlobalHookRunner: any = undefined;
export const mockedContextEngine: any = undefined;
export const mockedCompactDirect: any = undefined;
export const mockedResolveContextEngine: any = undefined;
export const mockedResolveContextEngineOwnerPluginId: any = undefined;
export const mockedBuildAgentRuntimePlan: any = undefined;
export const mockedRunPostCompactionSideEffects: any = undefined;
export const mockedSleepWithAbort: any = undefined;
export const mockedEnsureRuntimePluginsLoaded: any = undefined;
export const mockedResolveModelAsync: any = undefined;
export const mockedPrepareProviderRuntimeAuth: any = undefined;
export const mockedRunEmbeddedAttempt: any = undefined;
export const mockedBuildEmbeddedRunPayloads: any = undefined;
export const mockedRunContextEngineMaintenance: any = undefined;
export const mockedWaitForDeferredTurnMaintenanceForSession: any = undefined;
export const mockedSessionLikelyHasOversizedToolResults: any = undefined;
export const mockedResolveLiveToolResultMaxChars: any = undefined;
export const mockedTruncateOversizedToolResultsInSession: any = undefined;
export const mockedCoerceToFailoverError: any = undefined;
export const mockedDescribeFailoverError: any = undefined;
export const mockedResolveFailoverStatus: any = undefined;
export const mockedLog: any = undefined;
export const mockedFormatBillingErrorMessage: any = undefined;
export const mockedClassifyFailoverReason: any = undefined;
export const mockedClassifyAssistantFailoverReason: any = undefined;
export const mockedExtractObservedOverflowTokenCount: any = undefined;
export const mockedFormatAssistantErrorText: any = undefined;
export const mockedIsAuthAssistantError: any = undefined;
export const mockedIsBillingAssistantError: any = undefined;
export const mockedIsCompactionFailureError: any = undefined;
export const mockedIsFailoverAssistantError: any = undefined;
export const mockedIsFailoverErrorMessage: any = undefined;
export const mockedIsGenericUnknownStreamErrorMessage: any = undefined;
export const mockedIsLikelyContextOverflowError: any = undefined;
export const mockedParseImageSizeError: any = undefined;
export const mockedParseImageDimensionError: any = undefined;
export const mockedIsRateLimitAssistantError: any = undefined;
export const mockedIsTimeoutErrorMessage: any = undefined;
export const mockedPickFallbackThinkingLevel: any = undefined;
export const mockedEvaluateContextWindowGuard: any = undefined;
export const mockedResolveContextWindowInfo: any = undefined;
export const mockedFormatContextWindowWarningMessage: any = undefined;
export const mockedFormatContextWindowBlockMessage: any = undefined;
export const mockedGetApiKeyForModel: any = undefined;
export const mockedMarkAuthProfileFailure: any = undefined;
export const mockedEnsureAuthProfileStore: any = undefined;
export const mockedEnsureAuthProfileStoreWithoutExternalProfiles: any = undefined;
export const mockedResolveAuthProfileOrder: any = undefined;
export const mockedMarkAuthProfileSuccess: any = undefined;
export const mockedShouldPreferExplicitConfigApiKeyAuth: any = undefined;
export const overflowBaseRunParams: any = undefined;
