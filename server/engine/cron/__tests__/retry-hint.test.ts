import { describe, it, expect } from "vitest";
import {
  classifyCronError,
  shouldRetryCronError,
} from "../retry-hint.js";

describe("classifyCronError - rate_limit", () => {
  it("匹配 rate limit 错误", () => {
    const result = classifyCronError(new Error("rate limit exceeded"));
    expect(result.category).toBe("rate_limit");
    expect(result.retryable).toBe(true);
  });

  it("匹配 429 错误", () => {
    const result = classifyCronError("HTTP 429 Too Many Requests");
    expect(result.category).toBe("rate_limit");
    expect(result.retryable).toBe(true);
  });

  it("匹配 too many requests", () => {
    const result = classifyCronError("too many requests");
    expect(result.category).toBe("rate_limit");
    expect(result.retryable).toBe(true);
  });

  it("匹配 resource has been exhausted", () => {
    const result = classifyCronError("resource has been exhausted");
    expect(result.category).toBe("rate_limit");
    expect(result.retryable).toBe(true);
  });
});

describe("classifyCronError - overloaded", () => {
  it("匹配 529 overloaded", () => {
    const result = classifyCronError("529 overloaded_error");
    expect(result.category).toBe("overloaded");
    expect(result.retryable).toBe(true);
  });

  it("匹配 high demand", () => {
    const result = classifyCronError("service is in high demand");
    expect(result.category).toBe("overloaded");
    expect(result.retryable).toBe(true);
  });

  it("匹配 capacity exceeded", () => {
    const result = classifyCronError("capacity exceeded");
    expect(result.category).toBe("overloaded");
    expect(result.retryable).toBe(true);
  });
});

describe("classifyCronError - network", () => {
  it("匹配 network 错误", () => {
    const result = classifyCronError("network error");
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });

  it("匹配 fetch failed", () => {
    const result = classifyCronError("fetch failed");
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });

  it("匹配 ECONNREFUSED", () => {
    const result = classifyCronError("ECONNREFUSED 127.0.0.1:3000");
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });

  it("匹配 ECONNRESET", () => {
    const result = classifyCronError("ECONNRESET");
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });
});

describe("classifyCronError - timeout", () => {
  it("匹配 timeout 错误", () => {
    const result = classifyCronError("request timeout");
    expect(result.category).toBe("timeout");
    expect(result.retryable).toBe(true);
  });

  it("匹配 timed out 错误", () => {
    const result = classifyCronError("operation timed out");
    expect(result.category).toBe("timeout");
    expect(result.retryable).toBe(true);
  });

  it("匹配 ETIMEDOUT", () => {
    const result = classifyCronError("ETIMEDOUT");
    expect(result.category).toBe("timeout");
    expect(result.retryable).toBe(true);
  });
});

describe("classifyCronError - server_error", () => {
  it("匹配 HTTP 500", () => {
    const result = classifyCronError("http 500 internal server error");
    expect(result.category).toBe("server_error");
    expect(result.retryable).toBe(true);
  });

  it("匹配 status 503 service unavailable", () => {
    const result = classifyCronError("status 503 service unavailable");
    expect(result.category).toBe("server_error");
    expect(result.retryable).toBe(true);
  });

  it("匹配 5xx", () => {
    const result = classifyCronError("server returned 5xx");
    expect(result.category).toBe("server_error");
    expect(result.retryable).toBe(true);
  });

  it("纯 503 数字消息匹配", () => {
    const result = classifyCronError("503");
    expect(result.category).toBe("server_error");
    expect(result.retryable).toBe(true);
  });

  it("不误判嵌在文本中的无关 5xx 数字", () => {
    expect(classifyCronError("context limit 512 exceeded").category).not.toBe("server_error");
    expect(classifyCronError("exited with 503 lines").category).not.toBe("server_error");
  });
});

describe("classifyCronError - 边界情况", () => {
  it("null/undefined 返回不可重试", () => {
    expect(classifyCronError(null).retryable).toBe(false);
    expect(classifyCronError(undefined).retryable).toBe(false);
    expect(classifyCronError(null).category).toBeNull();
  });

  it("空字符串返回不可重试", () => {
    expect(classifyCronError("").retryable).toBe(false);
    expect(classifyCronError("").category).toBeNull();
  });

  it("非瞬态错误返回不可重试", () => {
    const result = classifyCronError("validation error: field is required");
    expect(result.category).toBeNull();
    expect(result.retryable).toBe(false);
  });

  it("对象错误通过 JSON.stringify 转换", () => {
    const result = classifyCronError({ message: "network failure" });
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });
});

describe("classifyCronError - retryOn 限制", () => {
  it("retryOn 限制只匹配指定分类", () => {
    const result = classifyCronError("network error", {
      retryOn: ["timeout"],
    });
    expect(result.retryable).toBe(false);
    expect(result.category).toBeNull();
  });

  it("retryOn 包含匹配的分类时返回可重试", () => {
    const result = classifyCronError("network error", {
      retryOn: ["network", "timeout"],
    });
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });
});

describe("classifyCronError - classifiedReason 优先", () => {
  it("结构化分类优先于正则匹配", () => {
    const result = classifyCronError("network error", {
      classifiedReason: "rate_limit",
    });
    expect(result.category).toBe("rate_limit");
    expect(result.retryable).toBe(true);
  });

  it("classifiedReason 不在 retryOn 中时不优先", () => {
    const result = classifyCronError("network error", {
      classifiedReason: "rate_limit",
      retryOn: ["network"],
    });
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });

  it("classifiedReason 为 null 时使用正则匹配", () => {
    const result = classifyCronError("timeout error", {
      classifiedReason: null,
    });
    expect(result.category).toBe("timeout");
    expect(result.retryable).toBe(true);
  });
});

describe("shouldRetryCronError", () => {
  it("可重试错误返回 true", () => {
    expect(shouldRetryCronError("rate limit exceeded")).toBe(true);
    expect(shouldRetryCronError("network error")).toBe(true);
    expect(shouldRetryCronError("timeout")).toBe(true);
  });

  it("不可重试错误返回 false", () => {
    expect(shouldRetryCronError("validation error")).toBe(false);
    expect(shouldRetryCronError("")).toBe(false);
    expect(shouldRetryCronError(null)).toBe(false);
  });

  it("retryOn 限制生效", () => {
    expect(
      shouldRetryCronError("network error", { retryOn: ["timeout"] }),
    ).toBe(false);
    expect(
      shouldRetryCronError("network error", { retryOn: ["network"] }),
    ).toBe(true);
  });
});
