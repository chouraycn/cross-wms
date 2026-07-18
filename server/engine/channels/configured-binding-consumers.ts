// 移植自 openclaw/src/channels/plugins/configured-binding-consumers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ParsedConfiguredBindingSessionKey = unknown;

export type ConfiguredBindingConsumer = unknown;

export function listConfiguredBindingConsumers(..._args: unknown[]): unknown {
  throw new Error("not implemented: listConfiguredBindingConsumers");
}

export function resolveConfiguredBindingConsumer(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredBindingConsumer");
}

export function registerConfiguredBindingConsumer(..._args: unknown[]): unknown {
  throw new Error("not implemented: registerConfiguredBindingConsumer");
}
