/** Returns unique normalized string values while preserving first-seen order. */
//
// 移植自 openclaw/src/plugins/contracts/shared.ts
//
// 该模块是 contracts/ 目录下的共享工具，供 contracts/registry.ts 和
// contracts/inventory/bundled-capability-metadata.ts 使用。
export function uniqueStrings(
  values: readonly string[] | undefined,
  normalize: (value: string) => string = (value) => value,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const normalized = normalize(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
