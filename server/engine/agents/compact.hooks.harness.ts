/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compact.hooks.harness.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resetCompactSessionStateMocks(..._args: unknown[]): unknown {
  return undefined;
}
export function resetCompactHooksHarnessMocks(..._args: unknown[]): unknown {
  return undefined;
}
export function loadCompactHooksHarness(..._args: unknown[]): unknown {
  return undefined;
}
export const contextEngineCompactMock: unknown = undefined;
export const hookRunner: unknown = undefined;
export const ensureRuntimePluginsLoaded: unknown = undefined;
export const resolveContextEngineMock: unknown = undefined;
export const resolveModelMock: unknown = undefined;
export const sessionCompactImpl: unknown = undefined;
export const triggerInternalHook: unknown = undefined;
export const getMemorySearchManagerMock: unknown = undefined;
export const resolveMemorySearchConfigMock: unknown = undefined;
export const resolveSessionAgentIdMock: unknown = undefined;
export const resolveSessionAgentIdsMock: unknown = undefined;
export const estimateTokensMock: unknown = undefined;
export const resolveAgentHarnessPolicyMock: unknown = undefined;
export const resolveContextWindowInfoMock: unknown = undefined;
export const sessionMessages: unknown = undefined;
export const sessionAbortCompactionMock: unknown = undefined;
export const createAgentSessionMock: unknown = undefined;
export const createOpenClawCodingToolsMock: unknown = undefined;
export const guardSessionManagerMock: unknown = undefined;
export const applyAgentCompactionSettingsFromConfigMock: unknown = undefined;
export const createPreparedEmbeddedAgentSettingsManagerMock: unknown = undefined;
export const listRegisteredPluginAgentPromptGuidanceMock: unknown = undefined;
export const buildEmbeddedSystemPromptMock: unknown = undefined;
export const resolveEmbeddedAgentStreamFnMock: unknown = undefined;
export const registerProviderStreamForModelMock: unknown = undefined;
export const applyExtraParamsToAgentMock: unknown = undefined;
export const resolveSandboxContextMock: unknown = undefined;
export const maybeCompactAgentHarnessSessionMock: unknown = undefined;
export const rotateTranscriptAfterCompactionMock: unknown = undefined;
export const enqueueCommandInLaneMock: unknown = undefined;
