import { describe, it, expect, beforeEach } from "vitest";
import {
  isRecurringTopOfHourCronExpr,
  normalizeCronStaggerMs,
  resolveDefaultCronStaggerMs,
  resolveCronStaggerMs,
  calculateStaggerWindow,
  shouldStaggerJob,
  StaggerScheduler,
  getGlobalStaggerScheduler,
  resetGlobalStaggerScheduler,
} from "../stagger.js";

beforeEach(() => {
  resetGlobalStaggerScheduler();
});

describe("isRecurringTopOfHourCronExpr", () => {
  it("5 字段每小时整点表达式返回 true", () => {
    expect(isRecurringTopOfHourCronExpr("0 * * * *")).toBe(true);
  });

  it("6 字段每小时整点表达式返回 true", () => {
    expect(isRecurringTopOfHourCronExpr("0 0 * * * *")).toBe(true);
  });

  it("非整点分钟返回 false", () => {
    expect(isRecurringTopOfHourCronExpr("30 * * * *")).toBe(false);
  });

  it("非通配小时返回 false", () => {
    expect(isRecurringTopOfHourCronExpr("0 12 * * *")).toBe(false);
  });

  it("带步进的通配小时返回 true", () => {
    expect(isRecurringTopOfHourCronExpr("0 */2 * * *")).toBe(true);
  });

  it("字段数量不匹配返回 false", () => {
    expect(isRecurringTopOfHourCronExpr("0 * *")).toBe(false);
    expect(isRecurringTopOfHourCronExpr("0 * * * * * *")).toBe(false);
  });
});

describe("normalizeCronStaggerMs", () => {
  it("数字类型直接返回 floor 后的值", () => {
    expect(normalizeCronStaggerMs(5000)).toBe(5000);
    expect(normalizeCronStaggerMs(5000.9)).toBe(5000);
  });

  it("字符串类型的非负整数返回解析值", () => {
    expect(normalizeCronStaggerMs("3000")).toBe(3000);
  });

  it("负数被 clamp 到 0", () => {
    expect(normalizeCronStaggerMs(-1)).toBe(0);
    expect(normalizeCronStaggerMs(-100)).toBe(0);
  });

  it("非法字符串返回 undefined", () => {
    expect(normalizeCronStaggerMs("abc")).toBeUndefined();
    expect(normalizeCronStaggerMs("3.5")).toBeUndefined();
  });

  it("null 返回 undefined", () => {
    expect(normalizeCronStaggerMs(null)).toBeUndefined();
  });

  it("NaN 返回 undefined", () => {
    expect(normalizeCronStaggerMs(NaN)).toBeUndefined();
  });

  it("0 返回 0", () => {
    expect(normalizeCronStaggerMs(0)).toBe(0);
  });

  it("Infinity 返回 undefined", () => {
    expect(normalizeCronStaggerMs(Infinity)).toBeUndefined();
  });
});

describe("resolveDefaultCronStaggerMs", () => {
  it("整点 cron 返回默认错峰窗口（5 分钟）", () => {
    expect(resolveDefaultCronStaggerMs("0 * * * *")).toBe(5 * 60 * 1000);
  });

  it("非整点 cron 返回 undefined", () => {
    expect(resolveDefaultCronStaggerMs("0 12 * * *")).toBeUndefined();
  });
});

describe("resolveCronStaggerMs", () => {
  it("interval 类型返回 0", () => {
    expect(resolveCronStaggerMs({ kind: "interval", intervalMs: 1000 })).toBe(0);
  });

  it("显式 staggerMs 优先于默认值", () => {
    expect(
      resolveCronStaggerMs({ kind: "cron", expr: "0 * * * *", staggerMs: 1000 }),
    ).toBe(1000);
  });

  it("无显式 staggerMs 时使用整点默认值", () => {
    expect(resolveCronStaggerMs({ kind: "cron", expr: "0 * * * *" })).toBe(5 * 60 * 1000);
  });

  it("无显式 staggerMs 且非整点 cron 返回 0", () => {
    expect(resolveCronStaggerMs({ kind: "cron", expr: "0 12 * * *" })).toBe(0);
  });
});

describe("calculateStaggerWindow", () => {
  it("返回正确的窗口信息", () => {
    const now = 1000000;
    const stagger = 5000;
    const window = calculateStaggerWindow(stagger, now, "job-1");
    expect(window.startMs).toBe(now);
    expect(window.endMs).toBe(now + stagger);
    expect(window.sizeMs).toBe(stagger);
    expect(window.isWithinWindow).toBe(true);
  });

  it("同一 jobId 产生确定性的延迟", () => {
    const w1 = calculateStaggerWindow(5000, 1000000, "job-1");
    const w2 = calculateStaggerWindow(5000, 1000000, "job-1");
    expect(w1.delayMs).toBe(w2.delayMs);
  });

  it("不同 jobId 可能产生不同延迟", () => {
    const w1 = calculateStaggerWindow(5000, 1000000, "job-1");
    const w2 = calculateStaggerWindow(5000, 1000000, "job-2");
    // 延迟值在 0 到 stagger 之间
    expect(w1.delayMs).toBeGreaterThanOrEqual(0);
    expect(w1.delayMs).toBeLessThan(5000);
    expect(w2.delayMs).toBeGreaterThanOrEqual(0);
    expect(w2.delayMs).toBeLessThan(5000);
  });

  it("delayMs 在 0 到 staggerMs 范围内", () => {
    const window = calculateStaggerWindow(10000, 1000000, "any-job-id");
    expect(window.delayMs).toBeGreaterThanOrEqual(0);
    expect(window.delayMs).toBeLessThan(10000);
  });
});

describe("shouldStaggerJob", () => {
  it("staggerMs <= 0 返回 0", () => {
    expect(shouldStaggerJob(0, 1000000, "job-1")).toBe(0);
    expect(shouldStaggerJob(-1, 1000000, "job-1")).toBe(0);
  });

  it("staggerMs > 0 返回确定性延迟", () => {
    const delay = shouldStaggerJob(5000, 1000000, "job-1");
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThan(5000);
  });

  it("同一参数返回相同延迟", () => {
    const d1 = shouldStaggerJob(5000, 1000000, "job-1");
    const d2 = shouldStaggerJob(5000, 1000000, "job-1");
    expect(d1).toBe(d2);
  });
});

describe("StaggerScheduler", () => {
  it("scheduleJob 返回安排的执行时间", () => {
    const scheduler = new StaggerScheduler();
    const scheduled = scheduler.scheduleJob("job-1", 5000, 1000000);
    expect(scheduled).toBeGreaterThanOrEqual(1000000);
    expect(scheduled).toBeLessThanOrEqual(1000000 + 5000);
  });

  it("getScheduledTime 返回已安排的时间", () => {
    const scheduler = new StaggerScheduler();
    scheduler.scheduleJob("job-1", 5000, 1000000);
    expect(scheduler.getScheduledTime("job-1")).toBeGreaterThanOrEqual(1000000);
  });

  it("getScheduledTime 未安排的任务返回 undefined", () => {
    const scheduler = new StaggerScheduler();
    expect(scheduler.getScheduledTime("unknown")).toBeUndefined();
  });

  it("cancelJob 取消已安排的任务返回 true", () => {
    const scheduler = new StaggerScheduler();
    scheduler.scheduleJob("job-1", 5000, 1000000);
    expect(scheduler.cancelJob("job-1")).toBe(true);
    expect(scheduler.getScheduledTime("job-1")).toBeUndefined();
  });

  it("cancelJob 取消不存在的任务返回 false", () => {
    const scheduler = new StaggerScheduler();
    expect(scheduler.cancelJob("unknown")).toBe(false);
  });

  it("shouldExecuteNow 未安排的任务返回 true", () => {
    const scheduler = new StaggerScheduler();
    expect(scheduler.shouldExecuteNow("unknown", 1000000)).toBe(true);
  });

  it("shouldExecuteNow 当前时间超过计划时间返回 true", () => {
    const scheduler = new StaggerScheduler();
    const scheduled = scheduler.scheduleJob("job-1", 0, 1000000);
    expect(scheduler.shouldExecuteNow("job-1", scheduled + 1)).toBe(true);
  });

  it("shouldExecuteNow 当前时间未到计划时间返回 false", () => {
    const scheduler = new StaggerScheduler();
    scheduler.scheduleJob("job-1", 5000, 1000000);
    // 等待时间可能是 0~5000，取最坏情况
    const scheduled = scheduler.getScheduledTime("job-1")!;
    expect(scheduler.shouldExecuteNow("job-1", scheduled - 1)).toBe(false);
  });

  it("getWaitTime 返回需要等待的毫秒数", () => {
    const scheduler = new StaggerScheduler();
    scheduler.scheduleJob("job-1", 5000, 1000000);
    const scheduled = scheduler.getScheduledTime("job-1")!;
    const wait = scheduler.getWaitTime("job-1", 1000000);
    expect(wait).toBe(scheduled - 1000000);
  });

  it("getWaitTime 未安排的任务返回 0", () => {
    const scheduler = new StaggerScheduler();
    expect(scheduler.getWaitTime("unknown", 1000000)).toBe(0);
  });

  it("clear 清除所有任务", () => {
    const scheduler = new StaggerScheduler();
    scheduler.scheduleJob("job-1", 5000, 1000000);
    scheduler.scheduleJob("job-2", 5000, 1000000);
    scheduler.clear();
    expect(scheduler.getScheduledJobs().size).toBe(0);
  });

  it("clearExpired 清除过期任务", () => {
    const scheduler = new StaggerScheduler();
    scheduler.scheduleJob("job-1", 0, 1000000);
    scheduler.scheduleJob("job-2", 0, 2000000);
    scheduler.clearExpired(1500000);
    // job-1 的 scheduledMs = 1000000，已过期
    // job-2 的 scheduledMs = 2000000，未过期
    expect(scheduler.getScheduledTime("job-1")).toBeUndefined();
    expect(scheduler.getScheduledTime("job-2")).toBeDefined();
  });

  it("getScheduledJobs 返回副本而非内部引用", () => {
    const scheduler = new StaggerScheduler();
    scheduler.scheduleJob("job-1", 5000, 1000000);
    const jobs1 = scheduler.getScheduledJobs();
    scheduler.clear();
    const jobs2 = scheduler.getScheduledJobs();
    expect(jobs1.size).toBe(1);
    expect(jobs2.size).toBe(0);
  });
});

describe("全局调度器", () => {
  it("getGlobalStaggerScheduler 返回单例", () => {
    const s1 = getGlobalStaggerScheduler();
    const s2 = getGlobalStaggerScheduler();
    expect(s1).toBe(s2);
  });

  it("resetGlobalStaggerScheduler 后获取新实例", () => {
    const s1 = getGlobalStaggerScheduler();
    resetGlobalStaggerScheduler();
    const s2 = getGlobalStaggerScheduler();
    expect(s1).not.toBe(s2);
  });
});
