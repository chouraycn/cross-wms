// 移植自 openclaw/src/config/transcript-mirror.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveMirroredTranscriptText(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMirroredTranscriptText");
}
