// 移植自 openclaw/src/infra/approval-handler-adapter-runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function createLazyChannelApprovalNativeRuntimeAdapter(...args: unknown[]): unknown {
  throw new Error("not implemented: createLazyChannelApprovalNativeRuntimeAdapter");
}
export const CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY: unknown = undefined;
