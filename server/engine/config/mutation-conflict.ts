// 移植自 openclaw/src/config/mutation-conflict.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export class ConfigMutationConflictError {
  constructor(...args: unknown[]) { throw new Error("not implemented: ConfigMutationConflictError"); }
}
