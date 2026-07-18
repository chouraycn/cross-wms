/**
 * 移植自 openclaw/src/agents/model-selection.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { isCliProvider } from "./model-selection-cli.js";
export type ThinkLevel = unknown;
export function resolvePersistedOverrideModelRef(..._args: unknown[]): unknown {
  throw new Error("resolvePersistedOverrideModelRef not implemented (openclaw stub)");
}
export function resolvePersistedModelRef(..._args: unknown[]): unknown {
  throw new Error("resolvePersistedModelRef not implemented (openclaw stub)");
}
export function resolvePersistedSelectedModelRef(..._args: unknown[]): unknown {
  throw new Error("resolvePersistedSelectedModelRef not implemented (openclaw stub)");
}
export function normalizeStoredOverrideModel(..._args: unknown[]): unknown {
  throw new Error("normalizeStoredOverrideModel not implemented (openclaw stub)");
}
export function resolveAllowlistModelKey(..._args: unknown[]): unknown {
  throw new Error("resolveAllowlistModelKey not implemented (openclaw stub)");
}
export function resolveDefaultModelForAgent(..._args: unknown[]): unknown {
  throw new Error("resolveDefaultModelForAgent not implemented (openclaw stub)");
}
export async function canonicalizeCaseOnlyCatalogModelRef(..._args: unknown[]): Promise<unknown> {
  throw new Error("canonicalizeCaseOnlyCatalogModelRef not implemented (openclaw stub)");
}
export function resolveSubagentConfiguredModelSelection(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentConfiguredModelSelection not implemented (openclaw stub)");
}
export function resolveSubagentSpawnModelSelection(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentSpawnModelSelection not implemented (openclaw stub)");
}
export function resolveConfiguredSubagentSpawnModelSelection(..._args: unknown[]): unknown {
  throw new Error("resolveConfiguredSubagentSpawnModelSelection not implemented (openclaw stub)");
}
export function buildAllowedModelSet(..._args: unknown[]): unknown {
  throw new Error("buildAllowedModelSet not implemented (openclaw stub)");
}
export function getModelRefStatus(..._args: unknown[]): unknown {
  throw new Error("getModelRefStatus not implemented (openclaw stub)");
}
export function resolveAllowedModelRef(..._args: unknown[]): unknown {
  throw new Error("resolveAllowedModelRef not implemented (openclaw stub)");
}
export function resolveReasoningDefault(..._args: unknown[]): unknown {
  throw new Error("resolveReasoningDefault not implemented (openclaw stub)");
}
