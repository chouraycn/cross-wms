/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compact.hooks.harness.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resetCompactSessionStateMocks(..._args: any[]): any {
  return undefined;
}
export function resetCompactHooksHarnessMocks(..._args: any[]): any {
  return undefined;
}
export function loadCompactHooksHarness(..._args: any[]): any {
  return undefined;
}
export const contextEngineCompactMock: any = undefined;
export const hookRunner: any = undefined;
export const ensureRuntimePluginsLoaded: any = undefined;
export const resolveContextEngineMock: any = undefined;
export const resolveModelMock: any = undefined;
export const sessionCompactImpl: any = undefined;
export const triggerInternalHook: any = undefined;
export const getMemorySearchManagerMock: any = undefined;
export const resolveMemorySearchConfigMock: any = undefined;
export const resolveSessionAgentIdMock: any = undefined;
export const resolveSessionAgentIdsMock: any = undefined;
export const estimateTokensMock: any = undefined;
export const resolveAgentHarnessPolicyMock: any = undefined;
export const resolveContextWindowInfoMock: any = undefined;
export const sessionMessages: any = undefined;
export const sessionAbortCompactionMock: any = undefined;
export const createAgentSessionMock: any = undefined;
export const createOpenClawCodingToolsMock: any = undefined;
export const guardSessionManagerMock: any = undefined;
export const applyAgentCompactionSettingsFromConfigMock: any = undefined;
export const createPreparedEmbeddedAgentSettingsManagerMock: any = undefined;
export const listRegisteredPluginAgentPromptGuidanceMock: any = undefined;
export const buildEmbeddedSystemPromptMock: any = undefined;
export const resolveEmbeddedAgentStreamFnMock: any = undefined;
export const registerProviderStreamForModelMock: any = undefined;
export const applyExtraParamsToAgentMock: any = undefined;
export const resolveSandboxContextMock: any = undefined;
export const maybeCompactAgentHarnessSessionMock: any = undefined;
export const rotateTranscriptAfterCompactionMock: any = undefined;
export const enqueueCommandInLaneMock: any = undefined;
