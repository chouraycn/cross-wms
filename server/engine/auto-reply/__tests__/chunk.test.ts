import { describe, it, expect } from 'vitest';
import {
  chunkText,
  chunkMarkdownText,
  chunkByNewline,
  chunkTextWithMode,
  resolveTextChunkLimit,
  resolveChunkMode,
} from '../chunk.js';

describe('chunk', () => {
  describe('resolveTextChunkLimit', () => {
    it('returns the configured limit when provided', () => {
      expect(resolveTextChunkLimit(undefined, 1234)).toBe(1234);
    });

    it('falls back to the default chunk limit when no config limit is given', () => {
      expect(resolveTextChunkLimit()).toBe(4000);
      expect(resolveTextChunkLimit('whatever')).toBe(4000);
    });
  });

  describe('resolveChunkMode', () => {
    it('returns the configured mode when provided', () => {
      expect(resolveChunkMode(undefined, 'newline')).toBe('newline');
      expect(resolveChunkMode(undefined, 'length')).toBe('length');
    });

    it('falls back to length mode when no config is given', () => {
      expect(resolveChunkMode()).toBe('length');
      expect(resolveChunkMode('provider')).toBe('length');
    });
  });

  describe('chunkText', () => {
    it('returns a single chunk when text fits within the limit', () => {
      const text = 'short text';
      expect(chunkText(text, 100)).toEqual([text]);
    });

    it('splits at the last newline within the limit when possible', () => {
      const text = 'first line\nsecond line';
      // Use a limit that forces a split after the first newline.
      const chunks = chunkText(text, 11);
      expect(chunks).toEqual(['first line', 'second line']);
    });

    it('splits at the last space within the limit when no newline is available', () => {
      const text = 'alpha beta gamma delta';
      // text length is 23; with limit 16 the last space at or before index 16
      // (the space after "gamma") is used as the break point.
      const chunks = chunkText(text, 16);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe('alpha beta gamma');
      expect(chunks[1]).toBe('delta');
    });

    it('falls back to hard cut when no break opportunity exists', () => {
      const text = 'abcdefghijklmnopqrstuvwxyz';
      const chunks = chunkText(text, 5);
      expect(chunks).toEqual(['abcde', 'fghij', 'klmno', 'pqrst', 'uvwxy', 'z']);
    });

    it('uses default limit of 4000 when no limit is provided', () => {
      const text = 'x'.repeat(4001);
      const chunks = chunkText(text);
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(4000);
      expect(chunks[1]).toBe('x');
    });
  });

  describe('chunkMarkdownText', () => {
    it('returns a single chunk when text fits', () => {
      const text = '# Title\n\nhello';
      expect(chunkMarkdownText(text, 100)).toEqual([text]);
    });

    it('closes an open code fence at the end of a chunk', () => {
      const code = '```js\n' + 'x'.repeat(20) + '\nmore code';
      const chunks = chunkMarkdownText(code, 15);
      // First chunk must end with a closing fence because it was opened.
      expect(chunks[0].endsWith('```')).toBe(true);
    });

    it('reopens a code fence at the start of the next chunk when previous one was left open', () => {
      const code = '```js\n' + 'y'.repeat(30);
      const chunks = chunkMarkdownText(code, 12);
      // Some chunk after the first should start with the fence opener.
      const reopened = chunks.slice(1).some((c) => c.startsWith('```'));
      expect(reopened).toBe(true);
    });
  });

  describe('chunkByNewline', () => {
    it('groups lines up to the limit', () => {
      const text = 'line1\nline2\nline3';
      const chunks = chunkByNewline(text, 12);
      expect(chunks).toEqual(['line1\nline2', 'line3']);
    });

    it('returns a single chunk when all lines fit', () => {
      const text = 'a\nb\nc';
      expect(chunkByNewline(text, 100)).toEqual([text]);
    });

    it('handles a single long line that exceeds the limit by emitting it as its own chunk', () => {
      const text = 'short\n' + 'x'.repeat(20);
      const chunks = chunkByNewline(text, 10);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe('short');
      expect(chunks[1]).toBe('x'.repeat(20));
    });
  });

  describe('chunkTextWithMode', () => {
    it('dispatches to chunkByNewline when mode is newline', () => {
      const text = 'a\nb\nc';
      const result = chunkTextWithMode(text, 'newline', 100);
      expect(result).toEqual([text]);
    });

    it('dispatches to chunkText when mode is length', () => {
      const text = 'aaaa bbbb cccc';
      const result = chunkTextWithMode(text, 'length', 5);
      expect(result.length).toBeGreaterThan(1);
    });

    it('uses resolved limit when limit is omitted', () => {
      const text = 'x'.repeat(4001);
      const result = chunkTextWithMode(text, 'length');
      expect(result.length).toBe(2);
    });
  });
});
