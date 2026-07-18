// 移植自 openclaw/src/infra/dispatch-wrapper-resolution.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function extractEnvAssignmentKeysFromDispatchWrappers(...args: unknown[]): unknown {
  throw new Error("not implemented: extractEnvAssignmentKeysFromDispatchWrappers");
}
export function isDispatchWrapperExecutable(...args: unknown[]): unknown {
  throw new Error("not implemented: isDispatchWrapperExecutable");
}
export function unwrapKnownDispatchWrapperInvocation(...args: unknown[]): unknown {
  throw new Error("not implemented: unwrapKnownDispatchWrapperInvocation");
}
export function unwrapDispatchWrappersForResolution(...args: unknown[]): unknown {
  throw new Error("not implemented: unwrapDispatchWrappersForResolution");
}
export function resolveDispatchWrapperTrustPlan(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveDispatchWrapperTrustPlan");
}
export function hasDispatchEnvManipulation(...args: unknown[]): boolean {
  throw new Error("not implemented: hasDispatchEnvManipulation");
}
export const MAX_DISPATCH_WRAPPER_DEPTH: number = 4;
export type unwrapEnvInvocation = unknown;
export const unwrapEnvInvocation: unknown = undefined;
