/**
 * 移植自 openclaw/src/agents/test-helpers/temp-plugin-extension-fixtures.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function createTempPluginDir(..._args: unknown[]): unknown {
  throw new Error("createTempPluginDir not implemented (openclaw stub)");
}
export function writeTempPlugin(..._args: unknown[]): unknown {
  throw new Error("writeTempPlugin not implemented (openclaw stub)");
}
export function cleanupTempPluginTestEnvironment(..._args: unknown[]): unknown {
  throw new Error("cleanupTempPluginTestEnvironment not implemented (openclaw stub)");
}
export function resetActivePluginRegistryForTest(..._args: unknown[]): unknown {
  throw new Error("resetActivePluginRegistryForTest not implemented (openclaw stub)");
}
