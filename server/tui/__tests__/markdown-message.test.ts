import { describe, expect, it } from 'vitest';
import { renderMarkdown, MarkdownMessage } from '../components/markdown-message.js';
import { markdownTheme } from '../theme/theme.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;.*?\x07/g, '').replace(/\x1b\]8;;\x07/g, '');
}

describe('renderMarkdown', () => {
  it('renders plain text', () => {
    const lines = renderMarkdown('Hello world', { theme: markdownTheme, width: 80 });
    expect(lines.length).toBeGreaterThan(0);
    expect(stripAnsi(lines.join('\n'))).toContain('Hello world');
  });

  it('renders headings', () => {
    const lines = renderMarkdown('# Heading 1\n\n## Heading 2', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Heading 1');
    expect(text).toContain('Heading 2');
  });

  it('renders bold text', () => {
    const lines = renderMarkdown('This is **bold** text', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('bold');
  });

  it('renders italic text', () => {
    const lines = renderMarkdown('This is *italic* text', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('italic');
  });

  it('renders inline code', () => {
    const lines = renderMarkdown('Use `code` here', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('code');
  });

  it('renders links', () => {
    const lines = renderMarkdown('[link](https://example.com)', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('link');
  });

  it('renders blockquotes', () => {
    const lines = renderMarkdown('> This is a quote', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('This is a quote');
  });

  it('renders unordered lists', () => {
    const lines = renderMarkdown('- Item 1\n- Item 2\n- Item 3', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Item 1');
    expect(text).toContain('Item 2');
    expect(text).toContain('Item 3');
  });

  it('renders ordered lists', () => {
    const lines = renderMarkdown('1. First\n2. Second\n3. Third', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('First');
    expect(text).toContain('Second');
    expect(text).toContain('Third');
  });

  it('renders code blocks', () => {
    const lines = renderMarkdown('```js\nconst x = 1;\n```', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('const x = 1;');
  });

  it('renders code blocks with language', () => {
    const lines = renderMarkdown('```typescript\nconst x: number = 1;\n```', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('const x: number = 1;');
  });

  it('wraps long lines to width', () => {
    const longText = 'Hello world. '.repeat(20);
    const lines = renderMarkdown(longText, { theme: markdownTheme, width: 50 });
    for (const line of lines) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(60);
    }
  });

  it('handles empty string', () => {
    const lines = renderMarkdown('', { theme: markdownTheme, width: 80 });
    expect(Array.isArray(lines)).toBe(true);
  });

  it('handles multiple paragraphs', () => {
    const lines = renderMarkdown('Para 1\n\nPara 2\n\nPara 3', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Para 1');
    expect(text).toContain('Para 2');
    expect(text).toContain('Para 3');
  });

  it('renders horizontal rule', () => {
    const lines = renderMarkdown('---', { theme: markdownTheme, width: 80 });
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders strikethrough', () => {
    const lines = renderMarkdown('~~strikethrough~~', { theme: markdownTheme, width: 80 });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('strikethrough');
  });
});

describe('MarkdownMessage', () => {
  it('creates instance with text', () => {
    const msg = new MarkdownMessage('Hello', markdownTheme);
    expect(msg.getText()).toBe('Hello');
  });

  it('renders text', () => {
    const msg = new MarkdownMessage('Hello world', markdownTheme);
    const lines = msg.render(80);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('updates text', () => {
    const msg = new MarkdownMessage('Hello', markdownTheme);
    msg.setText('Updated');
    expect(msg.getText()).toBe('Updated');
  });
});
