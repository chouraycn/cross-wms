/**
 * 移植自 openclaw/src/agents/tools/image-generate-background.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ImageGenerationTaskHandle = unknown;
export const imageGenerationTaskLifecycle: unknown = undefined;
export const createImageGenerationTaskRun: unknown = undefined;
export const recordImageGenerationTaskProgress: unknown = undefined;
export const completeImageGenerationTaskRun: unknown = undefined;
export const failImageGenerationTaskRun: unknown = undefined;
