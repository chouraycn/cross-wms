/**
 * 移植自 openclaw/src/agents/music-generation-task-status.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const MUSIC_GENERATION_TASK_KIND: unknown = undefined;
export function findActiveMusicGenerationTaskForSession(..._args: unknown[]): unknown {
  throw new Error("findActiveMusicGenerationTaskForSession not implemented (openclaw stub)");
}
export function findDuplicateGuardMusicGenerationTaskForSession(..._args: unknown[]): unknown {
  throw new Error("findDuplicateGuardMusicGenerationTaskForSession not implemented (openclaw stub)");
}
export function buildMusicGenerationTaskStatusDetails(..._args: unknown[]): unknown {
  throw new Error("buildMusicGenerationTaskStatusDetails not implemented (openclaw stub)");
}
export function buildMusicGenerationTaskStatusText(..._args: unknown[]): unknown {
  throw new Error("buildMusicGenerationTaskStatusText not implemented (openclaw stub)");
}
export function buildActiveMusicGenerationTaskPromptContextForSession(..._args: unknown[]): unknown {
  throw new Error("buildActiveMusicGenerationTaskPromptContextForSession not implemented (openclaw stub)");
}
