/**
 * 统一环境检测工具
 */

/** 是否在桌面应用环境中运行（Swift 原生 WKWebView 模拟了 pywebview 接口） */
export function isPyWebView(): boolean {
  return typeof window !== 'undefined' && 'pywebview' in window;
}

/** 是否在 WKWebView 中运行（Swift 原生应用使用 WKWebView） */
export function isWKWebView(): boolean {
  return typeof window !== 'undefined' && (
    'pywebview' in window ||
    !!(window as any).webkit?.messageHandlers
  );
}

/** 是否在 Electron 环境中运行 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

/**
 * 是否在桌面应用环境中（需要 rAF 降级为 setTimeout）
 *
 * v8.2-fix: 增加 Electron 检测。
 * Electron 的 BrowserWindow 在 macOS 上默认启用 backgroundThrottling，
 * 非活跃窗口的 requestAnimationFrame 会被大幅节流（从 60fps 降到 ~1fps），
 * 导致 SSE 流式内容到达但不渲染，用户交互后才刷新。
 * 降级为 setTimeout(fn, 16) 可绕过此限制。
 */
export function isDesktopApp(): boolean {
  return isWKWebView() || isElectron();
}
