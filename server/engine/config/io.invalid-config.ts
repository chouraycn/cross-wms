// 移植自 openclaw/src/config/io.invalid-config.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function formatInvalidConfigDetails(...args: unknown[]): unknown {
  throw new Error("not implemented: formatInvalidConfigDetails");
}
export function formatInvalidConfigLogMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: formatInvalidConfigLogMessage");
}
export function logInvalidConfigOnce(...args: unknown[]): unknown {
  throw new Error("not implemented: logInvalidConfigOnce");
}
export function createInvalidConfigError(...args: unknown[]): unknown {
  throw new Error("not implemented: createInvalidConfigError");
}
export function throwInvalidConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: throwInvalidConfig");
}
