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
  // Stub: not fully ported
}
export function loadThemeFromPath(..._args: unknown[]): unknown {
  return undefined;
}
export function setTheme(..._args: unknown[]): unknown {
  return undefined;
}
export function stopThemeWatcher(..._args: unknown[]): unknown {
  return undefined;
}
export function highlightCode(..._args: unknown[]): unknown {
  return undefined;
}
export function getLanguageFromPath(..._args: unknown[]): unknown {
  return undefined;
}
export const theme: unknown = undefined;
