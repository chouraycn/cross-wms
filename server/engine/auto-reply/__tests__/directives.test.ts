import { describe, it, expect } from 'vitest';
import {
  extractThinkDirective,
  extractVerboseDirective,
  extractTraceDirective,
  extractElevatedDirective,
  extractReasoningDirective,
  extractStatusDirective,
  extractFastDirective,
} from '../directives.js';

describe('directives', () => {
  describe('extractThinkDirective', () => {
    it('returns empty result for empty body', () => {
      expect(extractThinkDirective('')).toEqual({ cleaned: '', hasDirective: false });
      expect(extractThinkDirective(undefined)).toEqual({ cleaned: '', hasDirective: false });
    });

    it('detects /thinking with explicit level', () => {
      const result = extractThinkDirective('/thinking:high hello world');
      expect(result.hasDirective).toBe(true);
      expect(result.level).toBe('high');
      expect(result.rawLevel).toBe('high');
      expect(result.cleaned).toBe('hello world');
    });

    it('defaults to medium when no level argument is provided (bare directive)', () => {
      const result = extractThinkDirective('/thinking');
      expect(result.hasDirective).toBe(true);
      expect(result.level).toBe('medium');
      expect(result.rawLevel).toBeUndefined();
    });

    it('defaults to medium when level after colon is empty', () => {
      const result = extractThinkDirective('/thinking:');
      expect(result.hasDirective).toBe(true);
      expect(result.level).toBe('medium');
      expect(result.cleaned).toBe('');
    });

    it('captures a trailing word as rawLevel and returns undefined level when not valid', () => {
      const result = extractThinkDirective('/thinking hello');
      expect(result.hasDirective).toBe(true);
      expect(result.rawLevel).toBe('hello');
      expect(result.level).toBeUndefined();
      expect(result.cleaned).toBe('');
    });

    it('returns undefined level when value is not a known level', () => {
      const result = extractThinkDirective('/thinking:bogus payload');
      expect(result.hasDirective).toBe(true);
      expect(result.level).toBeUndefined();
      expect(result.rawLevel).toBe('bogus');
    });

    it('accepts short alias /t', () => {
      const result = extractThinkDirective('/t:low payload');
      expect(result.hasDirective).toBe(true);
      expect(result.level).toBe('low');
      expect(result.cleaned).toBe('payload');
    });
  });

  describe('extractVerboseDirective', () => {
    it('defaults to on when bare directive is used', () => {
      const result = extractVerboseDirective('/v');
      expect(result.hasDirective).toBe(true);
      expect(result.level).toBe('on');
    });

    it('maps true to on', () => {
      expect(extractVerboseDirective('/verbose:true text').level).toBe('on');
    });

    it('maps false to off', () => {
      expect(extractVerboseDirective('/verbose:false text').level).toBe('off');
    });

    it('returns undefined level for unknown word value', () => {
      const result = extractVerboseDirective('/verbose:banana text');
      expect(result.hasDirective).toBe(true);
      expect(result.level).toBeUndefined();
    });
  });

  describe('extractTraceDirective', () => {
    it('defaults to on when bare directive is used', () => {
      expect(extractTraceDirective('/trace').level).toBe('on');
    });

    it('accepts detailed level', () => {
      expect(extractTraceDirective('/trace:detailed hi').level).toBe('detailed');
    });

    it('accepts off level', () => {
      expect(extractTraceDirective('/trace:off hi').level).toBe('off');
    });

    it('returns undefined level for unknown word value', () => {
      expect(extractTraceDirective('/trace hello').level).toBeUndefined();
    });
  });

  describe('extractElevatedDirective', () => {
    it('defaults to on when bare directive is used', () => {
      expect(extractElevatedDirective('/elevated').level).toBe('on');
    });

    it('accepts /elev alias', () => {
      expect(extractElevatedDirective('/elev:off hi').level).toBe('off');
    });

    it('returns undefined for unknown level', () => {
      expect(extractElevatedDirective('/elevated:maybe hi').level).toBeUndefined();
    });
  });

  describe('extractReasoningDirective', () => {
    it('defaults to medium when bare directive is used', () => {
      expect(extractReasoningDirective('/reasoning').level).toBe('medium');
    });

    it('accepts /reason alias', () => {
      expect(extractReasoningDirective('/reason:high hi').level).toBe('high');
    });

    it('accepts max level', () => {
      expect(extractReasoningDirective('/reasoning:max hi').level).toBe('max');
    });

    it('returns undefined for unknown level', () => {
      expect(extractReasoningDirective('/reasoning:ultra hi').level).toBeUndefined();
    });
  });

  describe('extractStatusDirective', () => {
    it('detects bare /status', () => {
      const result = extractStatusDirective('/status hello');
      expect(result.hasDirective).toBe(true);
      expect(result.cleaned).toBe('hello');
    });

    it('detects /status: variant', () => {
      const result = extractStatusDirective('/status: hello');
      expect(result.hasDirective).toBe(true);
      expect(result.cleaned).toBe('hello');
    });

    it('returns false when no status directive is present', () => {
      const result = extractStatusDirective('just text');
      expect(result.hasDirective).toBe(false);
      expect(result.cleaned).toBe('just text');
    });
  });

  describe('extractFastDirective', () => {
    it('defaults to fast when bare directive is used', () => {
      expect(extractFastDirective('/fast').level).toBe('fast');
    });

    it('accepts faster level', () => {
      expect(extractFastDirective('/fast:faster hi').level).toBe('faster');
    });

    it('accepts off level', () => {
      expect(extractFastDirective('/fast:off hi').level).toBe('off');
    });

    it('returns undefined for unknown level', () => {
      expect(extractFastDirective('/fast:lightning hi').level).toBeUndefined();
    });
  });
});
