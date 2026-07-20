/**
 * 移植自 openclaw/src/agents/tools/media-generate-background-shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type MediaGenerationTaskHandle = unknown;
export type MediaGenerateBackgroundScheduler = unknown;
export type MediaGenerateAsyncStartCallback = unknown;
export function shouldDetachMediaGenerationTask(..._args: unknown[]): unknown {
  return false;
}
export function withMediaGenerationTaskKeepalive(..._args: unknown[]): unknown {
  return undefined;
}
export function createDefaultMediaGenerateBackgroundScheduler(..._args: unknown[]): unknown {
  return undefined;
}
export function buildMediaGenerationStartedToolResult(..._args: unknown[]): unknown {
  return undefined;
}
export function notifyMediaGenerationAsyncTaskStarted(..._args: unknown[]): unknown {
  return undefined;
}
export function scheduleMediaGenerationTaskCompletion(..._args: unknown[]): unknown {
  return undefined;
}
export function createMediaGenerationTaskLifecycle(..._args: unknown[]): unknown {
  return undefined;
}
