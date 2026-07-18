/**
 * 固定窗口限流 — 进程本地的简单限流原语
 *
 * 故意设计为进程内内存限流；需要分布式限流的调用方必须自行加层持久化。
 *
 * 参考 openclaw/src/infra/fixed-window-rate-limit.ts
 */

/** 内存与请求守卫辅助使用的最小固定窗口限流接口 */
export type FixedWindowRateLimiter = {
  consume: () => {
    /** 本次调用是否成功消耗配额 */
    allowed: boolean;
    /** 配额耗尽时距离下一个固定窗口的毫秒数 */
    retryAfterMs: number;
    /** 本次 consume 调用后当前窗口剩余请求数 */
    remaining: number;
  };
  /** 清除当前固定窗口计数，下次 consume 重新开始 */
  reset: () => void;
};

/** 将限流数值配置规范化为带下界的有限整数 */
export function resolveFixedWindowRateLimitInteger(
  value: number | undefined,
  fallback: number,
  params: { min: number },
): number {
  const candidate = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(params.min, Math.floor(candidate));
}

/** 创建固定窗口计数器，返回是否允许、剩余配额与重试延迟 */
export function createFixedWindowRateLimiter(params: {
  /** 每个窗口允许的最大成功 consume 次数 */
  maxRequests: number;
  /** 固定窗口时长（毫秒） */
  windowMs: number;
  /** 可选 clock，用于测试或确定性主机运行时 */
  now?: () => number;
}): FixedWindowRateLimiter {
  const maxRequests = resolveFixedWindowRateLimitInteger(params.maxRequests, 1, { min: 1 });
  const windowMs = resolveFixedWindowRateLimitInteger(params.windowMs, 1, { min: 1 });
  const now = params.now ?? Date.now;

  let count = 0;
  let windowStartMs = 0;

  return {
    consume() {
      const nowMs = now();
      if (nowMs - windowStartMs >= windowMs) {
        // 固定窗口语义：窗口过期后第一个请求时重置全部配额。
        windowStartMs = nowMs;
        count = 0;
      }
      if (count >= maxRequests) {
        // 钳制 retryAfterMs 以应对注入 clock 在 consume 之间异常跳变。
        return {
          allowed: false,
          retryAfterMs: Math.max(0, windowStartMs + windowMs - nowMs),
          remaining: 0,
        };
      }
      count += 1;
      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: Math.max(0, maxRequests - count),
      };
    },
    reset() {
      count = 0;
      windowStartMs = 0;
    },
  };
}
