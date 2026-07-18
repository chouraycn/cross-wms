/**
 * 移植自 openclaw/src/agents/tools/pdf-tool.helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolvePdfInputs(..._args: unknown[]): unknown {
  throw new Error("resolvePdfInputs not implemented (openclaw stub)");
}
export function providerSupportsNativePdf(..._args: unknown[]): unknown {
  throw new Error("providerSupportsNativePdf not implemented (openclaw stub)");
}
export function parsePageRange(..._args: unknown[]): unknown {
  throw new Error("parsePageRange not implemented (openclaw stub)");
}
export function coercePdfAssistantText(..._args: unknown[]): unknown {
  throw new Error("coercePdfAssistantText not implemented (openclaw stub)");
}
export function coercePdfModelConfig(..._args: unknown[]): unknown {
  throw new Error("coercePdfModelConfig not implemented (openclaw stub)");
}
export function resolvePdfToolMaxTokens(..._args: unknown[]): unknown {
  throw new Error("resolvePdfToolMaxTokens not implemented (openclaw stub)");
}
