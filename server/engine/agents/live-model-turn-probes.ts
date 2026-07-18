/**
 * 移植自 openclaw/src/agents/live-model-turn-probes.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const LIVE_MODEL_FILE_PROBE_TOKEN: unknown = undefined;
export const LIVE_MODEL_FILE_PROBE_ENV: unknown = undefined;
export const LIVE_MODEL_IMAGE_PROBE_ENV: unknown = undefined;
export function isLiveModelProbeEnabled(..._args: unknown[]): unknown {
  throw new Error("isLiveModelProbeEnabled not implemented (openclaw stub)");
}
export function modelSupportsImageInput(..._args: unknown[]): unknown {
  throw new Error("modelSupportsImageInput not implemented (openclaw stub)");
}
export function shouldSkipLiveModelExtraProbes(..._args: unknown[]): unknown {
  throw new Error("shouldSkipLiveModelExtraProbes not implemented (openclaw stub)");
}
export function shouldSkipLiveModelFileProbe(..._args: unknown[]): unknown {
  throw new Error("shouldSkipLiveModelFileProbe not implemented (openclaw stub)");
}
export function shouldSkipLiveModelImageProbe(..._args: unknown[]): unknown {
  throw new Error("shouldSkipLiveModelImageProbe not implemented (openclaw stub)");
}
export function buildLiveModelFileProbeContext(..._args: unknown[]): unknown {
  throw new Error("buildLiveModelFileProbeContext not implemented (openclaw stub)");
}
export function buildLiveModelFileProbeRetryContext(..._args: unknown[]): unknown {
  throw new Error("buildLiveModelFileProbeRetryContext not implemented (openclaw stub)");
}
export function buildLiveModelImageProbeContext(..._args: unknown[]): unknown {
  throw new Error("buildLiveModelImageProbeContext not implemented (openclaw stub)");
}
export function fileProbeTextMatches(..._args: unknown[]): unknown {
  throw new Error("fileProbeTextMatches not implemented (openclaw stub)");
}
export function imageProbeTextMatches(..._args: unknown[]): unknown {
  throw new Error("imageProbeTextMatches not implemented (openclaw stub)");
}
