/**
 * 移植自 openclaw/src/agents/codex-native-web-search.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { buildCodexNativeWebSearchTool, patchCodexNativeWebSearchPayload, resolveCodexNativeSearchActivation, shouldSuppressManagedWebSearchTool } from "./codex-native-web-search-core.js";
export { describeCodexNativeWebSearch, resolveCodexNativeWebSearchConfig } from "./codex-native-web-search.shared.js";
export function isCodexNativeWebSearchRelevant(..._args: unknown[]): unknown {
  throw new Error("isCodexNativeWebSearchRelevant not implemented (openclaw stub)");
}
