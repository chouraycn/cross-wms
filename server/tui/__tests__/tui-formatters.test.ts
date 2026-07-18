import { describe, expect, it } from 'vitest';
import {
  sanitizeRenderableText,
  resolveFinalAssistantText,
  composeThinkingAndContent,
  extractThinkingFromMessage,
  extractContentFromMessage,
  isCommandMessage,
  formatTimestamp,
  formatDuration,
  truncateText,
  wordWrap,
  indentText,
} from '../tui-formatters.js';

describe('sanitizeRenderableText', () => {
  it('returns empty string', () => {
    expect(sanitizeRenderableText('')).toBe('');
  });

  it('passes through normal text', () => {
    expect(sanitizeRenderableText('Hello world')).toBe('Hello world');
  });

  it('strips ANSI escape codes', () => {
    const ansiText = '\x1b[31mRed text\x1b[0m';
    const result = sanitizeRenderableText(ansiText);
    expect(result).toBe('Red text');
  });

  it('strips control characters', () => {
    const textWithControl = 'Hello\x00World\x01Test';
    const result = sanitizeRenderableText(textWithControl);
    expect(result).toBe('HelloWorldTest');
  });

  it('preserves newlines and tabs', () => {
    const text = 'Hello\nWorld\tTab';
    expect(sanitizeRenderableText(text)).toBe(text);
  });

  it('handles binary-like content', () => {
    const binaryLine = '\uFFFD'.repeat(20);
    const result = sanitizeRenderableText(binaryLine);
    expect(result).toBe('[binary data omitted]');
  });

  it('breaks long tokens in prose but preserves paths/urls', () => {
    const longUrl = 'https://example.com/very/long/path/that/is/very/long/indeed/much/longer';
    const result = sanitizeRenderableText(longUrl);
    expect(result).toBe(longUrl);
  });
});

describe('resolveFinalAssistantText', () => {
  it('uses final text when available', () => {
    expect(resolveFinalAssistantText({ finalText: 'Final answer' })).toBe('Final answer');
  });

  it('falls back to streamed text', () => {
    expect(resolveFinalAssistantText({ finalText: '', streamedText: 'Streamed' })).toBe('Streamed');
  });

  it('falls back to error message', () => {
    const result = resolveFinalAssistantText({ finalText: '', streamedText: '', errorMessage: 'Oops' });
    expect(result).toContain('Oops');
  });

  it('returns no output for empty', () => {
    expect(resolveFinalAssistantText({})).toBe('(no output)');
  });

  it('handles null values', () => {
    expect(resolveFinalAssistantText({ finalText: null, streamedText: null, errorMessage: null })).toBe('(no output)');
  });
});

describe('composeThinkingAndContent', () => {
  it('includes thinking when showThinking is true', () => {
    const result = composeThinkingAndContent({
      thinkingText: 'Thinking...',
      contentText: 'Answer',
      showThinking: true,
    });
    expect(result).toContain('[thinking]');
    expect(result).toContain('Thinking...');
    expect(result).toContain('Answer');
  });

  it('hides thinking when showThinking is false', () => {
    const result = composeThinkingAndContent({
      thinkingText: 'Thinking...',
      contentText: 'Answer',
      showThinking: false,
    });
    expect(result).not.toContain('[thinking]');
    expect(result).toBe('Answer');
  });

  it('handles only thinking', () => {
    const result = composeThinkingAndContent({
      thinkingText: 'Thinking...',
      showThinking: true,
    });
    expect(result).toContain('[thinking]');
    expect(result).toContain('Thinking...');
  });

  it('handles only content', () => {
    const result = composeThinkingAndContent({
      contentText: 'Answer',
    });
    expect(result).toBe('Answer');
  });

  it('returns empty string for nothing', () => {
    expect(composeThinkingAndContent({})).toBe('');
  });
});

describe('extractThinkingFromMessage', () => {
  it('extracts thinking from array content', () => {
    const message = {
      content: [
        { type: 'thinking', thinking: 'Let me think' },
        { type: 'text', text: 'Hello' },
      ],
    };
    expect(extractThinkingFromMessage(message)).toBe('Let me think');
  });

  it('returns empty string for string content', () => {
    const message = { content: 'Hello' };
    expect(extractThinkingFromMessage(message)).toBe('');
  });

  it('returns empty for null/undefined', () => {
    expect(extractThinkingFromMessage(null)).toBe('');
    expect(extractThinkingFromMessage(undefined)).toBe('');
  });
});

describe('extractContentFromMessage', () => {
  it('extracts string content', () => {
    const message = { role: 'assistant', content: 'Hello' };
    expect(extractContentFromMessage(message)).toBe('Hello');
  });

  it('extracts text from array content', () => {
    const message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ],
    };
    expect(extractContentFromMessage(message)).toBe('Hello\nWorld');
  });

  it('returns empty for non-messages', () => {
    expect(extractContentFromMessage(null)).toBe('');
    expect(extractContentFromMessage(undefined)).toBe('');
  });
});

describe('isCommandMessage', () => {
  it('returns true for command messages', () => {
    expect(isCommandMessage({ command: true })).toBe(true);
  });

  it('returns false for non-command messages', () => {
    expect(isCommandMessage({ command: false })).toBe(false);
    expect(isCommandMessage({})).toBe(false);
    expect(isCommandMessage(null)).toBe(false);
  });
});

describe('formatTimestamp', () => {
  it('formats timestamp as HH:MM', () => {
    const date = new Date(2024, 0, 1, 14, 30, 0);
    const result = formatTimestamp(date.getTime());
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });
});

describe('truncateText', () => {
  it('does not truncate short text', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
  });

  it('truncates long text', () => {
    expect(truncateText('Hello world', 8)).toBe('Hello...');
  });

  it('handles exact length', () => {
    expect(truncateText('Hello', 5)).toBe('Hello');
  });
});

describe('wordWrap', () => {
  it('wraps text to specified width', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const result = wordWrap(text, 20);
    expect(result.length).toBeGreaterThan(1);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  it('preserves newlines', () => {
    const text = 'Line 1\nLine 2\nLine 3';
    const result = wordWrap(text, 80);
    expect(result.length).toBe(3);
  });

  it('handles empty string', () => {
    expect(wordWrap('', 80)).toEqual(['']);
  });
});

describe('indentText', () => {
  it('indents lines with spaces', () => {
    const lines = ['Hello', 'World'];
    const result = indentText(lines, 2);
    expect(result).toEqual(['  Hello', '  World']);
  });

  it('does not indent empty lines', () => {
    const lines = ['Hello', '', 'World'];
    const result = indentText(lines, 2);
    expect(result[1]).toBe('');
  });
});
