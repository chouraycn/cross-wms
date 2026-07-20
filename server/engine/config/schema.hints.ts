// 移植自 openclaw/src/config/schema.hints.ts

export type ConfigUiHint = unknown;
export type ConfigUiHints = unknown;
export function isPluginOwnedChannelHintPath(...args: unknown[]): unknown {
  return false;
}
export function buildBaseHints(...args: unknown[]): unknown {
  return undefined;
}
export function applySensitiveHints(...args: unknown[]): unknown {
  return undefined;
}
export function applySensitiveUrlHints(...args: unknown[]): unknown {
  return undefined;
}
export function collectMatchingSchemaPaths(...args: unknown[]): unknown {
  return [];
}
export function mapSensitivePaths(...args: unknown[]): unknown {
  return undefined;
}
export const testApi: unknown = undefined;
export type isSensitiveConfigPath = unknown;
export type __test__ = unknown;
