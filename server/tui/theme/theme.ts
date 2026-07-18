import chalk from 'chalk';
import type { TUIPalette, TUIThemeMode } from '../types.js';

const DARK_TEXT = '#E8E3D5';
const LIGHT_TEXT = '#1E1E1E';
const XTERM_LEVELS = [0, 95, 135, 175, 215, 255] as const;

function channelToSrgb(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminanceRgb(r: number, g: number, b: number): number {
  const red = channelToSrgb(r);
  const green = channelToSrgb(g);
  const blue = channelToSrgb(b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function relativeLuminanceHex(hex: string): number {
  return relativeLuminanceRgb(
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  );
}

function contrastRatio(background: number, foregroundHex: string): number {
  const foreground = relativeLuminanceHex(foregroundHex);
  const lighter = Math.max(background, foreground);
  const darker = Math.min(background, foreground);
  return (lighter + 0.05) / (darker + 0.05);
}

function pickHigherContrastText(r: number, g: number, b: number): boolean {
  const background = relativeLuminanceRgb(r, g, b);
  return contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT);
}

function normalizeLowercaseString(value: string | undefined | null): string {
  if (value == null) {
    return '';
  }
  return String(value).trim().toLowerCase();
}

function isLightBackground(): boolean {
  const explicit = normalizeLowercaseString(process.env.CROSS_WMS_THEME);
  if (explicit === 'light') {
    return true;
  }
  if (explicit === 'dark') {
    return false;
  }

  const colorfgbg = process.env.COLORFGBG;
  if (colorfgbg && colorfgbg.length <= 64) {
    const sep = colorfgbg.lastIndexOf(';');
    const bg = Number.parseInt(sep >= 0 ? colorfgbg.slice(sep + 1) : colorfgbg, 10);
    if (bg >= 0 && bg <= 255) {
      if (bg <= 15) {
        return bg === 7 || bg === 15;
      }
      if (bg >= 232) {
        return bg >= 244;
      }
      const cubeIndex = bg - 16;
      const bVal = XTERM_LEVELS[cubeIndex % 6];
      const gVal = XTERM_LEVELS[Math.floor(cubeIndex / 6) % 6];
      const rVal = XTERM_LEVELS[Math.floor(cubeIndex / 36)];
      return pickHigherContrastText(rVal, gVal, bVal);
    }
  }
  return false;
}

export const lightMode = isLightBackground();

export const darkPalette: TUIPalette = {
  text: '#E8E3D5',
  dim: '#7B7F87',
  accent: '#F6C453',
  accentSoft: '#F2A65A',
  border: '#3C414B',
  userBg: '#2B2F36',
  userText: '#F3EEE0',
  systemText: '#9BA3B2',
  toolPendingBg: '#1F2A2F',
  toolSuccessBg: '#1E2D23',
  toolErrorBg: '#2F1F1F',
  toolTitle: '#F6C453',
  toolOutput: '#E1DACB',
  quote: '#8CC8FF',
  quoteBorder: '#3B4D6B',
  code: '#F0C987',
  codeBlock: '#1E232A',
  codeBorder: '#343A45',
  link: '#7DD3A5',
  error: '#F97066',
  success: '#7DD3A5',
};

export const lightPalette: TUIPalette = {
  text: '#1E1E1E',
  dim: '#5B6472',
  accent: '#B45309',
  accentSoft: '#C2410C',
  border: '#5B6472',
  userBg: '#F3F0E8',
  userText: '#1E1E1E',
  systemText: '#4B5563',
  toolPendingBg: '#EFF6FF',
  toolSuccessBg: '#ECFDF5',
  toolErrorBg: '#FEF2F2',
  toolTitle: '#B45309',
  toolOutput: '#374151',
  quote: '#1D4ED8',
  quoteBorder: '#2563EB',
  code: '#92400E',
  codeBlock: '#F9FAFB',
  codeBorder: '#92400E',
  link: '#047857',
  error: '#DC2626',
  success: '#047857',
};

export function getPalette(mode: TUIThemeMode = 'auto'): TUIPalette {
  if (mode === 'light') return lightPalette;
  if (mode === 'dark') return darkPalette;
  return lightMode ? lightPalette : darkPalette;
}

export const palette = getPalette('auto');

const fg = (hex: string) => (text: string) => chalk.hex(hex)(text);
const bg = (hex: string) => (text: string) => chalk.bgHex(hex)(text);

function highlightCode(code: string): string[] {
  return code.split('\n').map((line) => fg(palette.code)(line));
}

export interface MarkdownTheme {
  heading: (text: string) => string;
  link: (text: string) => string;
  linkUrl: (text: string) => string;
  code: (text: string) => string;
  codeBlock: (text: string) => string;
  codeBlockBorder: (text: string) => string;
  quote: (text: string) => string;
  quoteBorder: (text: string) => string;
  hr: (text: string) => string;
  listBullet: (text: string) => string;
  bold: (text: string) => string;
  italic: (text: string) => string;
  strikethrough: (text: string) => string;
  underline: (text: string) => string;
  highlightCode: (code: string, language?: string) => string[];
}

export interface SelectListTheme {
  selectedPrefix: (text: string) => string;
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
}

export interface SearchableSelectListTheme extends SelectListTheme {
  searchPrompt: (text: string) => string;
  searchInput: (text: string) => string;
  matchHighlight: (text: string) => string;
}

export interface FilterableSelectListTheme extends SelectListTheme {
  filterLabel: (text: string) => string;
}

export interface EditorTheme {
  borderColor: (text: string) => string;
  selectList: SelectListTheme;
}

export const theme = {
  fg: fg(palette.text),
  assistantText: (text: string) => text,
  dim: fg(palette.dim),
  accent: fg(palette.accent),
  accentSoft: fg(palette.accentSoft),
  success: fg(palette.success),
  error: fg(palette.error),
  header: (text: string) => chalk.bold(fg(palette.accent)(text)),
  system: fg(palette.systemText),
  userBg: bg(palette.userBg),
  userText: fg(palette.userText),
  toolTitle: fg(palette.toolTitle),
  toolOutput: fg(palette.toolOutput),
  toolPendingBg: bg(palette.toolPendingBg),
  toolSuccessBg: bg(palette.toolSuccessBg),
  toolErrorBg: bg(palette.toolErrorBg),
  border: fg(palette.border),
  bold: (text: string) => chalk.bold(text),
  italic: (text: string) => chalk.italic(text),
};

export const markdownTheme: MarkdownTheme = {
  heading: (text) => chalk.bold(fg(palette.accent)(text)),
  link: (text) => fg(palette.link)(text),
  linkUrl: (text) => chalk.dim(text),
  code: (text) => fg(palette.code)(text),
  codeBlock: (text) => fg(palette.code)(text),
  codeBlockBorder: (text) => fg(palette.codeBorder)(text),
  quote: (text) => fg(palette.quote)(text),
  quoteBorder: (text) => fg(palette.quoteBorder)(text),
  hr: (text) => fg(palette.border)(text),
  listBullet: (text) => fg(palette.accentSoft)(text),
  bold: (text) => chalk.bold(text),
  italic: (text) => chalk.italic(text),
  strikethrough: (text) => chalk.strikethrough(text),
  underline: (text) => chalk.underline(text),
  highlightCode,
};

const baseSelectListTheme: SelectListTheme = {
  selectedPrefix: (text) => fg(palette.accent)(text),
  selectedText: (text) => chalk.bold(fg(palette.accent)(text)),
  description: (text) => fg(palette.dim)(text),
  scrollInfo: (text) => fg(palette.dim)(text),
  noMatch: (text) => fg(palette.dim)(text),
};

export const selectListTheme: SelectListTheme = baseSelectListTheme;

export const filterableSelectListTheme: FilterableSelectListTheme = {
  ...baseSelectListTheme,
  filterLabel: (text: string) => fg(palette.dim)(text),
};

export const searchableSelectListTheme: SearchableSelectListTheme = {
  ...baseSelectListTheme,
  searchPrompt: (text) => fg(palette.accentSoft)(text),
  searchInput: (text) => fg(palette.text)(text),
  matchHighlight: (text) => chalk.bold(fg(palette.accent)(text)),
};

export const editorTheme: EditorTheme = {
  borderColor: (text) => fg(palette.border)(text),
  selectList: selectListTheme,
};

export function createThemedMarkdownTheme(p: TUIPalette): MarkdownTheme {
  const fgColor = (hex: string) => (text: string) => chalk.hex(hex)(text);
  return {
    heading: (text) => chalk.bold(fgColor(p.accent)(text)),
    link: (text) => fgColor(p.link)(text),
    linkUrl: (text) => chalk.dim(text),
    code: (text) => fgColor(p.code)(text),
    codeBlock: (text) => fgColor(p.code)(text),
    codeBlockBorder: (text) => fgColor(p.codeBorder)(text),
    quote: (text) => fgColor(p.quote)(text),
    quoteBorder: (text) => fgColor(p.quoteBorder)(text),
    hr: (text) => fgColor(p.border)(text),
    listBullet: (text) => fgColor(p.accentSoft)(text),
    bold: (text) => chalk.bold(text),
    italic: (text) => chalk.italic(text),
    strikethrough: (text) => chalk.strikethrough(text),
    underline: (text) => chalk.underline(text),
    highlightCode: (code: string) => code.split('\n').map((line) => fgColor(p.code)(line)),
  };
}
