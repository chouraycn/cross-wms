// 移植自 openclaw/src/channels/plugins/binding-registry.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function primeConfiguredBindingRegistry(..._args: unknown[]): unknown {
  throw new Error("not implemented: primeConfiguredBindingRegistry");
}

export function resolveConfiguredBindingRecord(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredBindingRecord");
}

export function resolveConfiguredBindingRecordForConversation(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredBindingRecordForConversation");
}

export function resolveConfiguredBinding(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredBinding");
}

export function resolveConfiguredBindingRecordBySessionKey(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredBindingRecordBySessionKey");
}
