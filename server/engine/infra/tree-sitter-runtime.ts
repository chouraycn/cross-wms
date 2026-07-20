// 移植自 openclaw/src/infra/tree-sitter-runtime.ts
// 降级：tree-sitter 依赖不可用

/** Resolves the package file for command explanation. Not available without tree-sitter. */
export function resolvePackageFileForCommandExplanation(_commandName: string): string | null {
  // tree-sitter not available in cross-wms
  return null;
}

/** Gets a bash parser for command explanation. Not available without tree-sitter. */
export function getBashParserForCommandExplanation(): null {
  return null;
}

/** Sets the bash parser loader for testing. No-op without tree-sitter. */
export function setBashParserLoaderForCommandExplanationForTest(_loader: unknown): void {
  // No-op
}

/** Parses bash for command explanation. Returns null without tree-sitter. */
export function parseBashForCommandExplanation(_source: string): null {
  return null;
}
