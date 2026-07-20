// 移植自 openclaw/src/config/sensitive-paths.ts

export function isSensitiveConfigPath(...args: unknown[]): unknown {
  return false;
}
