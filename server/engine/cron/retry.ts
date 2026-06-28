/**
 * Retry - 重试机制
 * 实现指数退避重试策略，支持最大重试次数限制和重试状态跟踪
 */

/** 重试配置接口 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 基础延迟（毫秒） */
  baseDelayMs: number;
  /** 最大延迟（毫秒） */
  maxDelayMs?: number;
  /** 指数基数，默认 2 */
  exponentialBase?: number;
  /** 是否随机抖动 */
  jitter?: boolean;
  /** 最大抖动比例（0-1），默认 0.1 */
  jitterRatio?: number;
  /** 重试条件函数，返回 true 时重试 */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/** 重试状态 */
export interface RetryState {
  /** 当前尝试次数 */
  attempt: number;
  /** 是否已耗尽所有重试 */
  exhausted: boolean;
  /** 下次重试的延迟（毫秒） */
  nextDelayMs: number;
  /** 累积的延迟（毫秒） */
  totalDelayMs: number;
  /** 错误信息 */
  lastError?: string;
}

/** 重试结果 */
export interface RetryResult<T> {
  /** 是否成功 */
  success: boolean;
  /** 最终结果 */
  result?: T;
  /** 错误信息 */
  error?: string;
  /** 总尝试次数 */
  totalAttempts: number;
  /** 总耗时（毫秒） */
  totalDurationMs: number;
  /** 状态历史 */
  states: RetryState[];
}

/** 默认重试配置 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  jitter: true,
  jitterRatio: 0.1,
  shouldRetry: () => true,
};

/** 计算带抖动的延迟 */
function calculateDelayWithJitter(
  baseDelay: number,
  jitterRatio: number,
  currentAttempt: number,
): number {
  const jitter = baseDelay * jitterRatio;
  const randomFactor = Math.random() * 2 - 1; // -1 to 1
  const jitterAmount = jitter * randomFactor;
  return Math.max(0, baseDelay + jitterAmount * currentAttempt);
}

/** 计算指数退避延迟 */
function calculateExponentialBackoff(
  baseDelay: number,
  exponentialBase: number,
  attempt: number,
): number {
  return baseDelay * Math.pow(exponentialBase, attempt - 1);
}

/** 解析重试配置 */
function resolveRetryConfig(config?: Partial<RetryConfig>): Required<RetryConfig> {
  return {
    maxRetries: config?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    baseDelayMs: config?.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: config?.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    exponentialBase: config?.exponentialBase ?? DEFAULT_RETRY_CONFIG.exponentialBase,
    jitter: config?.jitter ?? DEFAULT_RETRY_CONFIG.jitter,
    jitterRatio: config?.jitterRatio ?? DEFAULT_RETRY_CONFIG.jitterRatio,
    shouldRetry: config?.shouldRetry ?? DEFAULT_RETRY_CONFIG.shouldRetry,
  };
}

/** 创建初始重试状态 */
function createInitialRetryState(): RetryState {
  return {
    attempt: 0,
    exhausted: false,
    nextDelayMs: 0,
    totalDelayMs: 0,
  };
}

/** 执行带重试的操作 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<RetryResult<T>> {
  const resolvedConfig = resolveRetryConfig(config);
  const states: RetryState[] = [];
  const startTime = Date.now();

  let currentState = createInitialRetryState();
  let lastError: unknown;

  while (currentState.attempt <= resolvedConfig.maxRetries) {
    const attemptStartTime = Date.now();

    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      return {
        success: true,
        result,
        totalAttempts: currentState.attempt + 1,
        totalDurationMs: duration,
        states: [...states, { ...currentState, nextDelayMs: 0 }],
      };
    } catch (err) {
      lastError = err;
      const attemptDuration = Date.now() - attemptStartTime;

      currentState = {
        ...currentState,
        attempt: currentState.attempt + 1,
        lastError: err instanceof Error ? err.message : String(err),
      };

      states.push({ ...currentState });

      // 检查是否应该重试
      if (
        currentState.attempt > resolvedConfig.maxRetries ||
        !resolvedConfig.shouldRetry(err, currentState.attempt)
      ) {
        currentState.exhausted = true;
        break;
      }

      // 计算下次延迟
      const rawDelay = calculateExponentialBackoff(
        resolvedConfig.baseDelayMs,
        resolvedConfig.exponentialBase,
        currentState.attempt,
      );

      let nextDelay = resolvedConfig.maxDelayMs
        ? Math.min(rawDelay, resolvedConfig.maxDelayMs)
        : rawDelay;

      if (resolvedConfig.jitter) {
        nextDelay = calculateDelayWithJitter(
          nextDelay,
          resolvedConfig.jitterRatio,
          currentState.attempt,
        );
      }

      currentState = {
        ...currentState,
        nextDelayMs: Math.round(nextDelay),
        totalDelayMs: currentState.totalDelayMs + attemptDuration + Math.round(nextDelay),
      };

      // 等待延迟
      await new Promise((resolve) => setTimeout(resolve, currentState.nextDelayMs));
    }
  }

  // 所有重试都已耗尽
  const finalState: RetryState = {
    ...currentState,
    exhausted: true,
  };

  return {
    success: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    totalAttempts: states.length,
    totalDurationMs: Date.now() - startTime,
    states,
  };
}

/** 创建重试状态跟踪器 */
export class RetryTracker {
  private states: RetryState[] = [];
  private currentState: RetryState = createInitialRetryState();
  private readonly config: Required<RetryConfig>;

  constructor(config?: Partial<RetryConfig>) {
    this.config = resolveRetryConfig(config);
  }

  /** 获取当前状态 */
  getState(): RetryState {
    return { ...this.currentState };
  }

  /** 获取所有状态历史 */
  getHistory(): RetryState[] {
    return [...this.states];
  }

  /** 检查是否应该重试 */
  shouldRetry(error: unknown): boolean {
    if (this.currentState.exhausted) {
      return false;
    }
    if (this.currentState.attempt >= this.config.maxRetries) {
      return false;
    }
    return this.config.shouldRetry(error, this.currentState.attempt + 1);
  }

  /** 记录失败并获取下次延迟 */
  recordFailure(error: unknown): number {
    this.states.push({ ...this.currentState });

    this.currentState = {
      ...this.currentState,
      attempt: this.currentState.attempt + 1,
      lastError: error instanceof Error ? error.message : String(error),
    };

    if (!this.shouldRetry(error)) {
      this.currentState.exhausted = true;
      return 0;
    }

    const rawDelay = calculateExponentialBackoff(
      this.config.baseDelayMs,
      this.config.exponentialBase,
      this.currentState.attempt,
    );

    let nextDelay = this.config.maxDelayMs
      ? Math.min(rawDelay, this.config.maxDelayMs)
      : rawDelay;

    if (this.config.jitter) {
      nextDelay = calculateDelayWithJitter(
        nextDelay,
        this.config.jitterRatio,
        this.currentState.attempt,
      );
    }

    nextDelay = Math.round(nextDelay);

    this.currentState = {
      ...this.currentState,
      nextDelayMs: nextDelay,
      totalDelayMs: this.currentState.totalDelayMs + nextDelay,
    };

    return nextDelay;
  }

  /** 记录成功 */
  recordSuccess(): RetryState {
    const successState: RetryState = {
      ...this.currentState,
      nextDelayMs: 0,
    };
    this.states.push(successState);
    return successState;
  }

  /** 重置跟踪器 */
  reset(): void {
    this.states = [];
    this.currentState = createInitialRetryState();
  }

  /** 获取配置 */
  getConfig(): Required<RetryConfig> {
    return { ...this.config };
  }
}

/** 创建 RetryTracker 实例的工厂函数 */
export function createRetryTracker(config?: Partial<RetryConfig>): RetryTracker {
  return new RetryTracker(config);
}

/** 预定义的重试配置常量 */
export const RETRY_CONFIGS = {
  /** 快速重试：最多 3 次，基础延迟 500ms */
  fast: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    exponentialBase: 2,
    jitter: true,
    jitterRatio: 0.1,
  } as Partial<RetryConfig>,

  /** 标准重试：最多 5 次，基础延迟 1s */
  standard: {
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponentialBase: 2,
    jitter: true,
    jitterRatio: 0.1,
  } as Partial<RetryConfig>,

  /** 慢速重试：最多 10 次，基础延迟 5s */
  slow: {
    maxRetries: 10,
    baseDelayMs: 5000,
    maxDelayMs: 120000,
    exponentialBase: 2,
    jitter: true,
    jitterRatio: 0.15,
  } as Partial<RetryConfig>,

  /** 仅重试网络错误 */
  networkOnly: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    exponentialBase: 2,
    jitter: true,
    jitterRatio: 0.1,
    shouldRetry: (error: unknown) => {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
          message.includes("network") ||
          message.includes("timeout") ||
          message.includes("econnrefused") ||
          message.includes("econnreset") ||
          message.includes("socket")
        );
      }
      return false;
    },
  } as Partial<RetryConfig>,
} as const;
