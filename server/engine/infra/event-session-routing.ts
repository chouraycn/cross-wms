// 移植自 openclaw/src/infra/event-session-routing.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type EventSessionRoutingPolicy = unknown;
export function parseDirectAgentSessionTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: parseDirectAgentSessionTarget");
}
export function resolveEventSessionAllowFrom(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveEventSessionAllowFrom");
}
export function resolveEventSessionRoutingPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveEventSessionRoutingPolicy");
}
export function resolveMainScopedEventSessionKey(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMainScopedEventSessionKey");
}
export function resolveEventSessionKeyForPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveEventSessionKeyForPolicy");
}
export function scopedHeartbeatWakeOptionsForPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: scopedHeartbeatWakeOptionsForPolicy");
}
