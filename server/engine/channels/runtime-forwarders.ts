// 移植自 openclaw/src/channels/plugins/runtime-forwarders.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function createRuntimeDirectoryLiveAdapter(..._args: unknown[]): unknown {
  throw new Error("not implemented: createRuntimeDirectoryLiveAdapter");
}

export function createRuntimeOutboundDelegates(..._args: unknown[]): unknown {
  throw new Error("not implemented: createRuntimeOutboundDelegates");
}
