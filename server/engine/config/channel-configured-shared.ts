// 移植自 openclaw/src/config/channel-configured-shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveChannelConfigRecord(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelConfigRecord");
}
export function hasMeaningfulChannelConfigShallow(...args: unknown[]): unknown {
  throw new Error("not implemented: hasMeaningfulChannelConfigShallow");
}
export function isStaticallyChannelConfigured(...args: unknown[]): unknown {
  throw new Error("not implemented: isStaticallyChannelConfigured");
}
