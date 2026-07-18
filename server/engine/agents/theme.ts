/**
 * 移植自 openclaw/src/agents/modes/interactive/theme/theme.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ThemeColor = unknown;
export type ThemeBg = unknown;
export class Theme {
  constructor(..._args: unknown[]) { throw new Error("Theme not implemented (openclaw stub)"); }
}
export function loadThemeFromPath(..._args: unknown[]): unknown {
  throw new Error("loadThemeFromPath not implemented (openclaw stub)");
}
export function setTheme(..._args: unknown[]): unknown {
  throw new Error("setTheme not implemented (openclaw stub)");
}
export function stopThemeWatcher(..._args: unknown[]): unknown {
  throw new Error("stopThemeWatcher not implemented (openclaw stub)");
}
export function highlightCode(..._args: unknown[]): unknown {
  throw new Error("highlightCode not implemented (openclaw stub)");
}
export function getLanguageFromPath(..._args: unknown[]): unknown {
  throw new Error("getLanguageFromPath not implemented (openclaw stub)");
}
export const theme: unknown = undefined;
