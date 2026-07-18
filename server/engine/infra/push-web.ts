// 移植自 openclaw/src/infra/push-web.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveVapidKeys(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveVapidKeys");
}
export function registerWebPushSubscription(...args: unknown[]): unknown {
  throw new Error("not implemented: registerWebPushSubscription");
}
export function listWebPushSubscriptions(...args: unknown[]): unknown {
  throw new Error("not implemented: listWebPushSubscriptions");
}
export function clearWebPushSubscriptionByEndpoint(...args: unknown[]): unknown {
  throw new Error("not implemented: clearWebPushSubscriptionByEndpoint");
}
export function broadcastWebPush(...args: unknown[]): unknown {
  throw new Error("not implemented: broadcastWebPush");
}
