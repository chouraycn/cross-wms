import { describe, it, expect } from 'vitest';
import {
  LogLevel,
  parseLogLevel,
  compareLogLevels,
  shouldLog,
  levelToString,
} from '../levels.js';
import { isValidTimeZone, formatLocalDate } from '../timestamps.js';
import {
  redactSensitiveText,
  redactObject,
  addRedactPattern,
  getDefaultRedactPatterns,
} from '../redact.js';
import { parseLogLine, isJsonLogLine } from '../parse-log-line.js';

describe('logging > levels', () => {
  it('parses log levels', () => {
    expect(parseLogLevel('debug')).toBe(LogLevel.Debug);
    expect(parseLogLevel('warning')).toBe(LogLevel.Warn);
    expect(parseLogLevel('off')).toBe(LogLevel.Silent);
    expect(parseLogLevel(undefined)).toBe(LogLevel.Info);
    expect(parseLogLevel('unknown')).toBe(LogLevel.Info);
  });

  it('compares log levels', () => {
    expect(compareLogLevels(LogLevel.Error, LogLevel.Info)).toBeGreaterThan(0);
    expect(compareLogLevels(LogLevel.Debug, LogLevel.Info)).toBeLessThan(0);
    expect(compareLogLevels(LogLevel.Info, LogLevel.Info)).toBe(0);
  });

  it('checks whether a level should be logged', () => {
    expect(shouldLog(LogLevel.Error, LogLevel.Warn)).toBe(true);
    expect(shouldLog(LogLevel.Debug, LogLevel.Info)).toBe(false);
  });

  it('converts levels to strings', () => {
    expect(levelToString(LogLevel.Trace)).toBe('trace');
    expect(levelToString(LogLevel.Fatal)).toBe('fatal');
  });
});

describe('logging > timestamps', () => {
  it('validates known timezones', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true);
    expect(isValidTimeZone('Mars/Colony')).toBe(false);
  });

  it('formats local date', () => {
    const date = new Date('2026-07-17T12:00:00.000Z');
    const formatted = formatLocalDate(date);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(formatted)).toBe(true);
  });
});

describe('logging > redact', () => {
  it('redacts API keys', () => {
    const text = 'api_key=abc123def456ghi789jkl012mno345pqr678';
    expect(redactSensitiveText(text)).toContain('<redacted>');
  });

  it('redacts bearer tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    expect(redactSensitiveText(text)).toContain('Bearer <redacted>');
  });

  it('redacts sensitive object values', () => {
    const obj = { user: 'alice', apiKey: 'super-secret-token-12345', nested: { password: 'pwd' } };
    const redacted = redactObject(obj);
    expect(redacted.apiKey).toBe('<redacted>');
    expect(redacted.nested.password).toBe('<redacted>');
    expect(redacted.user).toBe('alice');
  });

  it('supports custom patterns', () => {
    addRedactPattern(/order-\d+/g, 'order-<redacted>');
    expect(redactSensitiveText('order-12345 placed')).toContain('order-<redacted>');
  });

  it('exposes default patterns', () => {
    expect(getDefaultRedactPatterns().length).toBeGreaterThan(0);
  });
});

describe('logging > parse-log-line', () => {
  it('parses JSON log lines', () => {
    const line = JSON.stringify({
      time: '2026-07-17T12:00:00.000Z',
      level: 'info',
      msg: 'hello world',
      _meta: { logLevelName: 'INFO', name: '{"subsystem":"engine","module":"test"}' },
    });
    const parsed = parseLogLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.message).toBe('hello world');
    expect(parsed!.subsystem).toBe('engine');
    expect(parsed!.module).toBe('test');
    expect(parsed!.level).toBe('info');
  });

  it('returns null for invalid lines', () => {
    expect(parseLogLine('')).toBeNull();
    expect(parseLogLine('not json')).toBeNull();
  });

  it('detects JSON log lines', () => {
    expect(isJsonLogLine('{"level":"info"}')).toBe(true);
    expect(isJsonLogLine('plain text')).toBe(false);
  });
});
