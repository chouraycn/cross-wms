/**
 * 包解析或本地路径展开前使用的安装规格分类器。
 * 仅依赖 node:path 内置模块。
 */
import path from "node:path";

/** 检测应被解释为本地文件/路径安装的规格。 */
export function looksLikeLocalInstallSpec(spec: string, knownSuffixes: readonly string[]): boolean {
  return (
    spec.startsWith(".") ||
    spec.startsWith("~") ||
    path.isAbsolute(spec) ||
    knownSuffixes.some((suffix) => spec.endsWith(suffix))
  );
}
