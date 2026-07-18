// 移植自 openclaw/src/config/schema.hints.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfigUiHint = unknown;
export type ConfigUiHints = unknown;
export function isPluginOwnedChannelHintPath(...args: unknown[]): unknown {
  throw new Error("not implemented: isPluginOwnedChannelHintPath");
}
export function buildBaseHints(...args: unknown[]): unknown {
  throw new Error("not implemented: buildBaseHints");
}
export function applySensitiveHints(...args: unknown[]): unknown {
  throw new Error("not implemented: applySensitiveHints");
}
export function applySensitiveUrlHints(...args: unknown[]): unknown {
  throw new Error("not implemented: applySensitiveUrlHints");
}
export function collectMatchingSchemaPaths(...args: unknown[]): unknown {
  throw new Error("not implemented: collectMatchingSchemaPaths");
}
export function mapSensitivePaths(...args: unknown[]): unknown {
  throw new Error("not implemented: mapSensitivePaths");
}
export const testApi: unknown = undefined;
export type isSensitiveConfigPath = unknown;
export type __test__ = unknown;
