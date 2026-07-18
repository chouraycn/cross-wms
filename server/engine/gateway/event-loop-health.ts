// 移植自 openclaw/src/gateway/server/event-loop-health.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type GatewayEventLoopHealth = unknown;

export function classifyGatewayEventLoopHealthReasons(...args: unknown[]): unknown {
  throw new Error("not implemented: classifyGatewayEventLoopHealthReasons");
}

export function createGatewayEventLoopHealthMonitor(...args: unknown[]): unknown {
  throw new Error("not implemented: createGatewayEventLoopHealthMonitor");
}
