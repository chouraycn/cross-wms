// 移植自 openclaw/src/channels/plugins/setup-registry.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listChannelSetupPlugins(..._args: unknown[]): unknown {
  throw new Error("not implemented: listChannelSetupPlugins");
}

export function listActiveChannelSetupPlugins(..._args: unknown[]): unknown {
  throw new Error("not implemented: listActiveChannelSetupPlugins");
}

export function getChannelSetupPlugin(..._args: unknown[]): unknown {
  throw new Error("not implemented: getChannelSetupPlugin");
}
