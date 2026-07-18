// 移植自 openclaw/src/channels/plugins/configured-binding-match.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveAccountMatchPriority(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveAccountMatchPriority");
}

export function resolveCompiledBindingChannel(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveCompiledBindingChannel");
}

export function toConfiguredBindingConversationRef(..._args: unknown[]): unknown {
  throw new Error("not implemented: toConfiguredBindingConversationRef");
}

export function materializeConfiguredBindingRecord(..._args: unknown[]): unknown {
  throw new Error("not implemented: materializeConfiguredBindingRecord");
}

export function resolveMatchingConfiguredBinding(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveMatchingConfiguredBinding");
}
