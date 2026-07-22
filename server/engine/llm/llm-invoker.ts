/**
 * LLM 调用统一包装器
 *
 * 把 rate-limiter / retry-handler / cost-tracker / audit-trail / circuit-breaker
 * 五个独立组件串联为一个高阶函数 invokeWithGuards()，让 LLM 调用经过统一的：
 *   1. 熔断器检查（per-provider）
 *   2. 速率限制 acquire
 *   3. 重试包装
 *   4. 调用执行
 *   5. 速率限制 release（含 token 数）
 *   6. 成本记录
 *   7. 审计记录
 *
 * 设计目标：让孤岛模块获得写入方，不强制修改所有 provider 实现。
 */

import { logger } from '../../logger.js';
import { getRateLimiter, DEFAULT_PROVIDER_LIMITS, type RateLimitConfig } from './rate-limiter.js';
import { withRetry, DEFAULT_RETRY_CONFIG, type RetryConfig } from './retry-handler.js';
import { llmCostTracker, type TokenUsage } from './cost-tracker.js';
import { agentAuditTrail } from '../agents/agent-audit-trail.js';
import { classifyError } from './error-mapper.js';

/** 单次调用结果 */
export interface InvokeResult<T> {
  /** 调用返回的数据 */
  data: T;
  /** token 用量（如调用方提供） */
  usage?: TokenUsage;
  /** 调用耗时（ms） */
  durationMs: number;
  /** 总尝试次数（含首次，>=1） */
  attempts: number;
  /** 是否发生过重试 */
  retried: boolean;
  /** 调用 ID（用于关联审计事件） */
  invokeId: string;
}

/** 调用选项 */
export interface InvokeOptions {
  /** Agent ID（用于审计与成本归集） */
  agentId: string;
  /** Provider 名称（如 openai / anthropic） */
  provider: string;
  /** 模型 ID（如 gpt-4o） */
  modelId: string;
  /** 会话 ID（可选） */
  sessionId?: string;
  /** 请求 ID（可选，用于关联外部追踪） */
  requestId?: string;
  /** 是否流式（默认 false） */
  streaming?: boolean;
  /** 速率限制配置覆盖（可选） */
  rateLimitConfig?: RateLimitConfig;
  /** 重试配置覆盖（可选） */
  retryConfig?: Partial<RetryConfig>;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 是否禁用审计记录（默认 false） */
  disableAudit?: boolean;
  /** 是否禁用成本记录（默认 false） */
  disableCostTracking?: boolean;
}

/** 熔断器状态 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/** 单个 Provider 的熔断器 */
export class LlmCircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private lastFailureAt?: number;
  private openedAt?: number;
  private successAfterOpen = 0;

  constructor(
    private readonly options: {
      /** 连续失败阈值（默认 5） */
      failureThreshold: number;
      /** 熔断时长（ms，默认 30s） */
      resetTimeoutMs: number;
      /** half-open 状态下连续成功数达到该值后关闭熔断器（默认 2） */
      halfOpenSuccessThreshold: number;
    },
  ) {}

  /** 当前状态 */
  getState(): CircuitState {
    return this.state;
  }

  /** 是否允许调用 */
  canCall(now = Date.now()): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (this.openedAt && now - this.openedAt >= this.options.resetTimeoutMs) {
        // 自动进入 half-open
        this.state = 'half-open';
        this.successAfterOpen = 0;
        logger.warn(`[LlmCircuitBreaker] Transition open -> half-open`);
        return true;
      }
      return false;
    }
    // half-open：允许试探性调用
    return true;
  }

  /** 记录成功 */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successAfterOpen++;
      if (this.successAfterOpen >= this.options.halfOpenSuccessThreshold) {
        this.state = 'closed';
        this.consecutiveFailures = 0;
        this.openedAt = undefined;
        logger.info(`[LlmCircuitBreaker] Transition half-open -> closed`);
      }
    } else {
      this.consecutiveFailures = 0;
    }
  }

  /** 记录失败 */
  recordFailure(now = Date.now()): void {
    this.consecutiveFailures++;
    this.lastFailureAt = now;

    if (this.state === 'half-open') {
      // half-open 失败立即重新打开
      this.state = 'open';
      this.openedAt = now;
      logger.warn(`[LlmCircuitBreaker] Transition half-open -> open (failure during probe)`);
      return;
    }

    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = 'open';
      this.openedAt = now;
      logger.warn(
        `[LlmCircuitBreaker] Transition closed -> open (failures=${this.consecutiveFailures})`,
      );
    }
  }

  /** 强制重置 */
  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.lastFailureAt = undefined;
    this.openedAt = undefined;
    this.successAfterOpen = 0;
  }

  /** 快照 */
  snapshot() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureAt: this.lastFailureAt,
      openedAt: this.openedAt,
      successAfterOpen: this.successAfterOpen,
    };
  }
}

/** 默认熔断器配置 */
export const DEFAULT_CIRCUIT_BREAKER_OPTIONS = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 2,
};

/** Provider -> 熔断器注册表 */
const circuitBreakers = new Map<string, LlmCircuitBreaker>();

/** 获取或创建 Provider 的熔断器 */
export function getCircuitBreaker(provider: string): LlmCircuitBreaker {
  let cb = circuitBreakers.get(provider);
  if (!cb) {
    cb = new LlmCircuitBreaker(DEFAULT_CIRCUIT_BREAKER_OPTIONS);
    circuitBreakers.set(provider, cb);
  }
  return cb;
}

/** 移除熔断器（测试用） */
export function removeCircuitBreaker(provider: string): void {
  circuitBreakers.delete(provider);
}

/** 清空所有熔断器（测试用） */
export function clearCircuitBreakers(): void {
  circuitBreakers.clear();
}

/** 列出所有熔断器状态 */
export function listCircuitBreakers(): Array<{ provider: string; state: CircuitState; snapshot: ReturnType<LlmCircuitBreaker['snapshot']> }> {
  return Array.from(circuitBreakers.entries()).map(([provider, cb]) => ({
    provider,
    state: cb.getState(),
    snapshot: cb.snapshot(),
  }));
}

/** 调用计数器（用于生成 invokeId） */
let invokeCounter = 0;

/** 熔断器打开错误 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly provider: string,
    public readonly resetAt: number,
  ) {
    super(`Circuit breaker for "${provider}" is open; retries available at ${new Date(resetAt).toISOString()}`);
    this.name = 'CircuitOpenError';
  }
}

/** 速率限制错误 */
export class RateLimitExceededError extends Error {
  constructor(
    public readonly provider: string,
    public readonly waitedMs: number,
  ) {
    super(`Rate limit exceeded for "${provider}" after waiting ${waitedMs}ms`);
    this.name = 'RateLimitExceededError';
  }
}

/**
 * 执行带统一保护的 LLM 调用
 *
 * @param fn 接收 attempt 序号，返回 { data, usage? } 的函数
 * @param options 调用选项
 */
export async function invokeWithGuards<T>(
  fn: (attempt: number) => Promise<{ data: T; usage?: TokenUsage }>,
  options: InvokeOptions,
): Promise<InvokeResult<T>> {
  const { agentId, provider, modelId } = options;
  const invokeId = `inv-${++invokeCounter}`;
  const start = Date.now();
  const signal = options.signal;

  // 1) 熔断器检查
  const circuit = getCircuitBreaker(provider);
  if (!circuit.canCall()) {
    const snapshot = circuit.snapshot();
    const resetAt = (snapshot.openedAt ?? start) + DEFAULT_CIRCUIT_BREAKER_OPTIONS.resetTimeoutMs;
    if (!options.disableAudit) {
      agentAuditTrail.recordLlmCall(agentId, modelId, 'error', {
        invokeId,
        provider,
        reason: 'circuit-open',
        resetAt,
      }, { sessionId: options.sessionId, message: `LLM ${modelId} blocked by circuit breaker` });
    }
    throw new CircuitOpenError(provider, resetAt);
  }

  // 2) 速率限制 acquire
  const limiter = getRateLimiter(provider, options.rateLimitConfig ?? DEFAULT_PROVIDER_LIMITS[provider]);
  if (!limiter.canRequest()) {
    const waited = await limiter.waitForAvailability(10_000);
    if (!waited) {
      throw new RateLimitExceededError(provider, 10_000);
    }
  }
  const acquired = limiter.acquire();
  if (!acquired) {
    // 极端情况：并发窗口已被占满
    throw new RateLimitExceededError(provider, 0);
  }

  // 3) 审计：调用开始
  if (!options.disableAudit) {
    agentAuditTrail.recordLlmCall(agentId, modelId, 'start', {
      invokeId,
      provider,
      requestId: options.requestId,
    }, { sessionId: options.sessionId });
  }

  // 4) 重试包装执行
  let attempts = 0;
  let retried = false;
  let lastError: unknown;

  try {
    const result = await withRetry(
      async (attempt) => {
        attempts = attempt + 1;
        if (attempt > 0) retried = true;
        return await fn(attempt);
      },
      { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig },
      {
        signal,
        onRetry: (attempt, delayMs, error) => {
          logger.debug(`[LlmInvoker] ${provider}/${modelId} retry attempt ${attempt} after ${delayMs}ms`);
          if (!options.disableAudit) {
            agentAuditTrail.recordLlmCall(agentId, modelId, 'error', {
              invokeId,
              provider,
              attempt,
              delayMs,
              error: error instanceof Error ? error.message : String(error),
            }, {
              sessionId: options.sessionId,
              level: 'warn',
              message: `LLM ${modelId} retry attempt ${attempt}`,
            });
          }
        },
      },
    );

    // 5) 速率限制 release（含 token 数）
    const totalTokens = result.usage
      ? result.usage.promptTokens + result.usage.completionTokens
      : 0;
    limiter.release(totalTokens);

    // 6) 成本记录
    if (!options.disableCostTracking && result.usage) {
      llmCostTracker.record({
        agentId,
        provider,
        modelId,
        usage: result.usage,
        sessionId: options.sessionId,
        requestId: options.requestId,
        streaming: options.streaming,
        durationMs: Date.now() - start,
      });
    }

    // 7) 审计：调用结束
    if (!options.disableAudit) {
      agentAuditTrail.recordLlmCall(
        agentId,
        modelId,
        'end',
        {
          invokeId,
          provider,
          attempts,
          usage: result.usage,
          durationMs: Date.now() - start,
        },
        {
          sessionId: options.sessionId,
          durationMs: Date.now() - start,
        },
      );
    }

    // 熔断器记录成功
    circuit.recordSuccess();

    return {
      data: result.data,
      usage: result.usage,
      durationMs: Date.now() - start,
      attempts,
      retried,
      invokeId,
    };
  } catch (error) {
    lastError = error;
    limiter.release(0);

    // 熔断器：仅对可重试错误或 5xx 记录失败
    const classified = classifyError(error);
    const isRetryableOrServerError = classified.retryable || classified.code === 'server_error';
    if (isRetryableOrServerError) {
      circuit.recordFailure();
    }

    // 审计：调用错误
    if (!options.disableAudit) {
      agentAuditTrail.recordLlmCall(
        agentId,
        modelId,
        'error',
        {
          invokeId,
          provider,
          attempts,
          error: error instanceof Error ? error.message : String(error),
          errorCode: classified.code,
          durationMs: Date.now() - start,
        },
        {
          sessionId: options.sessionId,
          durationMs: Date.now() - start,
          message: `LLM ${modelId} failed: ${classified.code}`,
        },
      );
    }

    throw error;
  }
}
