/**
 * Runtime sidecar paths.
 * 移植自 openclaw/src/plugins/runtime-sidecar-paths.ts。
 * 降级策略：保留常量。
 */
export function assertUniqueValues<T extends string>(values: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`duplicate runtime sidecar path: ${value}`);
    }
    seen.add(value);
  }
  return values;
}

export const BUNDLED_RUNTIME_SIDECAR_PATHS = assertUniqueValues([
  "node_modules",
  "package.json",
  "openclaw.plugin.json",
] as const);
