// 移植自 openclaw/src/infra/tree-sitter-runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolvePackageFileForCommandExplanation(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePackageFileForCommandExplanation");
}
export function getBashParserForCommandExplanation(...args: unknown[]): unknown {
  throw new Error("not implemented: getBashParserForCommandExplanation");
}
export function setBashParserLoaderForCommandExplanationForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: setBashParserLoaderForCommandExplanationForTest");
}
export function parseBashForCommandExplanation(...args: unknown[]): unknown {
  throw new Error("not implemented: parseBashForCommandExplanation");
}
