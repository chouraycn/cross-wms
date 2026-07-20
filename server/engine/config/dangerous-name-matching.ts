// 移植自 openclaw/src/config/dangerous-name-matching.ts

export function isDangerousNameMatchingEnabled(...args: unknown[]): unknown {
  return false;
}
export function resolveDangerousNameMatchingEnabled(...args: unknown[]): unknown {
  return undefined;
}
export function collectProviderDangerousNameMatchingScopes(...args: unknown[]): unknown {
  return [];
}
