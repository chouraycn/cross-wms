// 移植自 openclaw/src/config/dangerous-name-matching.ts

export function isDangerousNameMatchingEnabled(...args: any[]): any {
  return false;
}
export function resolveDangerousNameMatchingEnabled(...args: any[]): any {
  return undefined;
}
export function collectProviderDangerousNameMatchingScopes(...args: any[]): any {
  return [];
}
