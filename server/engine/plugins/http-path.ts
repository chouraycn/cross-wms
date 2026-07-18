/**
 * 规范化插件 manifest 与路由使用的 HTTP 路径值。
 *
 * 降级说明：原实现依赖 @openclaw/normalization-core/string-coerce 的
 * normalizeOptionalString，cross-wms 暂未引入该包，这里以本地实现替代。
 */

/** 去除首尾空白并在值为空时返回 null。 */
function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/** 将插件 HTTP 路径规范化为前导斜杠形式，支持可选 fallback。 */
export function normalizePluginHttpPath(
  path?: string | null,
  fallback?: string | null,
): string | null {
  const trimmed = normalizeOptionalString(path);
  if (!trimmed) {
    const fallbackTrimmed = normalizeOptionalString(fallback);
    if (!fallbackTrimmed) {
      return null;
    }
    return fallbackTrimmed.startsWith("/") ? fallbackTrimmed : `/${fallbackTrimmed}`;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
