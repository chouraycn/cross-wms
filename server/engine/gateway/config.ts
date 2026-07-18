// 移植自 openclaw/src/gateway/server-methods/config.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveConfigOpenCommand(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfigOpenCommand");
}

export function clearConfigSchemaResponseCacheForTests(...args: unknown[]): unknown {
  throw new Error("not implemented: clearConfigSchemaResponseCacheForTests");
}

export function loadConfigSchemaResponseForTests(...args: unknown[]): unknown {
  throw new Error("not implemented: loadConfigSchemaResponseForTests");
}

export const configHandlers: unknown = undefined;
