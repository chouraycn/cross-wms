// 移植自 openclaw/src/infra/network-discovery-display.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function pickBestEffortPrimaryLanIPv4(...args: unknown[]): unknown {
  throw new Error("not implemented: pickBestEffortPrimaryLanIPv4");
}
export function inspectBestEffortPrimaryTailnetIPv4(...args: unknown[]): unknown {
  throw new Error("not implemented: inspectBestEffortPrimaryTailnetIPv4");
}
export function resolveBestEffortGatewayBindHostForDisplay(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBestEffortGatewayBindHostForDisplay");
}
