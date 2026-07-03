import type { TuiTheme } from './types.js';

// ANSI 颜色码
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
};

// 暗色主题
const darkTheme: TuiTheme = {
  name: 'dark',
  isDark: true,
  colors: {
    primary: ANSI.cyan,
    secondary: ANSI.blue,
    accent: ANSI.magenta,
    error: ANSI.brightRed,
    warning: ANSI.brightYellow,
    success: ANSI.brightGreen,
    muted: ANSI.gray,
    user: ANSI.brightGreen,
    assistant: ANSI.brightCyan,
    tool: ANSI.brightYellow,
    border: ANSI.gray,
  },
};

// 亮色主题
const lightTheme: TuiTheme = {
  name: 'light',
  isDark: false,
  colors: {
    primary: ANSI.blue,
    secondary: ANSI.cyan,
    accent: ANSI.magenta,
    error: ANSI.red,
    warning: ANSI.yellow,
    success: ANSI.green,
    muted: ANSI.gray,
    user: ANSI.green,
    assistant: ANSI.cyan,
    tool: ANSI.yellow,
    border: ANSI.gray,
  },
};

// 自动检测终端主题
export function detectTheme(): TuiTheme {
  // 检查 COLORFGBG 环境变量（终端前景/背景色）
  const colorfgbg = process.env.COLORFGBG;
  if (colorfgbg) {
    const [, bg] = colorfgbg.split(';');
    const bgNum = parseInt(bg, 10);
    if (!isNaN(bgNum) && bgNum >= 7) {
      return lightTheme;
    }
  }

  // 默认使用暗色主题
  return darkTheme;
}

// 获取主题
export function getTheme(name?: string): TuiTheme {
  if (name === 'light') return lightTheme;
  if (name === 'dark') return darkTheme;
  return detectTheme();
}

// 颜色化文本
export function colorize(text: string, color: string): string {
  return `${color}${text}${ANSI.reset}`;
}

// 加粗
export function bold(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`;
}

// 暗淡
export function dim(text: string): string {
  return `${ANSI.dim}${text}${ANSI.reset}`;
}

// 斜体
export function italic(text: string): string {
  return `${ANSI.italic}${text}${ANSI.reset}`;
}

export { ANSI };
