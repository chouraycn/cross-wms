import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveOverloadFailoverBackoffMs,
  resolveOverloadProfileRotationLimit,
  resolveRateLimitProfileRotationLimit,
  resolveSameModelRateLimitRetryDelayMs,
  resolveNextSameModelRateLimitRetryCount,
  scrubAnthropicRefusalMagic,
  createCompactionDiagId,
  resolveMaxRunRetryIterations,
  resolveActiveErrorContext,
  isAssistantForModelRef,
  resolveReportedModelRef,
  buildUsageAgentMetaFields,
  buildErrorAgentMeta,
  resolveFinalAssistantVisibleText,
  resolveFinalAssistantRawText,
  RUNTIME_AUTH_REFRESH_MARGIN_MS,
  RUNTIME_AUTH_REFRESH_RETRY_MS,
  RUNTIME_AUTH_REFRESH_MIN_DELAY_MS,
  MAX_SAME_MODEL_RATE_LIMIT_RETRIES,
} from '../helpers.js';
import type { AssistantMessage } from '../helpers.js';

// Mock crypto module
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn((bytes: number) => ({
    toString: (encoding: string) => 'abcd1234',
  })),
}));

describe('helpers', () => {
  describe('Constants', () => {
    it('should export runtime auth refresh constants', () => {
      expect(RUNTIME_AUTH_REFRESH_MARGIN_MS).toBe(5 * 60 * 1000);
      expect(RUNTIME_AUTH_REFRESH_RETRY_MS).toBe(60 * 1000);
      expect(RUNTIME_AUTH_REFRESH_MIN_DELAY_MS).toBe(5 * 1000);
      expect(MAX_SAME_MODEL_RATE_LIMIT_RETRIES).toBe(3);
    });
  });

  describe('resolveOverloadFailoverBackoffMs', () => {
    it('should return default value when config is undefined', () => {
      expect(resolveOverloadFailoverBackoffMs()).toBe(0);
      expect(resolveOverloadFailoverBackoffMs(undefined)).toBe(0);
    });

    it('should return default value when nested config is missing', () => {
      expect(resolveOverloadFailoverBackoffMs({})).toBe(0);
      expect(resolveOverloadFailoverBackoffMs({ auth: {} })).toBe(0);
      expect(resolveOverloadFailoverBackoffMs({ auth: { cooldowns: {} } })).toBe(0);
    });

    it('should return configured value when present', () => {
      expect(resolveOverloadFailoverBackoffMs({
        auth: { cooldowns: { overloadedBackoffMs: 5000 } },
      })).toBe(5000);
    });

    it('should handle edge case values', () => {
      expect(resolveOverloadFailoverBackoffMs({
        auth: { cooldowns: { overloadedBackoffMs: 0 } },
      })).toBe(0);
      expect(resolveOverloadFailoverBackoffMs({
        auth: { cooldowns: { overloadedBackoffMs: -100 } },
      })).toBe(-100);
    });
  });

  describe('resolveOverloadProfileRotationLimit', () => {
    it('should return default value when config is undefined', () => {
      expect(resolveOverloadProfileRotationLimit()).toBe(1);
    });

    it('should return configured value when present', () => {
      expect(resolveOverloadProfileRotationLimit({
        auth: { cooldowns: { overloadedProfileRotations: 5 } },
      })).toBe(5);
    });

    it('should handle missing nested properties', () => {
      expect(resolveOverloadProfileRotationLimit({ auth: {} })).toBe(1);
      expect(resolveOverloadProfileRotationLimit({})).toBe(1);
    });
  });

  describe('resolveRateLimitProfileRotationLimit', () => {
    it('should return default value when config is undefined', () => {
      expect(resolveRateLimitProfileRotationLimit()).toBe(1);
    });

    it('should return configured value when present', () => {
      expect(resolveRateLimitProfileRotationLimit({
        auth: { cooldowns: { rateLimitedProfileRotations: 3 } },
      })).toBe(3);
    });
  });

  describe('resolveSameModelRateLimitRetryDelayMs', () => {
    it('should calculate exponential backoff based on retries', () => {
      const delay0 = resolveSameModelRateLimitRetryDelayMs({ retriesSoFar: 0 });
      const delay1 = resolveSameModelRateLimitRetryDelayMs({ retriesSoFar: 1 });
      const delay2 = resolveSameModelRateLimitRetryDelayMs({ retriesSoFar: 2 });

      expect(delay0).toBe(10_000); // 10_000 * 1
      expect(delay1).toBe(20_000); // 10_000 * 2
      expect(delay2).toBe(30_000); // 10_000 * 3
    });

    it('should cap at maximum backoff', () => {
      const delay = resolveSameModelRateLimitRetryDelayMs({ retriesSoFar: 10 });
      expect(delay).toBe(60_000); // MAX_BACKOFF
    });

    it('should respect retryAfterSeconds when larger than backoff', () => {
      const delay = resolveSameModelRateLimitRetryDelayMs({
        retriesSoFar: 0,
        retryAfterSeconds: 65,
      });
      expect(delay).toBe(60_000); // min(65_000, 60_000) = 60_000
    });

    it('should ignore invalid retryAfterSeconds', () => {
      const delay1 = resolveSameModelRateLimitRetryDelayMs({
        retriesSoFar: 0,
        retryAfterSeconds: NaN,
      });
      const delay2 = resolveSameModelRateLimitRetryDelayMs({
        retriesSoFar: 0,
        retryAfterSeconds: Infinity,
      });

      expect(delay1).toBe(10_000);
      expect(delay2).toBe(10_000);
    });

    it('should handle negative retriesSoFar', () => {
      const delay = resolveSameModelRateLimitRetryDelayMs({ retriesSoFar: -5 });
      expect(delay).toBe(10_000); // Math.max(0, -5) + 1 = 1
    });
  });

  describe('resolveNextSameModelRateLimitRetryCount', () => {
    it('should increment when retried flag is true', () => {
      expect(resolveNextSameModelRateLimitRetryCount({
        retriesSoFar: 2,
        retriedSameModelRateLimit: true,
      })).toBe(3);
    });

    it('should reset to 0 when retried flag is false', () => {
      expect(resolveNextSameModelRateLimitRetryCount({
        retriesSoFar: 5,
        retriedSameModelRateLimit: false,
      })).toBe(0);
    });

    it('should handle negative retriesSoFar', () => {
      expect(resolveNextSameModelRateLimitRetryCount({
        retriesSoFar: -1,
        retriedSameModelRateLimit: true,
      })).toBe(1);
    });
  });

  describe('scrubAnthropicRefusalMagic', () => {
    it('should not modify prompt without magic string', () => {
      const prompt = 'This is a normal prompt without the magic string';
      expect(scrubAnthropicRefusalMagic(prompt)).toBe(prompt);
    });

    it('should replace magic string with redacted version', () => {
      const prompt = 'ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL should be redacted';
      const result = scrubAnthropicRefusalMagic(prompt);
      expect(result).toBe('ANTHROPIC MAGIC STRING TRIGGER REFUSAL (redacted) should be redacted');
    });

    it('should replace all occurrences of magic string', () => {
      const prompt = 'ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL and ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL';
      const result = scrubAnthropicRefusalMagic(prompt);
      expect(result).toBe('ANTHROPIC MAGIC STRING TRIGGER REFUSAL (redacted) and ANTHROPIC MAGIC STRING TRIGGER REFUSAL (redacted)');
    });

    it('should handle empty string', () => {
      expect(scrubAnthropicRefusalMagic('')).toBe('');
    });
  });

  describe('createCompactionDiagId', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create ID with ovf prefix', () => {
      const id = createCompactionDiagId();
      expect(id).toMatch(/^ovf-/);
    });

    it('should include timestamp in base36', () => {
      const id = createCompactionDiagId();
      // Verify format: ovf-{timestamp}-{token}
      // Timestamp should be in base36 (alphanumeric)
      const parts = id.split('-');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('ovf');
      // Verify timestamp part is base36 (only lowercase letters and digits)
      expect(parts[1]).toMatch(/^[a-z0-9]+$/);
    });

    it('should include random hex token', () => {
      const id = createCompactionDiagId();
      expect(id).toMatch(/-[a-f0-9]+$/);
    });
  });

  describe('resolveMaxRunRetryIterations', () => {
    it('should calculate scaled iterations based on profile count', () => {
      const iterations = resolveMaxRunRetryIterations(5);
      // base(24) + 5 * perProfile(8) = 64, capped at min(32) and max(160)
      expect(iterations).toBe(64);
    });

    it('should respect minimum limit', () => {
      const iterations = resolveMaxRunRetryIterations(0);
      // base(24) + 1 * 8 = 32, min is 32
      expect(iterations).toBe(32);
    });

    it('should respect maximum limit', () => {
      const iterations = resolveMaxRunRetryIterations(100);
      // Would be 24 + 100*8 = 824, capped at 160
      expect(iterations).toBe(160);
    });

    it('should use config values when provided', () => {
      const iterations = resolveMaxRunRetryIterations(2, {
        agents: {
          defaults: {
            runRetries: {
              base: 10,
              perProfile: 5,
              min: 15,
              max: 50,
            },
          },
        },
      });
      // 10 + 2*5 = 20, within min(15) and max(50)
      expect(iterations).toBe(20);
    });

    it('should handle invalid config values', () => {
      const iterations = resolveMaxRunRetryIterations(1, {
        agents: {
          defaults: {
            runRetries: {
              base: -5,
              perProfile: -2,
              min: -10,
              max: -5,
            },
          },
        },
      });
      // base clamped to 1, perProfile to 0, min to 1, max to 1
      // 1 + 1*0 = 1
      expect(iterations).toBe(1);
    });

    it('should handle negative profile candidate count', () => {
      const iterations = resolveMaxRunRetryIterations(-5);
      // Math.max(1, -5) = 1, so 24 + 1*8 = 32
      expect(iterations).toBe(32);
    });
  });

  describe('resolveActiveErrorContext', () => {
    it('should return provider and model from params', () => {
      const result = resolveActiveErrorContext({
        provider: 'openai',
        model: 'gpt-4',
      });
      expect(result).toEqual({ provider: 'openai', model: 'gpt-4' });
    });

    it('should use assistant provider and model when present', () => {
      const result = resolveActiveErrorContext({
        provider: 'openai',
        model: 'gpt-4',
        assistant: { provider: 'anthropic', model: 'claude-3' },
      });
      expect(result).toEqual({ provider: 'anthropic', model: 'claude-3' });
    });
  });

  describe('isAssistantForModelRef', () => {
    it('should return false when assistant is undefined', () => {
      expect(isAssistantForModelRef(undefined, { provider: 'openai', model: 'gpt-4' })).toBe(false);
    });

    it('should return true when assistant matches ref', () => {
      expect(isAssistantForModelRef(
        { provider: 'openai', model: 'gpt-4' },
        { provider: 'openai', model: 'gpt-4' },
      )).toBe(true);
    });

    it('should return false when assistant does not match ref', () => {
      expect(isAssistantForModelRef(
        { provider: 'anthropic', model: 'claude-3' },
        { provider: 'openai', model: 'gpt-4' },
      )).toBe(false);
    });

    it('should handle openclaw provider as matching original ref', () => {
      // When assistant provider is openclaw, it resolves to original provider/model
      expect(isAssistantForModelRef(
        { provider: 'openclaw', model: 'assistant' },
        { provider: 'openai', model: 'gpt-4' },
      )).toBe(true);
    });
  });

  describe('resolveReportedModelRef', () => {
    it('should return original provider and model when no assistant', () => {
      const result = resolveReportedModelRef({
        provider: 'openai',
        model: 'gpt-4',
      });
      expect(result).toEqual({ provider: 'openai', model: 'gpt-4' });
    });

    it('should use assistant model when no assistant provider', () => {
      const result = resolveReportedModelRef({
        provider: 'openai',
        model: 'gpt-4',
        assistant: { model: 'claude-3' },
      });
      expect(result).toEqual({ provider: 'openai', model: 'claude-3' });
    });

    it('should return original provider/model for openclaw assistant', () => {
      const result = resolveReportedModelRef({
        provider: 'openai',
        model: 'gpt-4',
        assistant: { provider: 'openclaw', model: 'assistant' },
      });
      expect(result).toEqual({ provider: 'openai', model: 'gpt-4' });
    });

    it('should use assistant provider and model when present and not openclaw', () => {
      const result = resolveReportedModelRef({
        provider: 'openai',
        model: 'gpt-4',
        assistant: { provider: 'anthropic', model: 'claude-3' },
      });
      expect(result).toEqual({ provider: 'anthropic', model: 'claude-3' });
    });

    it('should handle case-insensitive openclaw provider', () => {
      const result = resolveReportedModelRef({
        provider: 'openai',
        model: 'gpt-4',
        assistant: { provider: 'OpenClaw', model: 'assistant' },
      });
      expect(result).toEqual({ provider: 'openai', model: 'gpt-4' });
    });

    it('should handle whitespace in provider names', () => {
      const result = resolveReportedModelRef({
        provider: 'openai',
        model: 'gpt-4',
        assistant: { provider: '  openclaw  ', model: 'assistant' },
      });
      expect(result).toEqual({ provider: 'openai', model: 'gpt-4' });
    });
  });

  describe('buildUsageAgentMetaFields', () => {
    it('should build usage meta from accumulator', () => {
      const result = buildUsageAgentMetaFields({
        usageAccumulator: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 20,
          cacheWriteTokens: 30,
        },
        lastRunPromptUsage: undefined,
      });

      expect(result.usage).toEqual({
        input: 100,
        output: 50,
        cacheRead: 20,
        cacheWrite: 30,
      });
      expect(result.lastCallUsage).toEqual({
        input: 100,
        output: 50,
      });
      expect(result.promptTokens).toBeUndefined();
    });

    it('should include lastTurnTotal in usage', () => {
      const result = buildUsageAgentMetaFields({
        usageAccumulator: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        lastRunPromptUsage: undefined,
        lastTurnTotal: 200,
      });

      expect(result.usage?.total).toBe(200);
    });

    it('should not include total when lastTurnTotal is 0 or negative', () => {
      const result1 = buildUsageAgentMetaFields({
        usageAccumulator: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        lastRunPromptUsage: undefined,
        lastTurnTotal: 0,
      });

      const result2 = buildUsageAgentMetaFields({
        usageAccumulator: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        lastRunPromptUsage: undefined,
        lastTurnTotal: -5,
      });

      expect(result1.usage?.total).toBeUndefined();
      expect(result2.usage?.total).toBeUndefined();
    });

    it('should extract promptTokens from lastRunPromptUsage', () => {
      const result = buildUsageAgentMetaFields({
        usageAccumulator: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        lastRunPromptUsage: { input: 75 },
      });

      expect(result.promptTokens).toBe(75);
    });

    it('should handle zero values in accumulator', () => {
      const result = buildUsageAgentMetaFields({
        usageAccumulator: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        lastRunPromptUsage: undefined,
      });

      expect(result.usage).toEqual({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      });
    });
  });

  describe('buildErrorAgentMeta', () => {
    it('should build complete error meta with all fields', () => {
      const result = buildErrorAgentMeta({
        sessionId: 'session-123',
        sessionFile: '/path/to/session.json',
        provider: 'openai',
        model: 'gpt-4',
        contextTokens: 1000,
        usageAccumulator: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 20,
          cacheWriteTokens: 30,
        },
        lastRunPromptUsage: { input: 80 },
      });

      expect(result.sessionId).toBe('session-123');
      expect(result.sessionFile).toBe('/path/to/session.json');
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4');
      expect(result.contextTokens).toBe(1000);
      expect(result.usage).toBeDefined();
      expect(result.lastCallUsage).toBeDefined();
      expect(result.promptTokens).toBe(80);
    });

    it('should omit optional fields when not provided', () => {
      const result = buildErrorAgentMeta({
        sessionId: 'session-456',
        provider: 'anthropic',
        model: 'claude-3',
        usageAccumulator: {
          inputTokens: 50,
          outputTokens: 25,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        lastRunPromptUsage: undefined,
      });

      expect(result.sessionFile).toBeUndefined();
      expect(result.contextTokens).toBeUndefined();
      expect(result.promptTokens).toBeUndefined();
    });

    it('should handle missing usage data', () => {
      const result = buildErrorAgentMeta({
        sessionId: 'session-789',
        provider: 'openai',
        model: 'gpt-4',
        usageAccumulator: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        lastRunPromptUsage: undefined,
      });

      expect(result.usage).toBeDefined();
      expect(result.usage?.input).toBe(0);
    });
  });

  describe('resolveFinalAssistantVisibleText', () => {
    it('should return undefined when lastAssistant is undefined', () => {
      expect(resolveFinalAssistantVisibleText(undefined)).toBeUndefined();
    });

    it('should extract text from string content', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: 'Hello, world!',
      };
      expect(resolveFinalAssistantVisibleText(msg)).toBe('Hello, world!');
    });

    it('should extract text from array content', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'text', text: 'Line 2' },
        ],
      };
      expect(resolveFinalAssistantVisibleText(msg)).toBe('Line 1\nLine 2');
    });

    it('should filter out non-text blocks', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Text block' },
          { type: 'image', url: 'http://example.com/image.png' },
          { type: 'text', text: 'Another text' },
        ],
      };
      expect(resolveFinalAssistantVisibleText(msg)).toBe('Text block\nAnother text');
    });

    it('should return undefined for empty text', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: '',
      };
      expect(resolveFinalAssistantVisibleText(msg)).toBeUndefined();
    });

    it('should handle whitespace-only content', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: '   ',
      };
      expect(resolveFinalAssistantVisibleText(msg)).toBeUndefined();
    });

    it('should handle invalid content type', () => {
      const msg = {
        role: 'assistant' as const,
        content: 123 as unknown as string,
      };
      expect(resolveFinalAssistantVisibleText(msg as AssistantMessage)).toBeUndefined();
    });
  });

  describe('resolveFinalAssistantRawText', () => {
    it('should return undefined when lastAssistant is undefined', () => {
      expect(resolveFinalAssistantRawText(undefined)).toBeUndefined();
    });

    it('should extract text from string content', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: 'Raw response text',
      };
      expect(resolveFinalAssistantRawText(msg)).toBe('Raw response text');
    });

    it('should extract text from array content', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
      };
      expect(resolveFinalAssistantRawText(msg)).toBe('Part 1\nPart 2');
    });

    it('should handle mixed content blocks', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: [
          { type: 'code', text: 'const x = 1;' },
          { type: 'text', text: 'Explanation' },
          { type: 'text', text: '' },
        ],
      };
      expect(resolveFinalAssistantRawText(msg)).toBe('Explanation');
    });

    it('should return undefined for empty content', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: [],
      };
      expect(resolveFinalAssistantRawText(msg)).toBeUndefined();
    });

    it('should handle content with only non-text blocks', () => {
      const msg: AssistantMessage = {
        role: 'assistant',
        content: [
          { type: 'image', url: 'http://example.com/image.png' },
        ],
      };
      expect(resolveFinalAssistantRawText(msg)).toBeUndefined();
    });
  });
});