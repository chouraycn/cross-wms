import { describe, expect, it, beforeEach } from 'vitest';
import { TuiInputHistory, parseCommand, isSlashCommand } from '../tui-input-history.js';

describe('TuiInputHistory', () => {
  let history: TuiInputHistory;

  beforeEach(() => {
    history = new TuiInputHistory();
  });

  it('starts empty', () => {
    expect(history.size()).toBe(0);
    expect(history.getIndex()).toBe(-1);
  });

  it('adds entries to history', () => {
    history.add('hello');
    expect(history.size()).toBe(1);
    expect(history.getHistory()).toEqual(['hello']);
  });

  it('trims entries before adding', () => {
    history.add('  hello world  ');
    expect(history.getHistory()).toEqual(['hello world']);
  });

  it('does not add empty entries', () => {
    history.add('');
    expect(history.size()).toBe(0);
    history.add('   ');
    expect(history.size()).toBe(0);
  });

  it('does not add duplicate consecutive entries', () => {
    history.add('hello');
    history.add('hello');
    expect(history.size()).toBe(1);
  });

  it('allows non-consecutive duplicates', () => {
    history.add('hello');
    history.add('world');
    history.add('hello');
    expect(history.size()).toBe(3);
  });

  it('navigates previous entries', () => {
    history.add('first');
    history.add('second');
    history.add('third');

    const prev1 = history.getPrevious('');
    expect(prev1).toBe('third');

    const prev2 = history.getPrevious('');
    expect(prev2).toBe('second');

    const prev3 = history.getPrevious('');
    expect(prev3).toBe('first');
  });

  it('returns null when no previous entry exists', () => {
    const prev = history.getPrevious('');
    expect(prev).toBeNull();
  });

  it('navigates next entries', () => {
    history.add('first');
    history.add('second');

    history.getPrevious('');
    history.getPrevious('');

    const next1 = history.getNext();
    expect(next1).toBe('second');

    const next2 = history.getNext();
    expect(next2).toBe('');
  });

  it('returns null for next when at bottom', () => {
    history.add('test');
    const next = history.getNext();
    expect(next).toBeNull();
  });

  it('saves current draft when going back', () => {
    history.add('previous');
    const draft = 'my draft';
    history.getPrevious(draft);
    const next = history.getNext();
    expect(next).toBe(draft);
  });

  it('resets history position', () => {
    history.add('first');
    history.add('second');
    history.getPrevious('');
    history.getPrevious('');
    expect(history.getIndex()).toBe(0);

    history.reset();
    expect(history.getIndex()).toBe(-1);
  });

  it('clears all history', () => {
    history.add('first');
    history.add('second');
    history.clear();
    expect(history.size()).toBe(0);
    expect(history.getIndex()).toBe(-1);
  });

  it('respects max size limit', () => {
    history = new TuiInputHistory(3);
    history.add('1');
    history.add('2');
    history.add('3');
    history.add('4');
    expect(history.size()).toBe(3);
    expect(history.getHistory()).toEqual(['2', '3', '4']);
  });

  it('can change max size', () => {
    history.add('1');
    history.add('2');
    history.add('3');
    history.setMaxSize(2);
    expect(history.size()).toBe(2);
    expect(history.getHistory()).toEqual(['2', '3']);
  });
});

describe('parseCommand', () => {
  it('parses simple commands', () => {
    const result = parseCommand('/help');
    expect(result).toEqual({ command: '/help', args: [] });
  });

  it('parses commands with arguments', () => {
    const result = parseCommand('/theme light');
    expect(result).toEqual({ command: '/theme', args: ['light'] });
  });

  it('parses commands with multiple arguments', () => {
    const result = parseCommand('/set key value other');
    expect(result).toEqual({ command: '/set', args: ['key', 'value', 'other'] });
  });

  it('returns null for non-commands', () => {
    expect(parseCommand('hello')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });

  it('handles leading whitespace', () => {
    const result = parseCommand('  /help  ');
    expect(result).toEqual({ command: '/help', args: [] });
  });
});

describe('isSlashCommand', () => {
  it('returns true for slash commands', () => {
    expect(isSlashCommand('/help')).toBe(true);
    expect(isSlashCommand('/theme light')).toBe(true);
  });

  it('returns false for non-commands', () => {
    expect(isSlashCommand('hello')).toBe(false);
    expect(isSlashCommand('')).toBe(false);
  });

  it('handles leading whitespace', () => {
    expect(isSlashCommand('  /help')).toBe(true);
  });
});
