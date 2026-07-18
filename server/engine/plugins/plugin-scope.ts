// 规范化插件作用域标识符和作用域列表。
//
// 降级说明：原 openclaw 版本依赖 `@openclaw/normalization-core/string-normalization`
// 的 `normalizeStringEntries`，这里改为本地实现以避免引入外部包。

/**
 * 规范化字符串条目数组：去除首尾空白、过滤空值、保留顺序。
 * 本地降级实现，替代 `@openclaw/normalization-core/string-normalization` 的 `normalizeStringEntries`。
 */
function normalizeStringEntries(entries: readonly unknown[]): string[] {
  const result: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed) {
      result.push(trimmed);
    }
  }
  return result;
}

/** 将插件 id 作用域输入规范化为排序后的唯一字符串列表。 */
export function normalizePluginIdScope(ids?: readonly unknown[]): string[] | undefined {
  if (ids === undefined) {
    return undefined;
  }
  return Array.from(
    new Set(normalizeStringEntries(ids.filter((id): id is string => typeof id === "string"))),
  ).toSorted();
}

/** 当插件作用域被显式提供时返回 true，包括空作用域。 */
export function hasExplicitPluginIdScope(ids?: readonly string[]): boolean {
  return ids !== undefined;
}

/** 当插件作用域被显式提供且至少包含一个 id 时返回 true。 */
export function hasNonEmptyPluginIdScope(ids?: readonly string[]): boolean {
  return ids !== undefined && ids.length > 0;
}

/** 为显式插件作用域创建查找集合，未限定作用域时返回 null。 */
export function createPluginIdScopeSet(ids?: readonly string[]): ReadonlySet<string> | null {
  if (ids === undefined) {
    return null;
  }
  return new Set(ids);
}

/** 序列化插件作用域用于缓存键。 */
export function serializePluginIdScope(ids?: readonly string[]): string {
  return ids === undefined ? "__unscoped__" : JSON.stringify(ids);
}
