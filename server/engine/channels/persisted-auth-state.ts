// 移植自 openclaw/src/channels/plugins/persisted-auth-state.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listBundledChannelIdsWithPersistedAuthState(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelIdsWithPersistedAuthState");
}

export function hasBundledChannelPersistedAuthState(..._args: unknown[]): unknown {
  throw new Error("not implemented: hasBundledChannelPersistedAuthState");
}
