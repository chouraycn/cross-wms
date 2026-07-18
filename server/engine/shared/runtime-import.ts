// 运行时导入辅助：用于可能从 file URL 或平台路径加载的惰性模块
// Windows 路径需要规范化后才能被 Node 的 ESM 加载器安全导入
import { toSafeImportPath } from "./import-specifier.js";

/**
 * 相对调用方模块 URL 或路径解析惰性运行时导入部分。
 * 绝对规范化路径独立；相对部分则基于规范化基址解析。
 */
export function resolveRuntimeImportSpecifier(baseUrl: string, parts: readonly string[]): string {
  const joined = parts.join("");
  const safeJoined = toSafeImportPath(joined);
  // 绝对 Windows 路径与 UNC 共享变成独立的 file URL，而不是相对调用方模块 URL 解析
  if (safeJoined !== joined) {
    return safeJoined;
  }
  return new URL(joined, toSafeImportPath(baseUrl)).href;
}

/**
 * 通过规范化运行时规范符导入一个惰性运行时模块。
 * 注入的 importer 让平台特定规范符处理可单元测试。
 */
export async function importRuntimeModule<T>(
  baseUrl: string,
  parts: readonly string[],
  importModule: (specifier: string) => Promise<unknown> = (specifier) => import(specifier),
): Promise<T> {
  return (await importModule(resolveRuntimeImportSpecifier(baseUrl, parts))) as T;
}
