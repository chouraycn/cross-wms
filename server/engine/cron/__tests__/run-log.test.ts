import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordCronRun,
  recordCronRunSuccess,
  recordCronRunFailure,
  getCronRunHistory,
  getCronRunHistoryPage,
  getCronRunEntry,
  configureCronRunLogStore,
  clearCronRunLogForTests,
  getCronRunLogSizeForTests,
} from "../run-log.js";
import type { CronRunLogEntry } from "../run-log.js";

vi.mock("../../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(() => {
  clearCronRunLogForTests();
  configureCronRunLogStore({
    maxEntriesPerJob: 2000,
    maxTotalEntries: 50000,
  });
});

function createEntry(overrides: Partial<CronRunLogEntry> = {}): CronRunLogEntry {
  return {
    runId: "run-1",
    jobId: "job-1",
    startTime: 1000000,
    status: "running",
    ...overrides,
  };
}

describe("recordCronRun", () => {
  it("记录新条目", () => {
    const entry = recordCronRun(createEntry());
    expect(entry.runId).toBe("run-1");
    expect(getCronRunLogSizeForTests()).toBe(1);
  });

  it("缺少 runId 时抛出错误", () => {
    expect(() => recordCronRun({ jobId: "job-1", startTime: 1000, status: "running" } as CronRunLogEntry)).toThrow(
      "invalid cron run log entry: runId and jobId are required",
    );
  });

  it("缺少 jobId 时抛出错误", () => {
    expect(() => recordCronRun({ runId: "run-1", startTime: 1000, status: "running" } as CronRunLogEntry)).toThrow(
      "invalid cron run log entry: runId and jobId are required",
    );
  });

  it("相同 runId 更新而非新增", () => {
    recordCronRun(createEntry({ runId: "run-1", status: "running" }));
    recordCronRun(createEntry({ runId: "run-1", status: "ok", endTime: 2000000 }));
    expect(getCronRunLogSizeForTests()).toBe(1);
    const entry = getCronRunEntry("run-1");
    expect(entry?.status).toBe("ok");
    expect(entry?.endTime).toBe(2000000);
  });

  it("不同 runId 分别记录", () => {
    recordCronRun(createEntry({ runId: "run-1" }));
    recordCronRun(createEntry({ runId: "run-2" }));
    expect(getCronRunLogSizeForTests()).toBe(2);
  });
});

describe("recordCronRunSuccess", () => {
  it("标记成功状态", () => {
    recordCronRun(createEntry({ runId: "run-1", startTime: 1000 }));
    const entry = recordCronRunSuccess("run-1", 2000, "done");
    expect(entry?.status).toBe("ok");
    expect(entry?.endTime).toBe(2000);
    expect(entry?.durationMs).toBe(1000);
    expect(entry?.summary).toBe("done");
  });

  it("不存在的 runId 返回 undefined", () => {
    expect(recordCronRunSuccess("nonexistent", 2000)).toBeUndefined();
  });
});

describe("recordCronRunFailure", () => {
  it("标记失败状态", () => {
    recordCronRun(createEntry({ runId: "run-1", startTime: 1000 }));
    const entry = recordCronRunFailure("run-1", 2000, "something went wrong", "timeout");
    expect(entry?.status).toBe("error");
    expect(entry?.endTime).toBe(2000);
    expect(entry?.durationMs).toBe(1000);
    expect(entry?.error).toBe("something went wrong");
    expect(entry?.errorReason).toBe("timeout");
  });

  it("不存在的 runId 返回 undefined", () => {
    expect(recordCronRunFailure("nonexistent", 2000, "error")).toBeUndefined();
  });
});

describe("getCronRunEntry", () => {
  it("返回存在的条目", () => {
    recordCronRun(createEntry({ runId: "run-1" }));
    const entry = getCronRunEntry("run-1");
    expect(entry?.runId).toBe("run-1");
  });

  it("不存在的 runId 返回 undefined", () => {
    expect(getCronRunEntry("nonexistent")).toBeUndefined();
  });
});

describe("getCronRunHistory", () => {
  beforeEach(() => {
    recordCronRun(createEntry({ runId: "run-1", jobId: "job-1", startTime: 1000, status: "ok" }));
    recordCronRun(createEntry({ runId: "run-2", jobId: "job-1", startTime: 2000, status: "error", error: "fail" }));
    recordCronRun(createEntry({ runId: "run-3", jobId: "job-2", startTime: 3000, status: "ok" }));
  });

  it("返回所有条目（默认降序）", () => {
    const entries = getCronRunHistory();
    expect(entries.length).toBe(3);
    expect(entries[0].startTime).toBe(3000);
    expect(entries[2].startTime).toBe(1000);
  });

  it("按 jobId 过滤", () => {
    const entries = getCronRunHistory({ jobId: "job-1" });
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.jobId === "job-1")).toBe(true);
  });

  it("按 status 过滤", () => {
    const entries = getCronRunHistory({ status: "ok" });
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.status === "ok")).toBe(true);
  });

  it("按 statuses 过滤", () => {
    const entries = getCronRunHistory({ statuses: ["error"] });
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe("error");
  });

  it("按 query 模糊匹配", () => {
    const entries = getCronRunHistory({ query: "fail" });
    expect(entries.length).toBe(1);
    expect(entries[0].runId).toBe("run-2");
  });

  it("升序排序", () => {
    const entries = getCronRunHistory({ sortDir: "asc" });
    expect(entries[0].startTime).toBe(1000);
    expect(entries[2].startTime).toBe(3000);
  });

  it("limit 限制返回数量", () => {
    const entries = getCronRunHistory({ limit: 2 });
    expect(entries.length).toBe(2);
  });
});

describe("getCronRunHistoryPage", () => {
  beforeEach(() => {
    for (let i = 0; i < 10; i++) {
      recordCronRun(createEntry({ runId: `run-${i}`, startTime: 1000 + i, status: "ok" }));
    }
  });

  it("返回分页信息", () => {
    const page = getCronRunHistoryPage({ limit: 3, offset: 0 });
    expect(page.entries.length).toBe(3);
    expect(page.total).toBe(10);
    expect(page.limit).toBe(3);
    expect(page.offset).toBe(0);
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(3);
  });

  it("第二页返回正确的条目", () => {
    const page = getCronRunHistoryPage({ limit: 3, offset: 3 });
    expect(page.entries.length).toBe(3);
    expect(page.offset).toBe(3);
    expect(page.nextOffset).toBe(6);
  });

  it("最后一页 hasMore 为 false", () => {
    const page = getCronRunHistoryPage({ limit: 5, offset: 5 });
    expect(page.entries.length).toBe(5);
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
  });

  it("offset 超出总数时返回空数组", () => {
    const page = getCronRunHistoryPage({ limit: 5, offset: 100 });
    expect(page.entries.length).toBe(0);
    expect(page.total).toBe(10);
    expect(page.hasMore).toBe(false);
  });

  it("limit 上限为 200", () => {
    const page = getCronRunHistoryPage({ limit: 1000 });
    expect(page.limit).toBe(200);
  });

  it("limit 最小为 1", () => {
    const page = getCronRunHistoryPage({ limit: 0 });
    expect(page.limit).toBe(1);
  });
});

describe("configureCronRunLogStore - 修剪", () => {
  it("maxEntriesPerJob 限制单个 jobId 的条目数", () => {
    configureCronRunLogStore({ maxEntriesPerJob: 3, maxTotalEntries: 1000 });
    for (let i = 0; i < 5; i++) {
      recordCronRun(createEntry({ runId: `run-${i}`, jobId: "job-1", startTime: 1000 + i }));
    }
    const entries = getCronRunHistory({ jobId: "job-1" });
    expect(entries.length).toBe(3);
    // 最旧的被丢弃
    expect(entries.find((e) => e.runId === "run-0")).toBeUndefined();
    expect(entries.find((e) => e.runId === "run-4")).toBeDefined();
  });

  it("maxTotalEntries 限制全局条目数", () => {
    configureCronRunLogStore({ maxEntriesPerJob: 1000, maxTotalEntries: 5 });
    for (let i = 0; i < 10; i++) {
      recordCronRun(createEntry({ runId: `run-${i}`, jobId: `job-${i}`, startTime: 1000 + i }));
    }
    expect(getCronRunLogSizeForTests()).toBe(5);
  });

  it("clearCronRunLogForTests 清空所有条目", () => {
    recordCronRun(createEntry({ runId: "run-1" }));
    recordCronRun(createEntry({ runId: "run-2" }));
    expect(getCronRunLogSizeForTests()).toBe(2);
    clearCronRunLogForTests();
    expect(getCronRunLogSizeForTests()).toBe(0);
  });
});

describe("getCronRunHistory - runId 过滤", () => {
  it("按 runId 精确匹配", () => {
    recordCronRun(createEntry({ runId: "target-run", jobId: "job-1" }));
    recordCronRun(createEntry({ runId: "other-run", jobId: "job-1" }));
    const entries = getCronRunHistory({ runId: "target-run" });
    expect(entries.length).toBe(1);
    expect(entries[0].runId).toBe("target-run");
  });
});
