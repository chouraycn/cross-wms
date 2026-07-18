import { describe, it, expect } from 'vitest';
import {
  parseDirectives,
  hasDirective,
  extractAllDirectiveNames,
  normalizeThinkLevel,
  normalizeVerboseLevel,
  normalizeTraceLevel,
  normalizeFastMode,
} from '../directive-handling.js';

describe('directive-handling', () => {
  describe('parseDirectives', () => {
    it('should parse think directive', () => {
      const result = parseDirectives('/think:high hello world');
      expect(result.levels.think).toBe('high');
      expect(result.cleanedText).toBe('hello world');
      expect(result.hasDirectives).toBe(true);
      expect(result.rawDirectives).toContain('/think:high');
    });

    it('should parse verbose directive', () => {
      const result = parseDirectives('/verbose:on test');
      expect(result.levels.verbose).toBe('on');
      expect(result.cleanedText).toBe('test');
    });

    it('should parse trace directive', () => {
      const result = parseDirectives('/trace:detailed test');
      expect(result.levels.trace).toBe('detailed');
      expect(result.cleanedText).toBe('test');
    });

    it('should parse model directive', () => {
      const result = parseDirectives('/model:gpt-4 hello');
      expect(result.model.model).toBe('gpt-4');
      expect(result.cleanedText).toBe('hello');
    });

    it('should parse exec directive', () => {
      const result = parseDirectives('/exec:ls -la');
      expect(result.exec.requested).toBe(true);
      expect(result.exec.command).toBe('ls -la');
      expect(result.cleanedText).toBe('');
    });

    it('should parse exec directive with trailing text', () => {
      const result = parseDirectives('hello /exec:ls -la world');
      expect(result.exec.requested).toBe(true);
      expect(result.exec.command).toBe('ls -la world');
      expect(result.cleanedText).toBe('hello');
    });

    it('should parse queue directive', () => {
      const result = parseDirectives('/queue:serial test');
      expect(result.queueMode).toBe('serial');
      expect(result.cleanedText).toBe('test');
    });

    it('should parse multiple directives', () => {
      const result = parseDirectives('/think:high /verbose:on /model:gpt-4 hello');
      expect(result.levels.think).toBe('high');
      expect(result.levels.verbose).toBe('on');
      expect(result.model.model).toBe('gpt-4');
      expect(result.cleanedText).toBe('hello');
      expect(result.rawDirectives.length).toBe(3);
    });

    it('should handle no directives', () => {
      const result = parseDirectives('hello world');
      expect(result.hasDirectives).toBe(false);
      expect(result.cleanedText).toBe('hello world');
      expect(result.rawDirectives).toEqual([]);
    });

    it('should parse fast directive', () => {
      const result = parseDirectives('/fast:faster test');
      expect(result.levels.fast).toBe('faster');
      expect(result.cleanedText).toBe('test');
    });

    it('should parse elevated directive', () => {
      const result = parseDirectives('/elevated:on test');
      expect(result.levels.elevated).toBe('on');
      expect(result.cleanedText).toBe('test');
    });

    it('should parse reasoning directive', () => {
      const result = parseDirectives('/reasoning:high test');
      expect(result.levels.reasoning).toBe('high');
      expect(result.cleanedText).toBe('test');
    });
  });

  describe('hasDirective', () => {
    it('should return true when directive exists', () => {
      expect(hasDirective('/think hello', 'think')).toBe(true);
      expect(hasDirective('hello /model:gpt-4', 'model')).toBe(true);
    });

    it('should return false when directive does not exist', () => {
      expect(hasDirective('hello world', 'think')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(hasDirective('/Think hello', 'think')).toBe(true);
    });
  });

  describe('extractAllDirectiveNames', () => {
    it('should extract all directive names', () => {
      const result = extractAllDirectiveNames('/think /verbose:on /model:gpt-4 hello');
      expect(result).toContain('think');
      expect(result).toContain('verbose');
      expect(result).toContain('model');
    });

    it('should return empty array for no directives', () => {
      expect(extractAllDirectiveNames('hello world')).toEqual([]);
    });
  });

  describe('normalizeThinkLevel', () => {
    it('should default to medium', () => {
      expect(normalizeThinkLevel()).toBe('medium');
    });

    it('should normalize valid levels', () => {
      expect(normalizeThinkLevel('off')).toBe('off');
      expect(normalizeThinkLevel('minimal')).toBe('minimal');
      expect(normalizeThinkLevel('high')).toBe('high');
      expect(normalizeThinkLevel('max')).toBe('max');
    });

    it('should return undefined for invalid levels', () => {
      expect(normalizeThinkLevel('invalid')).toBeUndefined();
    });
  });

  describe('normalizeVerboseLevel', () => {
    it('should default to on', () => {
      expect(normalizeVerboseLevel()).toBe('on');
    });

    it('should normalize valid values', () => {
      expect(normalizeVerboseLevel('on')).toBe('on');
      expect(normalizeVerboseLevel('off')).toBe('off');
      expect(normalizeVerboseLevel('true')).toBe('on');
      expect(normalizeVerboseLevel('false')).toBe('off');
    });

    it('should return undefined for invalid values', () => {
      expect(normalizeVerboseLevel('invalid')).toBeUndefined();
    });
  });

  describe('normalizeTraceLevel', () => {
    it('should default to on', () => {
      expect(normalizeTraceLevel()).toBe('on');
    });

    it('should normalize valid values', () => {
      expect(normalizeTraceLevel('on')).toBe('on');
      expect(normalizeTraceLevel('off')).toBe('off');
      expect(normalizeTraceLevel('detailed')).toBe('detailed');
    });

    it('should return undefined for invalid values', () => {
      expect(normalizeTraceLevel('invalid')).toBeUndefined();
    });
  });

  describe('normalizeFastMode', () => {
    it('should default to fast', () => {
      expect(normalizeFastMode()).toBe('fast');
    });

    it('should normalize valid values', () => {
      expect(normalizeFastMode('fast')).toBe('fast');
      expect(normalizeFastMode('faster')).toBe('faster');
      expect(normalizeFastMode('off')).toBe('off');
    });

    it('should return undefined for invalid values', () => {
      expect(normalizeFastMode('invalid')).toBeUndefined();
    });
  });
});
