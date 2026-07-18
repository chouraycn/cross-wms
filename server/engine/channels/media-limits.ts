// 移植自 openclaw/src/channels/plugins/media-limits.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveChannelMediaMaxBytes(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelMediaMaxBytes");
}
