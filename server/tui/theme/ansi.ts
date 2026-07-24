export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strike: '\x1b[9m',

  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  grey: '\x1b[90m',

  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  cursorUp: '\x1b[A',
  cursorDown: '\x1b[B',
  cursorRight: '\x1b[1C',
  cursorLeft: '\x1b[1D',
  cursorHome: '\x1b[H',
  cursorSave: '\x1b[s',
  cursorRestore: '\x1b[u',
  eraseLine: '\x1b[2K',
  eraseScreen: '\x1b[2J',
} as const;

export type ANSIColor = keyof typeof ANSI;

export function colorize(text: string, color: string): string {
  const code = (ANSI as Record<string, string>)[color];
  if (!code) return text;
  return code + text + ANSI.reset;
}

export function bold(text: string): string {
  return ANSI.bold + text + ANSI.reset;
}

export function dim(text: string): string {
  return ANSI.dim + text + ANSI.reset;
}

export function italic(text: string): string {
  return ANSI.italic + text + ANSI.reset;
}

export function underline(text: string): string {
  return ANSI.underline + text + ANSI.reset;
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

export function hasAnsi(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /\x1b\[[0-9;]*[a-zA-Z]/.test(text);
}
