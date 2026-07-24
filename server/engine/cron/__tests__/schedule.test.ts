import { describe, it, expect, beforeEach } from "vitest";
import {
  parseScheduleType,
  scheduleNextRun,
  computePreviousRunAtMs,
  clearCronScheduleCacheForTest,
  getCronScheduleCacheSizeForTest,
  getCronScheduleCacheMaxForTest,
  hasCronInCacheForTest,
} from "../schedule.js";

beforeEach(() => {
  clearCronScheduleCacheForTest();
});

describe("parseScheduleType", () => {
  it("显式 kind=at 返回 at", () => {
    expect(parseScheduleType({ kind: "at", at: "2024-01-15T10:30:00Z" })).toBe("at");
  });

  it("显式 kind 大小写不敏感", () => {
    expect(parseScheduleType({ kind: "EVERY", everyMs: 1000 })).toBe("every");
    expect(parseScheduleType({ kind: "Cron", expr: "* * * * *" })).toBe("cron");
  });

  it("无 kind 时按 at 字段推断", () => {
    expect(parseScheduleType({ at: "2024-01-15T10:30:00Z" })).toBe("at");
  });

  it("无 kind 时按 everyMs 字段推断", () => {
    expect(parseScheduleType({ everyMs: 5000 })).toBe("every");
  });

  it("无 kind 时按 expr 字段推断", () => {
    expect(parseScheduleType({ expr: "0 * * * *" })).toBe("cron");
  });

  it("at 为空字符串时不推断为 at", () => {
    expect(parseScheduleType({ at: "" })).toBeUndefined();
  });

  it("at 为 null 时不推断为 at", () => {
    expect(parseScheduleType({ at: null })).toBeUndefined();
  });

  it("无法推断时返回 undefined", () => {
    expect(parseScheduleType({})).toBeUndefined();
  });

  it("everyMs 非数字时不推断为 every", () => {
    expect(parseScheduleType({ everyMs: "abc" })).toBeUndefined();
  });
});

describe("scheduleNextRun - at 调度", () => {
  it("at 在未来时返回 at 时间戳", () => {
    const now = Date.UTC(2024, 0, 15, 10, 0, 0);
    const at = Date.UTC(2024, 0, 15, 12, 0, 0);
    expect(scheduleNextRun({ kind: "at", at }, now)).toBe(at);
  });

  it("at 在过去时返回 undefined", () => {
    const now = Date.UTC(2024, 0, 15, 12, 0, 0);
    const at = Date.UTC(2024, 0, 15, 10, 0, 0);
    expect(scheduleNextRun({ kind: "at", at }, now)).toBeUndefined();
  });

  it("at 无效时返回 undefined", () => {
    expect(scheduleNextRun({ kind: "at", at: "invalid" }, Date.now())).toBeUndefined();
  });
});

describe("scheduleNextRun - every 调度", () => {
  it("nowMs 小于 anchor 时返回 anchor", () => {
    const anchor = 100000;
    const now = 50000;
    expect(scheduleNextRun({ kind: "every", everyMs: 10000, anchorMs: anchor }, now)).toBe(anchor);
  });

  it("正确计算下次间隔触发时间", () => {
    const anchor = 100000;
    const everyMs = 10000;
    const now = 125000;
    // elapsed = 25000, steps = floor(25000/10000) + 1 = 3, next = 100000 + 3*10000 = 130000
    expect(scheduleNextRun({ kind: "every", everyMs, anchorMs: anchor }, now)).toBe(130000);
  });

  it("无 anchor 时以 now 为锚点返回 now + everyMs", () => {
    const now = 100000;
    const everyMs = 5000;
    expect(scheduleNextRun({ kind: "every", everyMs }, now)).toBe(now + everyMs);
  });

  it("everyMs 小于 1 时被修正为 1", () => {
    const now = 100000;
    const result = scheduleNextRun({ kind: "every", everyMs: 0.5 }, now);
    expect(result).toBe(now + 1);
  });

  it("everyMs 无效时返回 undefined", () => {
    expect(scheduleNextRun({ kind: "every", everyMs: "abc" }, Date.now())).toBeUndefined();
  });
});

describe("scheduleNextRun - cron 调度", () => {
  it("返回 cron 表达式的下次运行时间", () => {
    const now = new Date("2024-01-15T10:00:00Z").getTime();
    const result = scheduleNextRun({ kind: "cron", expr: "0 12 * * *", tz: "UTC" }, now);
    expect(result).toBe(Date.UTC(2024, 0, 15, 12, 0, 0));
  });

  it("空 expr 返回 undefined", () => {
    expect(scheduleNextRun({ kind: "cron", expr: "   " }, Date.now())).toBeUndefined();
  });

  it("expr 为非字符串时抛出错误", () => {
    expect(() => scheduleNextRun({ kind: "cron", expr: 123 }, Date.now())).toThrow(
      "invalid cron schedule: expr is required",
    );
  });

  it("无法推断类型时返回 undefined", () => {
    expect(scheduleNextRun({}, Date.now())).toBeUndefined();
  });
});

describe("computePreviousRunAtMs", () => {
  it("cron 类型返回上一次运行时间", () => {
    const now = new Date("2024-01-15T13:30:00Z").getTime();
    const result = computePreviousRunAtMs({ kind: "cron", expr: "0 12 * * *", tz: "UTC" }, now);
    expect(result).toBe(Date.UTC(2024, 0, 15, 12, 0, 0));
  });

  it("非 cron 类型返回 undefined", () => {
    expect(computePreviousRunAtMs({ kind: "at", at: "2024-01-15" }, Date.now())).toBeUndefined();
    expect(computePreviousRunAtMs({ kind: "every", everyMs: 1000 }, Date.now())).toBeUndefined();
  });

  it("空 expr 返回 undefined", () => {
    expect(computePreviousRunAtMs({ kind: "cron", expr: "" }, Date.now())).toBeUndefined();
  });
});

describe("cron 表达式缓存", () => {
  it("缓存初始大小为 0", () => {
    expect(getCronScheduleCacheSizeForTest()).toBe(0);
  });

  it("调度后表达式进入缓存", () => {
    scheduleNextRun({ kind: "cron", expr: "0 12 * * *", tz: "UTC" }, Date.now());
    expect(getCronScheduleCacheSizeForTest()).toBe(1);
    expect(hasCronInCacheForTest("0 12 * * *", "UTC")).toBe(true);
  });

  it("相同表达式复用缓存", () => {
    const now = Date.now();
    scheduleNextRun({ kind: "cron", expr: "0 12 * * *", tz: "UTC" }, now);
    scheduleNextRun({ kind: "cron", expr: "0 12 * * *", tz: "UTC" }, now);
    expect(getCronScheduleCacheSizeForTest()).toBe(1);
  });

  it("不同时区生成不同缓存条目", () => {
    scheduleNextRun({ kind: "cron", expr: "0 12 * * *", tz: "UTC" }, Date.now());
    scheduleNextRun({ kind: "cron", expr: "0 12 * * *", tz: "Asia/Shanghai" }, Date.now());
    expect(getCronScheduleCacheSizeForTest()).toBe(2);
  });

  it("clearCronScheduleCacheForTest 清空缓存", () => {
    scheduleNextRun({ kind: "cron", expr: "0 12 * * *", tz: "UTC" }, Date.now());
    expect(getCronScheduleCacheSizeForTest()).toBe(1);
    clearCronScheduleCacheForTest();
    expect(getCronScheduleCacheSizeForTest()).toBe(0);
  });

  it("缓存上限为 512", () => {
    expect(getCronScheduleCacheMaxForTest()).toBe(512);
  });
});
