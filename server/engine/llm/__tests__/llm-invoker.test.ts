/**
 * LLM 调用统一包装器测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LlmCircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_OPTIONS,
  getCircuitBreaker,
  removeCircuitBreaker,
  clearCircuitBreakers,
  listCircuitBreakers,
  CircuitOpenError,
  RateLimitExceededError,
  invokeWithGuards,
} from '../llm-invoker.js';
import { clearRateLimiters } from '../rate-limiter.js';
import { llmCostTracker } from '../cost-tracker.js';
import { agentAuditTrail } from '../../agents/agent-audit-trail.js';

// Mock logger
vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('LlmCircuitBreaker', () => {
  let breaker: LlmCircuitBreaker;

  beforeEach(() => {
    breaker = new LlmCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenSuccessThreshold: 2,
    });
  });

  describe('初始状态', () => {
    it('应为 closed', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('应允许调用', () => {
      expect(breaker.canCall()).toBe(true);
    });
  });

  describe('closed → open', () => {
    it('连续失败达到阈值应打开熔断', () => {
      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');

      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');

      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
      expect(breaker.snapshot().consecutiveFailures).toBe(3);
    });

    it('打开后应拒绝调用', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.canCall()).toBe(false);
    });
  });

  describe('open → half-open', () => {
    it('经过 resetTimeoutMs 后应自动进入 half-open', () => {
      const now = Date.now();
      breaker.recordFailure(now);
      breaker.recordFailure(now);
      breaker.recordFailure(now);
      expect(breaker.getState()).toBe('open');

      // 还未到时间
      expect(breaker.canCall(now + 500)).toBe(false);
      expect(breaker.getState()).toBe('open');

      // 时间到了
      expect(breaker.canCall(now + 1001)).toBe(true);
      expect(breaker.getState()).toBe('half-open');
    });
  });

  describe('half-open → closed', () => {
    it('half-open 状态下连续成功达到阈值应关闭熔断', () => {
      const now = Date.now();
      breaker.recordFailure(now);
      breaker.recordFailure(now);
      breaker.recordFailure(now);

      // 进入 half-open
      breaker.canCall(now + 1001);
      expect(breaker.getState()).toBe('half-open');

      breaker.recordSuccess();
      expect(breaker.getState()).toBe('half-open');

      breaker.recordSuccess();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.snapshot().consecutiveFailures).toBe(0);
    });

    it('half-open 状态下失败应立即重新打开', () => {
      const now = Date.now();
      breaker.recordFailure(now);
      breaker.recordFailure(now);
      breaker.recordFailure(now);

      breaker.canCall(now + 1001);
      expect(breaker.getState()).toBe('half-open');

      breaker.recordFailure(now + 1100);
      expect(breaker.getState()).toBe('open');
    });
  });

  describe('closed 状态下成功', () => {
    it('应清零连续失败计数', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.snapshot().consecutiveFailures).toBe(2);

      breaker.recordSuccess();
      expect(breaker.snapshot().consecutiveFailures).toBe(0);
    });
  });

  describe('reset', () => {
    it('应重置到 closed 状态', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');

      breaker.reset();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.snapshot().consecutiveFailures).toBe(0);
    });
  });
});

describe('熔断器注册表', () => {
  beforeEach(() => {
    clearCircuitBreakers();
  });

  it('getCircuitBreaker 应返回单例', () => {
    const a = getCircuitBreaker('openai');
    const b = getCircuitBreaker('openai');
    expect(a).toBe(b);
  });

  it('removeCircuitBreaker 应移除指定 provider', () => {
    const a = getCircuitBreaker('anthropic');
    removeCircuitBreaker('anthropic');
    const b = getCircuitBreaker('anthropic');
    expect(b).not.toBe(a);
  });

  it('listCircuitBreakers 应列出所有熔断器', () => {
    getCircuitBreaker('openai');
    getCircuitBreaker('anthropic');
    const list = listCircuitBreakers();
    expect(list).toHaveLength(2);
    expect(list.map((x) => x.provider).sort()).toEqual(['anthropic', 'openai']);
  });
});

describe('CircuitOpenError', () => {
  it('应包含 provider 和 resetAt', () => {
    const err = new CircuitOpenError('openai', 12345);
    expect(err.provider).toBe('openai');
    expect(err.resetAt).toBe(12345);
    expect(err.message).toContain('openai');
    expect(err.name).toBe('CircuitOpenError');
  });
});

describe('RateLimitExceededError', () => {
  it('应包含 provider 和 waitedMs', () => {
    const err = new RateLimitExceededError('anthropic', 5000);
    expect(err.provider).toBe('anthropic');
    expect(err.waitedMs).toBe(5000);
    expect(err.name).toBe('RateLimitExceededError');
  });
});

describe('invokeWithGuards', () => {
  beforeEach(() => {
    clearCircuitBreakers();
    clearRateLimiters();
    agentAuditTrail.clear();
    llmCostTracker.query({ limit: 1 }); // 触发内部状态初始化
  });

  afterEach(() => {
    clearCircuitBreakers();
    clearRateLimiters();
    agentAuditTrail.clear();
  });

  it('成功调用应返回结果和用量', async () => {
    const result = await invokeWithGuards(
      async () => ({
        data: { content: 'hello' },
        usage: { promptTokens: 10, completionTokens: 5 },
      }),
      {
        agentId: 'agent-1',
        provider: 'openai',
        modelId: 'gpt-4o',
      },
    );

    expect(result.data).toEqual({ content: 'hello' });
    expect(result.usage?.promptTokens).toBe(10);
    expect(result.usage?.completionTokens).toBe(5);
    expect(result.attempts).toBe(1);
    expect(result.retried).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.invokeId).toMatch(/^inv-\d+$/);
  });

  it('成功调用应记录成本到 cost-tracker', async () => {
    await invokeWithGuards(
      async () => ({
        data: 'ok',
        usage: { promptTokens: 100, completionTokens: 50 },
      }),
      {
        agentId: 'agent-cost',
        provider: 'openai',
        modelId: 'gpt-4o',
      },
    );

    const { records } = llmCostTracker.query({ limit: 10 });
    const recent = records.find((r) => r.agentId === 'agent-cost');
    expect(recent).toBeDefined();
    expect(recent?.provider).toBe('openai');
    expect(recent?.modelId).toBe('gpt-4o');
    expect(recent?.usage.promptTokens).toBe(100);
  });

  it('成功调用应记录审计事件', async () => {
    await invokeWithGuards(
      async () => ({ data: 'ok', usage: undefined }),
      {
        agentId: 'agent-audit',
        provider: 'openai',
        modelId: 'gpt-4o',
      },
    );

    const events = agentAuditTrail.query({
      agentId: 'agent-audit',
      category: 'llm',
    });
    expect(events.events.length).toBeGreaterThanOrEqual(2); // start + end
    expect(events.events.some((e) => e.type === 'llm.call.start')).toBe(true);
    expect(events.events.some((e) => e.type === 'llm.call.end')).toBe(true);
  });

  it('disableAudit 时不记录审计', async () => {
    await invokeWithGuards(
      async () => ({ data: 'ok' }),
      {
        agentId: 'agent-noaudit',
        provider: 'openai',
        modelId: 'gpt-4o',
        disableAudit: true,
      },
    );

    const events = agentAuditTrail.query({ agentId: 'agent-noaudit' });
    expect(events.events).toHaveLength(0);
  });

  it('disableCostTracking 时不记录成本', async () => {
    await invokeWithGuards(
      async () => ({
        data: 'ok',
        usage: { promptTokens: 100, completionTokens: 50 },
      }),
      {
        agentId: 'agent-nocost',
        provider: 'openai',
        modelId: 'gpt-4o',
        disableCostTracking: true,
      },
    );

    const { records } = llmCostTracker.query({ limit: 100 });
    expect(records.find((r) => r.agentId === 'agent-nocost')).toBeUndefined();
  });

  it('熔断器打开时应抛出 CircuitOpenError', async () => {
    // 先让 openai 的熔断器打开
    const breaker = getCircuitBreaker('openai');
    for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_OPTIONS.failureThreshold; i++) {
      breaker.recordFailure();
    }
    expect(breaker.getState()).toBe('open');

    await expect(
      invokeWithGuards(
        async () => ({ data: 'ok' }),
        {
          agentId: 'agent-blocked',
          provider: 'openai',
          modelId: 'gpt-4o',
        },
      ),
    ).rejects.toThrow(CircuitOpenError);
  });

  it('调用失败应抛出错误并记录审计', async () => {
    await expect(
      invokeWithGuards(
        async () => {
          throw new Error('provider down');
        },
        {
          agentId: 'agent-fail',
          provider: 'openai',
          modelId: 'gpt-4o',
          retryConfig: { maxRetries: 0 }, // 不重试，加快测试
        },
      ),
    ).rejects.toThrow('provider down');

    const events = agentAuditTrail.query({
      agentId: 'agent-fail',
      category: 'llm',
    });
    expect(events.events.some((e) => e.type === 'llm.call.error')).toBe(true);
  });
});
