import type { MarkdownTheme } from '../theme/theme.js';
import { wordWrap, indentText } from '../tui-formatters.js';

export interface MarkdownMessageOptions {
  theme: MarkdownTheme;
  width: number;
}

export function renderMarkdown(text: string, options: MarkdownMessageOptions): string[] {
  const { theme, width } = options;
  const lines: string[] = [];
  const paragraphs = text.split(/\n{2,}/);

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      const codeLines = renderCodeBlock(trimmed, theme, width);
      lines.push(...codeLines);
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const headingLines = renderHeading(trimmed, theme, width);
      lines.push(...headingLines);
      lines.push('');
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = renderQuote(trimmed, theme, width);
      lines.push(...quoteLines);
      lines.push('');
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(trimmed)) {
      const listLines = renderList(trimmed, theme, width);
      lines.push(...listLines);
      lines.push('');
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      lines.push(theme.hr('─'.repeat(Math.max(0, width - 2))));
      lines.push('');
      continue;
    }

    const proseLines = renderProse(trimmed, theme, width);
    lines.push(...proseLines);
    lines.push('');
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

function renderHeading(text: string, theme: MarkdownTheme, width: number): string[] {
  const match = text.match(/^(#{1,6})\s+(.+)$/);
  if (!match) {
    return wordWrap(text, width);
  }
  const level = match[1]!.length;
  const content = match[2] ?? '';
  const wrapped = wordWrap(content, width - level - 1);
  return wrapped.map((line, i) => {
    const prefix = i === 0 ? `${'#'.repeat(level)} ` : ' '.repeat(level + 1);
    return theme.heading(prefix + line);
  });
}

function renderCodeBlock(text: string, theme: MarkdownTheme, _width: number): string[] {
  const lines = text.split('\n');
  const result: string[] = [];

  const firstLine = lines[0] ?? '';
  const langMatch = firstLine.match(/^[`~]{3,}\s*(\S+)?/);
  const language = langMatch?.[1] ?? '';

  const codeLines: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^[`~]{3,}\s*$/.test(line)) {
      break;
    }
    codeLines.push(line);
  }

  const highlighted = theme.highlightCode(codeLines.join('\n'), language);
  const border = theme.codeBlockBorder('│');
  const topBorder = theme.codeBlockBorder('┌' + '─'.repeat(language.length > 0 ? language.length + 4 : 2) + '┐');
  const bottomBorder = theme.codeBlockBorder('└' + '─'.repeat(language.length > 0 ? language.length + 4 : 2) + '┘');

  result.push(topBorder);
  if (language) {
    result.push(theme.codeBlockBorder('│ ') + theme.code(language) + theme.codeBlockBorder(' │'));
  }
  for (const line of highlighted) {
    result.push(border + ' ' + line);
  }
  result.push(bottomBorder);

  return result;
}

function renderQuote(text: string, theme: MarkdownTheme, width: number): string[] {
  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const content = line.replace(/^>\s?/, '');
    const wrapped = wordWrap(content, width - 4);
    const border = theme.quoteBorder('│');
    for (const w of wrapped) {
      result.push(border + ' ' + theme.quote(w));
    }
  }

  return result;
}

function renderList(text: string, theme: MarkdownTheme, width: number): string[] {
  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (!match) {
      result.push(...wordWrap(line, width));
      continue;
    }
    const indent = match[1] ?? '';
    const marker = match[2] ?? '';
    const content = match[3] ?? '';
    const bulletWidth = indent.length + marker.length + 1;
    const wrapped = wordWrap(content, width - bulletWidth - 2);
    const bullet = theme.listBullet(indent + marker + ' ');
    for (let i = 0; i < wrapped.length; i++) {
      if (i === 0) {
        result.push(bullet + renderInlineMarkdown(wrapped[i] ?? '', theme));
      } else {
        result.push(' '.repeat(bulletWidth) + renderInlineMarkdown(wrapped[i] ?? '', theme));
      }
    }
  }

  return result;
}

function renderProse(text: string, theme: MarkdownTheme, width: number): string[] {
  const wrapped = wordWrap(text, width);
  return wrapped.map((line) => renderInlineMarkdown(line, theme));
}

function renderInlineMarkdown(text: string, theme: MarkdownTheme): string {
  let result = text;

  result = result.replace(/`([^`]+)`/g, (_, code) => theme.code(code));

  result = result.replace(/\*\*([^*]+)\*\*/g, (_, content) => theme.bold(content));

  result = result.replace(/\*([^*]+)\*/g, (_, content) => theme.italic(content));
  result = result.replace(/_([^_]+)_/g, (_, content) => theme.italic(content));

  result = result.replace(/~~([^~]+)~~/g, (_, content) => theme.strikethrough(content));

  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return theme.link(label) + ' ' + theme.linkUrl(`(${url})`);
  });

  return result;
}

export class MarkdownMessage {
  private text: string;
  private theme: MarkdownTheme;

  constructor(text: string, theme: MarkdownTheme) {
    this.text = text;
    this.theme = theme;
  }

  setText(text: string): void {
    this.text = text;
  }

  render(width: number): string[] {
    return renderMarkdown(this.text, { theme: this.theme, width });
  }

  getText(): string {
    return this.text;
  }
}
