// 移植自 openclaw/src/config/patch-replace-paths.ts
// 规范化 config.patch replacePaths，被 Gateway 和 agent preflight 检查共享。

export function normalizeConfigPatchReplacePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.endsWith('[]')) {
    return trimmed.slice(0, -2).replace(/\[\d+\](?=\.)/g, '[]');
  }
  return trimmed.replace(/\[\d+\](?=\.)/g, '[]');
}

export function normalizeConfigPatchReplacePaths(
  values: readonly unknown[] | undefined,
): Set<string> {
  if (!values) {
    return new Set();
  }
  return new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map(normalizeConfigPatchReplacePath)
      .filter((value) => value.length > 0),
  );
}
