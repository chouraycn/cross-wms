/**
 * 移植自 openclaw/src/agents/tools/video-generate-background.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type VideoGenerationTaskHandle = unknown;
export const videoGenerationTaskLifecycle: any = undefined;
export const createVideoGenerationTaskRun: any = undefined;
export const recordVideoGenerationTaskProgress: any = undefined;
export const completeVideoGenerationTaskRun: any = undefined;
export const failVideoGenerationTaskRun: any = undefined;
