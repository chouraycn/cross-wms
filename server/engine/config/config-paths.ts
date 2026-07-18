// 移植自 openclaw/src/config/config-paths.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function parseConfigPath(...args: unknown[]): unknown {
  throw new Error("not implemented: parseConfigPath");
}
export function setConfigValueAtPath(...args: unknown[]): unknown {
  throw new Error("not implemented: setConfigValueAtPath");
}
export function unsetConfigValueAtPath(...args: unknown[]): unknown {
  throw new Error("not implemented: unsetConfigValueAtPath");
}
export function getConfigValueAtPath(...args: unknown[]): unknown {
  throw new Error("not implemented: getConfigValueAtPath");
}
