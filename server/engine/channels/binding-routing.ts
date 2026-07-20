// 移植自 openclaw/src/channels/plugins/binding-routing.ts

export type ConfiguredBindingRouteResult = unknown;

export type RuntimeConversationBindingRouteResult = unknown;

export function resolveConfiguredBindingRoute(..._args: unknown[]): unknown {
  return undefined;
}

export function resolveRuntimeConversationBindingRoute(..._args: unknown[]): unknown {
  return undefined;
}

export async function ensureConfiguredBindingRouteReady(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
