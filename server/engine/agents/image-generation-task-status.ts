/**
 * 移植自 openclaw/src/agents/image-generation-task-status.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const IMAGE_GENERATION_TASK_KIND: unknown = undefined;
export function findActiveImageGenerationTaskForSession(..._args: unknown[]): unknown {
  throw new Error("findActiveImageGenerationTaskForSession not implemented (openclaw stub)");
}
export function listActiveImageGenerationTasksForSession(..._args: unknown[]): unknown {
  throw new Error("listActiveImageGenerationTasksForSession not implemented (openclaw stub)");
}
export function findDuplicateGuardImageGenerationTaskForSession(..._args: unknown[]): unknown {
  throw new Error("findDuplicateGuardImageGenerationTaskForSession not implemented (openclaw stub)");
}
export function buildImageGenerationTaskStatusDetails(..._args: unknown[]): unknown {
  throw new Error("buildImageGenerationTaskStatusDetails not implemented (openclaw stub)");
}
export function buildImageGenerationTaskStatusListDetails(..._args: unknown[]): unknown {
  throw new Error("buildImageGenerationTaskStatusListDetails not implemented (openclaw stub)");
}
export function buildImageGenerationTaskStatusText(..._args: unknown[]): unknown {
  throw new Error("buildImageGenerationTaskStatusText not implemented (openclaw stub)");
}
export function buildImageGenerationTaskStatusListText(..._args: unknown[]): unknown {
  throw new Error("buildImageGenerationTaskStatusListText not implemented (openclaw stub)");
}
export function buildActiveImageGenerationTaskPromptContextForSession(..._args: unknown[]): unknown {
  throw new Error("buildActiveImageGenerationTaskPromptContextForSession not implemented (openclaw stub)");
}
