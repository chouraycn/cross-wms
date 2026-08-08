/** 解包混合 ESM/CJS 插件 bundle 产生的嵌套 default 导出。 */
export function unwrapDefaultModuleExport(moduleExport: any): any {
  let resolved = moduleExport;
  const seen = new Set<any>();

  while (
    resolved &&
    typeof resolved === "object" &&
    "default" in (resolved as Record<string, any>) &&
    !seen.has(resolved)
  ) {
    seen.add(resolved);
    resolved = (resolved as { default: any }).default;
  }

  return resolved;
}
