// 移植自 openclaw/src/channels/message-access/runtime-identity.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function defineStableChannelIngressIdentity(..._args: unknown[]): unknown {
  throw new Error("not implemented: defineStableChannelIngressIdentity");
}

export function createIdentityAdapter(..._args: unknown[]): unknown {
  throw new Error("not implemented: createIdentityAdapter");
}

export function createIdentitySubject(..._args: unknown[]): unknown {
  throw new Error("not implemented: createIdentitySubject");
}
