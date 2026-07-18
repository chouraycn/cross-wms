// 移植自 openclaw/src/channels/plugins/bootstrap-registry.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listBootstrapChannelPluginIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBootstrapChannelPluginIds");
}

export function getBootstrapChannelPlugin(..._args: unknown[]): unknown {
  throw new Error("not implemented: getBootstrapChannelPlugin");
}

export function getBootstrapChannelSecrets(..._args: unknown[]): unknown {
  throw new Error("not implemented: getBootstrapChannelSecrets");
}
