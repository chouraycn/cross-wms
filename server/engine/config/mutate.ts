// 移植自 openclaw/src/config/mutate.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfigMutationBase = unknown;
export type ConfigReplaceResult = unknown;
export type ConfigMutationIO = unknown;
export type ConfigMutationContext = unknown;
export type ConfigTransformResult = unknown;
export type ConfigMutationCommitParams = unknown;
export type ConfigMutationCommitResult = unknown;
export type ConfigMutationCommit = unknown;
export type TransformConfigFileParams = unknown;
export type TransformConfigFileWithRetryParams = unknown;
export type ConfigMutationResult = unknown;
export function replaceConfigFile(...args: unknown[]): unknown {
  throw new Error("not implemented: replaceConfigFile");
}
export function transformConfigFile(...args: unknown[]): unknown {
  throw new Error("not implemented: transformConfigFile");
}
export function transformConfigFileWithRetry(...args: unknown[]): unknown {
  throw new Error("not implemented: transformConfigFileWithRetry");
}
export function mutateConfigFile(...args: unknown[]): unknown {
  throw new Error("not implemented: mutateConfigFile");
}
export function mutateConfigFileWithRetry(...args: unknown[]): unknown {
  throw new Error("not implemented: mutateConfigFileWithRetry");
}
export type ConfigMutationConflictError = unknown;
export const ConfigMutationConflictError: unknown = undefined;
