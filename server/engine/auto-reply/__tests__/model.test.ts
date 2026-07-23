import { describe, it, expect } from 'vitest';
import { extractModelDirective } from '../model.js';

describe('model', () => {
  describe('extractModelDirective', () => {
    it('returns empty result for empty body', () => {
      expect(extractModelDirective('')).toEqual({ cleaned: '', hasDirective: false });
      expect(extractModelDirective(undefined)).toEqual({ cleaned: '', hasDirective: false });
    });

    it('returns hasDirective false when no /model directive is present', () => {
      const result = extractModelDirective('hello world');
      expect(result.hasDirective).toBe(false);
      expect(result.cleaned).toBe('hello world');
      expect(result.rawModel).toBeUndefined();
      expect(result.rawProfile).toBeUndefined();
      expect(result.rawRuntime).toBeUndefined();
    });

    it('parses /model:name and strips the directive from the cleaned text', () => {
      const result = extractModelDirective('/model:gpt-4 hello');
      expect(result.hasDirective).toBe(true);
      expect(result.rawModel).toBe('gpt-4');
      expect(result.rawProfile).toBeUndefined();
      expect(result.rawRuntime).toBeUndefined();
      expect(result.cleaned).toBe('hello');
    });

    it('accepts space-separated form /model name', () => {
      const result = extractModelDirective('/model gpt-4 hello');
      expect(result.hasDirective).toBe(true);
      expect(result.rawModel).toBe('gpt-4');
      expect(result.cleaned).toBe('hello');
    });

    it('parses the @profile suffix into rawProfile', () => {
      const result = extractModelDirective('/model:claude-3@anthropic hello');
      expect(result.hasDirective).toBe(true);
      expect(result.rawModel).toBe('claude-3');
      expect(result.rawProfile).toBe('anthropic');
      expect(result.cleaned).toBe('hello');
    });

    it('parses the runtime argument via --runtime', () => {
      const result = extractModelDirective('/model:gpt-4 --runtime node hello');
      expect(result.hasDirective).toBe(true);
      expect(result.rawModel).toBe('gpt-4');
      expect(result.rawRuntime).toBe('node');
      expect(result.cleaned).toBe('hello');
    });

    it('parses the runtime argument via runtime=', () => {
      const result = extractModelDirective('/model:gpt-4 runtime=deno hello');
      expect(result.hasDirective).toBe(true);
      expect(result.rawRuntime).toBe('deno');
    });

    it('parses the runtime argument via harness=', () => {
      const result = extractModelDirective('/model:gpt-4 harness=bun hello');
      expect(result.rawRuntime).toBe('bun');
    });

    it('returns hasDirective true with no rawModel when /model is bare (end of string)', () => {
      const result = extractModelDirective('/model');
      expect(result.hasDirective).toBe(true);
      expect(result.rawModel).toBeUndefined();
      expect(result.rawProfile).toBeUndefined();
      expect(result.rawRuntime).toBeUndefined();
      expect(result.cleaned).toBe('');
    });

    it('detects directive mid-sentence (preceded by whitespace)', () => {
      const result = extractModelDirective('hi /model:gpt-4 there');
      expect(result.hasDirective).toBe(true);
      expect(result.rawModel).toBe('gpt-4');
      expect(result.cleaned).toBe('hi there');
    });

    it('does not match /models (plural) as /model directive', () => {
      const result = extractModelDirective('/models list');
      expect(result.hasDirective).toBe(false);
      expect(result.cleaned).toBe('/models list');
    });

    it('uses aliases when provided and /model is not present', () => {
      const result = extractModelDirective('/llama hello', { aliases: ['llama'] });
      expect(result.hasDirective).toBe(true);
      expect(result.rawModel).toBe('llama');
      expect(result.cleaned).toBe('hello');
    });

    it('prefers /model over aliases when both could match', () => {
      const result = extractModelDirective('/model:gpt-4 hello', { aliases: ['llama'] });
      expect(result.hasDirective).toBe(true);
      expect(result.rawModel).toBe('gpt-4');
    });

    it('ignores aliases when no alias matches', () => {
      const result = extractModelDirective('/unknown hello', { aliases: ['llama'] });
      expect(result.hasDirective).toBe(false);
      expect(result.cleaned).toBe('/unknown hello');
    });

    it('handles model names containing slashes', () => {
      const result = extractModelDirective('/model:org/model-name hello');
      expect(result.hasDirective).toBe(true);
      expect(result.rawModel).toBe('org/model-name');
    });
  });
});
