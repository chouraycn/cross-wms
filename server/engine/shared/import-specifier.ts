// 导入规范符辅助：将路径转为稳定的 ESM 导入规范符
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 在 Windows 上，Node ESM 加载器要求绝对路径表示为 file:// URL。
 * 形如 C:\... 的原始盘符路径会被解析为 URL scheme。
 */
export function toSafeImportPath(specifier: string): string {
  if (process.platform !== "win32") {
    return specifier;
  }
  if (specifier.startsWith("file://")) {
    return specifier;
  }
  if (path.win32.isAbsolute(specifier)) {
    return pathToFileURL(specifier, { windows: true }).href;
  }
  return specifier;
}
