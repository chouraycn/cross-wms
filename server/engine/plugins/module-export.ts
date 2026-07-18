/** 解包混合 ESM/CJS 插件 bundle 产生的嵌套 default 导出。 */
export function unwrapDefaultModuleExport(moduleExport: unknown): unknown {
  let resolved = moduleExport;
  const seen = new Set<unknown>();

  while (
    resolved &&
    typeof resolved === "object" &&
    "default" in (resolved as Record<string, unknown>) &&
    !seen.has(resolved)
  ) {
    seen.add(resolved);
    resolved = (resolved as { default: unknown }).default;
  }

  return resolved;
}
