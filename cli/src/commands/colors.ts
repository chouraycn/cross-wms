/**
 * ANSI 颜色工具模块
 * 集中管理 TUI 输出的 ANSI 转义码，便于复用与测试。
 *
 * 设计要点：
 *  - 颜色常量定义为无副作用的纯字符串，便于直接嵌入输出。
 *  - 提供 helper 函数（color / colorize）以减少模板字符串拼接。
 *  - 支持通过 `setColorEnabled(false)` 整体禁用颜色（CI / 管道）。
 *  - 可通过 `NO_COLOR` 环境变量自动关闭颜色，符合社区规范。
 */

export const RESET = '\x1b[0m';

/** 样式 / 前景色 */
export const BOLD_CYAN = '\x1b[1;36m';
export const WHITE = '\x1b[37m';
export const HIGHLIGHT_YELLOW = '\x1b[33;7m'; // 黄底反显，用于悬停/选中
export const SUCCESS_GREEN = '\x1b[32m';
export const WARN_YELLOW = '\x1b[33m';
export const ERROR_RED = '\x1b[31m';
export const MUTED_GRAY = '\x1b[90m';

/** 当前是否启用颜色（默认 true，CI 或 NO_COLOR 时自动关闭） */
let colorEnabled: boolean = !(process.env.NO_COLOR !== undefined);

/** 检测是否处于非 TTY 环境（例如被重定向到文件） */
function isNonTty(): boolean {
  return !!(process.stdout && !process.stdout.isTTY);
}

if (isNonTty()) {
  colorEnabled = false;
}

/** 切换颜色开关 */
export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

/** 查询当前颜色开关状态 */
export function isColorEnabled(): boolean {
  return colorEnabled;
}

/**
 * 包装一段文本，应用给定的 ANSI 前缀，并自动在结尾追加 reset。
 * 当颜色被禁用时，原样返回输入文本。
 */
export function colorize(prefix: string, text: string): string {
  if (!colorEnabled) return text;
  return `${prefix}${text}${RESET}`;
}

/** 各语义化颜色的快捷封装（禁用颜色时返回原文本） */
export const color = {
  title: (text: string): string => colorize(BOLD_CYAN, text),
  item: (text: string): string => colorize(WHITE, text),
  highlight: (text: string): string => colorize(HIGHLIGHT_YELLOW, text),
  success: (text: string): string => colorize(SUCCESS_GREEN, text),
  warn: (text: string): string => colorize(WARN_YELLOW, text),
  error: (text: string): string => colorize(ERROR_RED, text),
  muted: (text: string): string => colorize(MUTED_GRAY, text),
};

/** 用于单元测试：返回颜色常量本身（不受开关影响） */
export const raw = {
  RESET,
  BOLD_CYAN,
  WHITE,
  HIGHLIGHT_YELLOW,
  SUCCESS_GREEN,
  WARN_YELLOW,
  ERROR_RED,
  MUTED_GRAY,
} as const;
