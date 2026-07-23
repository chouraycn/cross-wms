import { describe, it, expect } from 'vitest';
import {
  ThinkingModeController,
  hasReasoningContent,
  type ThinkingChunk,
} from '../thinking.js';

describe('thinking', () => {
  describe('ThinkingModeController', () => {
    it('defaults to disabled with no level', () => {
      const ctrl = new ThinkingModeController();
      expect(ctrl.isEnabled()).toBe(false);
      expect(ctrl.getLevel()).toBeUndefined();
      expect(ctrl.getReasoningBuffer()).toBe('');
    });

    it('honors constructor options', () => {
      const ctrl = new ThinkingModeController({ enabled: true, level: 'high' });
      expect(ctrl.isEnabled()).toBe(true);
      expect(ctrl.getLevel()).toBe('high');
    });

    it('enable/disable toggles the flag', () => {
      const ctrl = new ThinkingModeController();
      ctrl.enable();
      expect(ctrl.isEnabled()).toBe(true);
      ctrl.disable();
      expect(ctrl.isEnabled()).toBe(false);
    });

    it('setLevel / getLevel round-trips', () => {
      const ctrl = new ThinkingModeController();
      ctrl.setLevel('medium');
      expect(ctrl.getLevel()).toBe('medium');
      ctrl.setLevel(undefined);
      expect(ctrl.getLevel()).toBeUndefined();
    });

    it('parses string chunks as reasoning content', () => {
      const ctrl = new ThinkingModeController({ enabled: true });
      const result = ctrl.parseThinkingContent('thinking about it');
      expect(result.reasoning).toBe('thinking about it');
      expect(result.content).toBeUndefined();
      expect(ctrl.getReasoningBuffer()).toBe('thinking about it');
    });

    it('parses object chunks with reasoning_content and content fields', () => {
      const ctrl = new ThinkingModeController({ enabled: true });
      const result = ctrl.parseThinkingContent({
        reasoning_content: 'why',
        content: 'final answer',
      });
      expect(result.reasoning).toBe('why');
      expect(result.content).toBe('final answer');
      expect(ctrl.getReasoningBuffer()).toBe('why');
    });

    it('falls back to reasoning field when reasoning_content is missing', () => {
      const ctrl = new ThinkingModeController({ enabled: true });
      const result = ctrl.parseThinkingContent({ reasoning: 'fallback' });
      expect(result.reasoning).toBe('fallback');
      expect(ctrl.getReasoningBuffer()).toBe('fallback');
    });

    it('returns empty result for null/undefined chunks', () => {
      const ctrl = new ThinkingModeController({ enabled: true });
      expect(ctrl.parseThinkingContent(null)).toEqual({});
      expect(ctrl.parseThinkingContent(undefined)).toEqual({});
      expect(ctrl.getReasoningBuffer()).toBe('');
    });

    it('returns empty result for empty string chunk', () => {
      const ctrl = new ThinkingModeController({ enabled: true });
      expect(ctrl.parseThinkingContent('')).toEqual({});
    });

    it('does not accumulate reasoning when disabled', () => {
      const ctrl = new ThinkingModeController({ enabled: false });
      const result = ctrl.parseThinkingContent('hidden reasoning');
      // The reasoning is still surfaced to the caller but not buffered.
      expect(result.reasoning).toBe('hidden reasoning');
      expect(ctrl.getReasoningBuffer()).toBe('');
    });

    it('accumulates reasoning across multiple chunks', () => {
      const ctrl = new ThinkingModeController({ enabled: true });
      ctrl.parseThinkingContent('part1 ');
      ctrl.parseThinkingContent({ reasoning_content: 'part2 ' });
      ctrl.parseThinkingContent('part3');
      expect(ctrl.getReasoningBuffer()).toBe('part1 part2 part3');
    });

    it('reset clears the reasoning buffer', () => {
      const ctrl = new ThinkingModeController({ enabled: true });
      ctrl.parseThinkingContent('data');
      expect(ctrl.getReasoningBuffer()).toBe('data');
      ctrl.reset();
      expect(ctrl.getReasoningBuffer()).toBe('');
    });
  });

  describe('hasReasoningContent', () => {
    it('returns false for null/undefined', () => {
      expect(hasReasoningContent(null)).toBe(false);
      expect(hasReasoningContent(undefined)).toBe(false);
    });

    it('returns true for non-empty string chunks', () => {
      expect(hasReasoningContent('reasoning')).toBe(true);
    });

    it('returns false for empty string chunk', () => {
      expect(hasReasoningContent('')).toBe(false);
    });

    it('returns true when reasoning_content is present on object chunk', () => {
      const chunk: ThinkingChunk = { reasoning_content: 'why' };
      expect(hasReasoningContent(chunk)).toBe(true);
    });

    it('returns true when reasoning field is present on object chunk', () => {
      const chunk: ThinkingChunk = { reasoning: 'why' };
      expect(hasReasoningContent(chunk)).toBe(true);
    });

    it('returns false when object chunk has neither reasoning field', () => {
      const chunk: ThinkingChunk = { content: 'answer' };
      expect(hasReasoningContent(chunk)).toBe(false);
    });
  });
});
