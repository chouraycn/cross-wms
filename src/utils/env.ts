/**
 * 统一环境检测工具
 */

/** 是否在 pywebview 桌面应用环境中运行 */
export function isPyWebView(): boolean {
  return typeof window !== 'undefined' && 'pywebview' in window;
}

/** 是否在 WKWebView 中运行（pywebview macOS 使用 WKWebView） */
export function isWKWebView(): boolean {
  return typeof window !== 'undefined' && (
    'pywebview' in window ||
    !!(window as any).webkit?.messageHandlers
  );
}

/** 是否在桌面应用环境中（需要 rAF 降级为 setTimeout） */
export function isDesktopApp(): boolean {
  return isWKWebView();
}
