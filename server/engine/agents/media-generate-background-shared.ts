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
  throw new Error("shouldDetachMediaGenerationTask not implemented (openclaw stub)");
}
export function withMediaGenerationTaskKeepalive(..._args: unknown[]): unknown {
  throw new Error("withMediaGenerationTaskKeepalive not implemented (openclaw stub)");
}
export function createDefaultMediaGenerateBackgroundScheduler(..._args: unknown[]): unknown {
  throw new Error("createDefaultMediaGenerateBackgroundScheduler not implemented (openclaw stub)");
}
export function buildMediaGenerationStartedToolResult(..._args: unknown[]): unknown {
  throw new Error("buildMediaGenerationStartedToolResult not implemented (openclaw stub)");
}
export function notifyMediaGenerationAsyncTaskStarted(..._args: unknown[]): unknown {
  throw new Error("notifyMediaGenerationAsyncTaskStarted not implemented (openclaw stub)");
}
export function scheduleMediaGenerationTaskCompletion(..._args: unknown[]): unknown {
  throw new Error("scheduleMediaGenerationTaskCompletion not implemented (openclaw stub)");
}
export function createMediaGenerationTaskLifecycle(..._args: unknown[]): unknown {
  throw new Error("createMediaGenerationTaskLifecycle not implemented (openclaw stub)");
}
