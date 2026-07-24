import { describe, expect, it, beforeEach } from 'vitest';
import { markdownTheme, darkPalette, lightPalette, getPalette } from '../theme/theme.js';
import type { TUIThemeMode } from '../types.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('theme palettes', () => {
  it('dark palette has required colors', () => {
    expect(darkPalette.text).toBeDefined();
    expect(darkPalette.accent).toBeDefined();
    expect(darkPalette.error).toBeDefined();
    expect(darkPalette.success).toBeDefined();
    expect(darkPalette.code).toBeDefined();
    expect(darkPalette.link).toBeDefined();
  });

  it('light palette has required colors', () => {
    expect(lightPalette.text).toBeDefined();
    expect(lightPalette.accent).toBeDefined();
    expect(lightPalette.error).toBeDefined();
    expect(lightPalette.success).toBeDefined();
    expect(lightPalette.code).toBeDefined();
    expect(lightPalette.link).toBeDefined();
  });

  it('palettes have different colors', () => {
    expect(darkPalette.text).not.toBe(lightPalette.text);
    expect(darkPalette.userBg).not.toBe(lightPalette.userBg);
  });
});

describe('getPalette', () => {
  it('returns dark palette for dark mode', () => {
    const palette = getPalette('dark');
    expect(palette.text).toBe(darkPalette.text);
  });

  it('returns light palette for light mode', () => {
    const palette = getPalette('light');
    expect(palette.text).toBe(lightPalette.text);
  });

  it('returns a palette for auto mode', () => {
    const palette = getPalette('auto');
    expect(palette).toBeDefined();
    expect(palette.text).toBeDefined();
  });
});

describe('markdownTheme', () => {
  it('has all required theme functions', () => {
    expect(typeof markdownTheme.heading).toBe('function');
    expect(typeof markdownTheme.link).toBe('function');
    expect(typeof markdownTheme.code).toBe('function');
    expect(typeof markdownTheme.quote).toBe('function');
    expect(typeof markdownTheme.bold).toBe('function');
    expect(typeof markdownTheme.italic).toBe('function');
    expect(typeof markdownTheme.highlightCode).toBe('function');
  });

  describe('highlightCode', () => {
    it('returns array of lines', () => {
      const result = markdownTheme.highlightCode('line1\nline2', 'javascript');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('preserves code content', () => {
      const code = 'const x = 1;';
      const result = markdownTheme.highlightCode(code, 'javascript');
      expect(stripAnsi(result[0] ?? '')).toBe(code);
    });

    it('handles empty code', () => {
      const result = markdownTheme.highlightCode('', '');
      expect(result).toEqual(['']);
    });
  });

  describe('heading', () => {
    it('returns styled text', () => {
      const result = markdownTheme.heading('Hello');
      expect(stripAnsi(result)).toBe('Hello');
    });
  });

  describe('link', () => {
    it('returns styled text', () => {
      const result = markdownTheme.link('link');
      expect(stripAnsi(result)).toBe('link');
    });
  });

  describe('code', () => {
    it('returns styled text', () => {
      const result = markdownTheme.code('code');
      expect(stripAnsi(result)).toBe('code');
    });
  });

  describe('bold', () => {
    it('returns bold text', () => {
      const result = markdownTheme.bold('bold');
      expect(stripAnsi(result)).toBe('bold');
    });
  });

  describe('italic', () => {
    it('returns italic text', () => {
      const result = markdownTheme.italic('italic');
      expect(stripAnsi(result)).toBe('italic');
    });
  });
});
