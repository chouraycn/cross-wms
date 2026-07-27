/**
 * Harness Selection & Result Classification 单元测试
 *
 * 覆盖：
 * - 线束选择逻辑
 * - 优先级排序
 * - 支持性过滤
 * - 结果分类器
 * - 可重试判断
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerAgentHarness,
  clearAgentHarnesses,
} from '../registry.js';
import { selectAgentHarness, listSupportedHarnesses } from '../selection.js';
import {
  applyHarnessResultClassification,
  isFailedClassification,
  shouldRetry,
} from '../result-classification.js';
import type { AgentHarness, HarnessSupportContext, HarnessAttemptResult, HarnessAttemptParams } from '../types.js';

function createMockHarness(
  id: string,
  options: {
    supported?: boolean;
    priority?: number;
    reason?: string;
    classify?: AgentHarness['classify'];
  } = {},
): AgentHarness {
  return {
    id,
    name: `Harness ${id}`,
    priority: options.priority ?? 0,
    supports: vi.fn().mockReturnValue({
      supported: options.supported ?? true,
      priority: options.priority ?? 0,
      reason: options.reason ?? 'test',
    }),
    run: vi.fn().mockResolvedValue({ text: 'result' }),
    compact: vi.fn().mockResolvedValue({ summary: 'compact', originalCount: 10, compactedCount: 3 }),
    classify: options.classify,
  };
}

describe('Harness Selection — 线束选择', () => {
  beforeEach(() => {
    clearAgentHarnesses();
  });

  // 1
  it('应选择支持的线束', () => {
    const harness = createMockHarness('h1', { supported: true });
    registerAgentHarness(harness);

    const ctx: HarnessSupportContext = { provider: 'test', modelId: 'gpt-4' };
    const selected = selectAgentHarness(ctx);

    expect(selected.id).toBe('h1');
  });

  // 2
  it('没有可用线束时应抛出错误', () => {
    const harness = createMockHarness('h1', { supported: false });
    registerAgentHarness(harness);

    const ctx: HarnessSupportContext = { provider: 'test', modelId: 'gpt-4' };
    expect(() => selectAgentHarness(ctx)).toThrow();
  });

  // 3
  it('应选择优先级最高的线束', () => {
    registerAgentHarness(createMockHarness('low', { priority: 10 }));
    registerAgentHarness(createMockHarness('high', { priority: 100 }));
    registerAgentHarness(createMockHarness('mid', { priority: 50 }));

    const ctx: HarnessSupportContext = { provider: 'test' };
    const selected = selectAgentHarness(ctx);

    expect(selected.id).toBe('high');
  });

  // 4
  it('listSupportedHarnesses 应返回所有支持的线束', () => {
    registerAgentHarness(createMockHarness('h1', { supported: true }));
    registerAgentHarness(createMockHarness('h2', { supported: false }));
    registerAgentHarness(createMockHarness('h3', { supported: true }));

    const ctx: HarnessSupportContext = { provider: 'test' };
    const supported = listSupportedHarnesses(ctx);

    expect(supported.length).toBe(2);
    expect(supported.map((h) => h.id).sort()).toEqual(['h1', 'h3']);
  });

  // 5
  it('支持性检查应传递上下文', () => {
    const harness = createMockHarness('h1');
    registerAgentHarness(harness);

    const ctx: HarnessSupportContext = { provider: 'openai', modelId: 'gpt-4', runtime: 'node' };
    selectAgentHarness(ctx);

    expect(harness.supports).toHaveBeenCalledWith(ctx);
  });
});

describe('Result Classification — 结果分类', () => {
  const harness = createMockHarness('test-harness');
  const params: HarnessAttemptParams = {
    runId: 'r1',
    sessionId: 's1',
    provider: 'openai',
    modelId: 'gpt-4',
    prompt: 'test',
    messages: [],
  };

  // 6
  describe('默认分类', () => {
    it('成功结果应分类为 ok', () => {
      const result: HarnessAttemptResult = { text: 'success' };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.classification).toBe('ok');
      expect(detail.retryable).toBe(false);
      expect(detail.suggestedAction).toBe('continue');
    });

    // 7
    it('超时应分类为 timeout', () => {
      const result: HarnessAttemptResult = { text: '', timedOut: true };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.classification).toBe('timeout');
      expect(detail.retryable).toBe(true);
      expect(detail.suggestedAction).toBe('retry');
    });

    // 8
    it('空闲超时应分类为 timeout', () => {
      const result: HarnessAttemptResult = { text: '', idleTimedOut: true };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.classification).toBe('timeout');
      expect(detail.retryable).toBe(true);
    });

    // 9
    it('压缩超时应分类为 compaction_failure', () => {
      const result: HarnessAttemptResult = { text: '', timedOutDuringCompaction: true };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.classification).toBe('compaction_failure');
      expect(detail.retryable).toBe(true);
      expect(detail.suggestedAction).toBe('fallback');
    });

    // 10
    it('用户中止应分类为 aborted', () => {
      const result: HarnessAttemptResult = { text: '', aborted: true };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.classification).toBe('aborted');
      expect(detail.retryable).toBe(false);
      expect(detail.suggestedAction).toBe('continue');
    });

    // 11
    it('外部中止应分类为 aborted', () => {
      const result: HarnessAttemptResult = { text: '', externalAbort: true };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.classification).toBe('aborted');
      expect(detail.retryable).toBe(false);
      expect(detail.suggestedAction).toBe('abort');
    });

    // 12
    it('钩子阻塞应分类为 blocked', () => {
      const result: HarnessAttemptResult = {
        text: '',
        promptError: 'blocked',
        promptErrorSource: 'hook:before_agent_run',
      };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.classification).toBe('blocked');
      expect(detail.retryable).toBe(false);
      expect(detail.blockedBy).toBe('hook:before_agent_run');
      expect(detail.suggestedAction).toBe('notify');
    });
  });

  // 13
  describe('错误分类与重试', () => {
    it('rate limit 错误应可重试', () => {
      const result: HarnessAttemptResult = {
        text: '',
        promptError: 'Rate limit exceeded',
      };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.classification).toBe('error');
      expect(detail.retryable).toBe(true);
      expect(detail.suggestedAction).toBe('retry');
    });

    // 14
    it('5xx 错误应可重试', () => {
      const result: HarnessAttemptResult = {
        text: '',
        promptError: 'Internal Server Error 500',
      };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.retryable).toBe(true);
    });

    // 15
    it('ECONNRESET 错误应可重试', () => {
      const result: HarnessAttemptResult = {
        text: '',
        promptError: 'read ECONNRESET',
      };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.retryable).toBe(true);
    });

    // 16
    it('普通错误不应可重试', () => {
      const result: HarnessAttemptResult = {
        text: '',
        promptError: 'Invalid API key',
      };
      const detail = applyHarnessResultClassification({ result, params, harness });

      expect(detail.classification).toBe('error');
      expect(detail.retryable).toBe(false);
      expect(detail.suggestedAction).toBe('abort');
    });
  });

  // 17
  describe('自定义分类', () => {
    it('线束自定义 classify 应优先使用', () => {
      const customHarness = createMockHarness('custom', {
        classify: () => 'blocked' as const,
      });

      const result: HarnessAttemptResult = { text: 'some result' };
      const detail = applyHarnessResultClassification({ result, params, harness: customHarness });

      expect(detail.classification).toBe('blocked');
    });

    // 18
    it('自定义 classify 返回 undefined 应回退到默认逻辑', () => {
      const customHarness = createMockHarness('custom', {
        classify: () => undefined as any,
      });

      const result: HarnessAttemptResult = { text: 'success' };
      const detail = applyHarnessResultClassification({ result, params, harness: customHarness });

      expect(detail.classification).toBe('ok');
    });
  });

  // 19
  describe('辅助函数', () => {
    it('isFailedClassification 应正确判断失败分类', () => {
      expect(isFailedClassification('ok')).toBe(false);
      expect(isFailedClassification('error')).toBe(true);
      expect(isFailedClassification('timeout')).toBe(true);
      expect(isFailedClassification('aborted')).toBe(true);
      expect(isFailedClassification('blocked')).toBe(true);
      expect(isFailedClassification('compaction_failure')).toBe(true);
    });

    // 20
    it('shouldRetry 应正确判断是否应重试', () => {
      expect(shouldRetry('timeout')).toBe(true);
      expect(shouldRetry('compaction_failure')).toBe(true);
      expect(shouldRetry('ok')).toBe(false);
      expect(shouldRetry('error')).toBe(false);
      expect(shouldRetry('aborted')).toBe(false);
      expect(shouldRetry('blocked')).toBe(false);
    });
  });
});
