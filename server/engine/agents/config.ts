/**
 * 移植自 openclaw/src/agents/config.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const isBunBinary: unknown = undefined;
export const APP_NAME: unknown = undefined;
export const CONFIG_DIR_NAME: unknown = undefined;
export const VERSION: unknown = undefined;
export function getThemesDir(..._args: unknown[]): unknown {
  throw new Error("getThemesDir not implemented (openclaw stub)");
}
export function getReadmePath(..._args: unknown[]): unknown {
  throw new Error("getReadmePath not implemented (openclaw stub)");
}
export function getDocsPath(..._args: unknown[]): unknown {
  throw new Error("getDocsPath not implemented (openclaw stub)");
}
export function getExamplesPath(..._args: unknown[]): unknown {
  throw new Error("getExamplesPath not implemented (openclaw stub)");
}
export function getAgentDir(..._args: unknown[]): unknown {
  throw new Error("getAgentDir not implemented (openclaw stub)");
}
export function getCustomThemesDir(..._args: unknown[]): unknown {
  throw new Error("getCustomThemesDir not implemented (openclaw stub)");
}
export function getBinDir(..._args: unknown[]): unknown {
  throw new Error("getBinDir not implemented (openclaw stub)");
}
export function getSessionsDir(..._args: unknown[]): unknown {
  throw new Error("getSessionsDir not implemented (openclaw stub)");
}
