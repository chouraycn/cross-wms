/**
 * 移植自 openclaw/src/agents/video-generation-task-status.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const VIDEO_GENERATION_TASK_KIND: unknown = undefined;
export function findActiveVideoGenerationTaskForSession(..._args: unknown[]): unknown {
  throw new Error("findActiveVideoGenerationTaskForSession not implemented (openclaw stub)");
}
export function findDuplicateGuardVideoGenerationTaskForSession(..._args: unknown[]): unknown {
  throw new Error("findDuplicateGuardVideoGenerationTaskForSession not implemented (openclaw stub)");
}
export function buildVideoGenerationTaskStatusDetails(..._args: unknown[]): unknown {
  throw new Error("buildVideoGenerationTaskStatusDetails not implemented (openclaw stub)");
}
export function buildVideoGenerationTaskStatusText(..._args: unknown[]): unknown {
  throw new Error("buildVideoGenerationTaskStatusText not implemented (openclaw stub)");
}
export function buildActiveVideoGenerationTaskPromptContextForSession(..._args: unknown[]): unknown {
  throw new Error("buildActiveVideoGenerationTaskPromptContextForSession not implemented (openclaw stub)");
}
