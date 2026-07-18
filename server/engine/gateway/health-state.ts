// 移植自 openclaw/src/gateway/server/health-state.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function buildGatewaySnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: buildGatewaySnapshot");
}

export function getHealthCache(...args: unknown[]): unknown {
  throw new Error("not implemented: getHealthCache");
}

export function getHealthVersion(...args: unknown[]): unknown {
  throw new Error("not implemented: getHealthVersion");
}

export function incrementPresenceVersion(...args: unknown[]): unknown {
  throw new Error("not implemented: incrementPresenceVersion");
}

export function getPresenceVersion(...args: unknown[]): unknown {
  throw new Error("not implemented: getPresenceVersion");
}

export function setBroadcastHealthUpdate(...args: unknown[]): unknown {
  throw new Error("not implemented: setBroadcastHealthUpdate");
}

export async function refreshGatewayHealthSnapshot(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: refreshGatewayHealthSnapshot");
}
