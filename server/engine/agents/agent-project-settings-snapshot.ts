/**
 * 移植自 openclaw/src/agents/agent-project-settings-snapshot.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const DEFAULT_EMBEDDED_AGENT_PROJECT_SETTINGS_POLICY: unknown = undefined;
export function loadEnabledBundleAgentSettingsSnapshot(..._args: unknown[]): unknown {
  throw new Error("loadEnabledBundleAgentSettingsSnapshot not implemented (openclaw stub)");
}
export function resolveEmbeddedAgentProjectSettingsPolicy(..._args: unknown[]): unknown {
  throw new Error("resolveEmbeddedAgentProjectSettingsPolicy not implemented (openclaw stub)");
}
export function buildEmbeddedAgentSettingsSnapshot(..._args: unknown[]): unknown {
  throw new Error("buildEmbeddedAgentSettingsSnapshot not implemented (openclaw stub)");
}
