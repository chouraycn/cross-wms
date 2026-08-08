// 移植自 openclaw/src/channels/plugins/binding-routing.ts

export type ConfiguredBindingRouteResult = unknown;

export type RuntimeConversationBindingRouteResult = unknown;

export function resolveConfiguredBindingRoute(..._args: any[]): any {
  return undefined;
}

export function resolveRuntimeConversationBindingRoute(..._args: any[]): any {
  return undefined;
}

export async function ensureConfiguredBindingRouteReady(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
