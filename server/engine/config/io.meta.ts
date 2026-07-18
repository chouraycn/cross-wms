// 移植自 openclaw/src/config/io.meta.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function stampConfigWriteMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: stampConfigWriteMetadata");
}
export const AUTO_MANAGED_CONFIG_META_PATHS: unknown = undefined;
