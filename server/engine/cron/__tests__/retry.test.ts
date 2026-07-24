import { describe, it, expect } from "vitest";
import {
  withRetry,
  RetryTracker,
  createRetryTracker,
  DEFAULT_RETRY_CONFIG,
  RETRY_CONFIGS,
} from "../retry.js";

describe("DEFAULT_RETRY_CONFIG", () => {
  it("有正确的默认值", () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
    expect(DEFAULT_RETRY_CONFIG.exponentialBase).toBe(2);
    expect(DEFAULT_RETRY_CONFIG.jitter).toBe(true);
    expect(DEFAULT_RETRY_CONFIG.jitterRatio).toBe(0.1);
  });

  it("shouldRetry 默认返回 true", () => {
    expect(DEFAULT_RETRY_CONFIG.shouldRetry(new Error("test"), 1)).toBe(true);
  });
});

describe("RETRY_CONFIGS", () => {
  it("fast 配置正确", () => {
    expect(RETRY_CONFIGS.fast.maxRetries).toBe(3);
    expect(RETRY_CONFIGS.fast.baseDelayMs).toBe(500);
  });

  it("standard 配置正确", () => {
    expect(RETRY_CONFIGS.standard.maxRetries).toBe(5);
    expect(RETRY_CONFIGS.standard.baseDelayMs).toBe(1000);
  });

  it("slow 配置正确", () => {
    expect(RETRY_CONFIGS.slow.maxRetries).toBe(10);
    expect(RETRY_CONFIGS.slow.baseDelayMs).toBe(5000);
  });

  it("networkOnly 只重试网络错误", () => {
    const config = RETRY_CONFIGS.networkOnly;
    expect(config.shouldRetry?.(new Error("network timeout"), 1)).toBe(true);
    expect(config.shouldRetry?.(new Error("ECONNREFUSED"), 1)).toBe(true);
    expect(config.shouldRetry?.(new Error("validation failed"), 1)).toBe(false);
  });
});

describe("withRetry", () => {
  it("首次成功返回成功结果", async () => {
    const result = await withRetry(async () => "ok", {
      maxRetries: 3,
      baseDelayMs: 0,
      jitter: false,
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("ok");
    expect(result.totalAttempts).toBe(1);
    expect(result.states.length).toBe(1);
  });

  it("失败后重试成功", async () => {
    let attempt = 0;
    const result = await withRetry(
      async () => {
        attempt++;
        if (attempt < 3) throw new Error("fail");
        return "ok";
      },
      { maxRetries: 3, baseDelayMs: 0, jitter: false },
    );
    expect(result.success).toBe(true);
    expect(result.result).toBe("ok");
    expect(result.totalAttempts).toBe(3);
  });

  it("重试次数耗尽后返回失败", async () => {
    const result = await withRetry(
      async () => {
        throw new Error("always fails");
      },
      { maxRetries: 2, baseDelayMs: 0, jitter: false },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("always fails");
    expect(result.totalAttempts).toBe(3); // maxRetries + 1
  });

  it("shouldRetry 回调控制是否重试", async () => {
    const result = await withRetry(
      async () => {
        throw new Error("non-retryable");
      },
      {
        maxRetries: 5,
        baseDelayMs: 0,
        jitter: false,
        shouldRetry: () => false,
      },
    );
    expect(result.success).toBe(false);
    expect(result.totalAttempts).toBe(1);
  });

  it("错误信息正确传播", async () => {
    const result = await withRetry(
      async () => {
        throw new Error("custom error message");
      },
      { maxRetries: 0, baseDelayMs: 0, jitter: false },
    );
    expect(result.error).toBe("custom error message");
  });

  it("非 Error 对象的错误也能处理", async () => {
    const result = await withRetry(
      async () => {
        throw "string error";
      },
      { maxRetries: 0, baseDelayMs: 0, jitter: false },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("string error");
  });

  it("maxDelayMs 约束延迟上限", async () => {
    const result = await withRetry(
      async () => {
        throw new Error("fail");
      },
      {
        maxRetries: 1,
        baseDelayMs: 100000,
        maxDelayMs: 50,
        jitter: false,
      },
    );
    expect(result.success).toBe(false);
    // 延迟应被限制在 maxDelayMs 范围内
    const lastState = result.states[result.states.length - 1];
    expect(lastState.nextDelayMs).toBeLessThanOrEqual(50);
  });

  it("totalDurationMs 为非负数", async () => {
    const result = await withRetry(
      async () => {
        throw new Error("fail");
      },
      { maxRetries: 1, baseDelayMs: 0, jitter: false },
    );
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("RetryTracker", () => {
  it("初始状态 attempt 为 0 且未耗尽", () => {
    const tracker = new RetryTracker({ maxRetries: 3, baseDelayMs: 100, jitter: false });
    const state = tracker.getState();
    expect(state.attempt).toBe(0);
    expect(state.exhausted).toBe(false);
    expect(state.nextDelayMs).toBe(0);
    expect(state.totalDelayMs).toBe(0);
  });

  it("recordFailure 增加尝试次数", () => {
    const tracker = new RetryTracker({ maxRetries: 3, baseDelayMs: 100, jitter: false });
    tracker.recordFailure(new Error("fail"));
    expect(tracker.getState().attempt).toBe(1);
    tracker.recordFailure(new Error("fail"));
    expect(tracker.getState().attempt).toBe(2);
  });

  it("recordFailure 计算指数退避延迟", () => {
    const tracker = new RetryTracker({
      maxRetries: 5,
      baseDelayMs: 100,
      exponentialBase: 2,
      maxDelayMs: 10000,
      jitter: false,
    });
    const delay1 = tracker.recordFailure(new Error("fail"));
    expect(delay1).toBe(100); // 100 * 2^0 = 100
    const delay2 = tracker.recordFailure(new Error("fail"));
    expect(delay2).toBe(200); // 100 * 2^1 = 200
    const delay3 = tracker.recordFailure(new Error("fail"));
    expect(delay3).toBe(400); // 100 * 2^2 = 400
  });

  it("shouldRetry 达到 maxRetries 后返回 false", () => {
    const tracker = new RetryTracker({ maxRetries: 2, baseDelayMs: 0, jitter: false });
    expect(tracker.shouldRetry(new Error("fail"))).toBe(true);
    tracker.recordFailure(new Error("fail"));
    expect(tracker.shouldRetry(new Error("fail"))).toBe(true);
    tracker.recordFailure(new Error("fail"));
    expect(tracker.shouldRetry(new Error("fail"))).toBe(false);
  });

  it("recordFailure 耗尽后返回 0", () => {
    const tracker = new RetryTracker({ maxRetries: 1, baseDelayMs: 100, jitter: false });
    tracker.recordFailure(new Error("fail"));
    const delay = tracker.recordFailure(new Error("fail"));
    expect(delay).toBe(0);
    expect(tracker.getState().exhausted).toBe(true);
  });

  it("recordSuccess 返回成功状态", () => {
    const tracker = new RetryTracker({ maxRetries: 3, baseDelayMs: 100, jitter: false });
    tracker.recordFailure(new Error("fail"));
    const state = tracker.recordSuccess();
    expect(state.nextDelayMs).toBe(0);
  });

  it("reset 清空状态", () => {
    const tracker = new RetryTracker({ maxRetries: 3, baseDelayMs: 100, jitter: false });
    tracker.recordFailure(new Error("fail"));
    tracker.recordFailure(new Error("fail"));
    expect(tracker.getHistory().length).toBeGreaterThan(0);
    tracker.reset();
    expect(tracker.getState().attempt).toBe(0);
    expect(tracker.getHistory().length).toBe(0);
  });

  it("getConfig 返回配置副本", () => {
    const tracker = new RetryTracker({ maxRetries: 5, baseDelayMs: 200, jitter: false });
    const config = tracker.getConfig();
    expect(config.maxRetries).toBe(5);
    expect(config.baseDelayMs).toBe(200);
  });

  it("maxDelayMs 约束延迟", () => {
    const tracker = new RetryTracker({
      maxRetries: 5,
      baseDelayMs: 100,
      exponentialBase: 2,
      maxDelayMs: 150,
      jitter: false,
    });
    const delay1 = tracker.recordFailure(new Error("fail"));
    expect(delay1).toBe(100);
    const delay2 = tracker.recordFailure(new Error("fail"));
    // 100 * 2^1 = 200，但被 maxDelayMs 限制为 150
    expect(delay2).toBe(150);
  });

  it("lastError 记录最后错误信息", () => {
    const tracker = new RetryTracker({ maxRetries: 3, baseDelayMs: 0, jitter: false });
    tracker.recordFailure(new Error("first error"));
    expect(tracker.getState().lastError).toBe("first error");
    tracker.recordFailure(new Error("second error"));
    expect(tracker.getState().lastError).toBe("second error");
  });

  it("shouldRetry 在 exhausted 后返回 false", () => {
    const tracker = new RetryTracker({ maxRetries: 1, baseDelayMs: 0, jitter: false });
    tracker.recordFailure(new Error("fail"));
    tracker.recordFailure(new Error("fail"));
    expect(tracker.getState().exhausted).toBe(true);
    expect(tracker.shouldRetry(new Error("fail"))).toBe(false);
  });
});

describe("createRetryTracker", () => {
  it("返回 RetryTracker 实例", () => {
    const tracker = createRetryTracker({ maxRetries: 3, baseDelayMs: 100, jitter: false });
    expect(tracker).toBeInstanceOf(RetryTracker);
    expect(tracker.getConfig().maxRetries).toBe(3);
  });

  it("无配置时使用默认值", () => {
    const tracker = createRetryTracker();
    expect(tracker.getConfig().maxRetries).toBe(DEFAULT_RETRY_CONFIG.maxRetries);
    expect(tracker.getConfig().baseDelayMs).toBe(DEFAULT_RETRY_CONFIG.baseDelayMs);
  });
});
