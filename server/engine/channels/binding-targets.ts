// 移植自 openclaw/src/channels/plugins/binding-targets.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function ensureConfiguredBindingTargetReady(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: ensureConfiguredBindingTargetReady");
}

export async function resetConfiguredBindingTargetInPlace(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: resetConfiguredBindingTargetInPlace");
}

export async function ensureConfiguredBindingTargetSession(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: ensureConfiguredBindingTargetSession");
}
