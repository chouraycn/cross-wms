// 移植自 openclaw/src/infra/system-events.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SystemEvent = unknown;
export function isSystemEventContextChanged(...args: unknown[]): unknown {
  throw new Error("not implemented: isSystemEventContextChanged");
}
export function enqueueSystemEventEntry(...args: unknown[]): unknown {
  throw new Error("not implemented: enqueueSystemEventEntry");
}
export function enqueueSystemEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: enqueueSystemEvent");
}
export function drainSystemEventEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: drainSystemEventEntries");
}
export function consumeSystemEventEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: consumeSystemEventEntries");
}
export function consumeSelectedSystemEventEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: consumeSelectedSystemEventEntries");
}
export function drainSystemEvents(...args: unknown[]): unknown {
  throw new Error("not implemented: drainSystemEvents");
}
export function peekSystemEventEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: peekSystemEventEntries");
}
export function peekSystemEvents(...args: unknown[]): unknown {
  throw new Error("not implemented: peekSystemEvents");
}
export function hasSystemEvents(...args: unknown[]): unknown {
  throw new Error("not implemented: hasSystemEvents");
}
export function resolveSystemEventDeliveryContext(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSystemEventDeliveryContext");
}
export function resetSystemEventsForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: resetSystemEventsForTest");
}
