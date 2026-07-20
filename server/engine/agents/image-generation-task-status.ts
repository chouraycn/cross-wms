/**
 * 移植自 openclaw/src/agents/image-generation-task-status.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const IMAGE_GENERATION_TASK_KIND: unknown = undefined;
export function findActiveImageGenerationTaskForSession(..._args: unknown[]): unknown {
  return [];
}
export function listActiveImageGenerationTasksForSession(..._args: unknown[]): unknown {
  return [];
}
export function findDuplicateGuardImageGenerationTaskForSession(..._args: unknown[]): unknown {
  return [];
}
export function buildImageGenerationTaskStatusDetails(..._args: unknown[]): unknown {
  return undefined;
}
export function buildImageGenerationTaskStatusListDetails(..._args: unknown[]): unknown {
  return undefined;
}
export function buildImageGenerationTaskStatusText(..._args: unknown[]): unknown {
  return undefined;
}
export function buildImageGenerationTaskStatusListText(..._args: unknown[]): unknown {
  return undefined;
}
export function buildActiveImageGenerationTaskPromptContextForSession(..._args: unknown[]): unknown {
  return undefined;
}
