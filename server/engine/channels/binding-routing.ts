// 移植自 openclaw/src/channels/plugins/binding-routing.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfiguredBindingRouteResult = unknown;

export type RuntimeConversationBindingRouteResult = unknown;

export function resolveConfiguredBindingRoute(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredBindingRoute");
}

export function resolveRuntimeConversationBindingRoute(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveRuntimeConversationBindingRoute");
}

export async function ensureConfiguredBindingRouteReady(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: ensureConfiguredBindingRouteReady");
}
