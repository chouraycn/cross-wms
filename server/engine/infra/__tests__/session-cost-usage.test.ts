import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  resolveExistingUsageSessionFile,
  requestCostUsageCacheRefresh,
  loadSessionLogs,
  loadSessionCostSummary,
  loadSessionUsageTimeSeries,
  discoverAllSessions,
  loadCostUsageSummary,
  loadCostUsageSummaryFromCache,
  loadSessionCostSummaryFromCache,
  loadSessionCostSummariesFromCache,
} from "../session-cost-usage.js";

// ============================================================================
// 辅助工具：构造 JSONL 记录
// ============================================================================

function jsonl(...records: object[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

function userMessage(content: string, timestamp = "2024-01-15T10:00:00.000Z") {
  return { timestamp, message: { role: "user", content } };
}

function assistantMessage(
  content: string,
  usage: Record<string, unknown>,
  timestamp = "2024-01-15T10:00:01.000Z",
  extra: Record<string, unknown> = {},
) {
  return { timestamp, message: { role: "assistant", content, usage, ...extra } };
}

// ============================================================================
// 主测试套件
// ============================================================================

describe("session-cost-usage", () => {
  let tempDir: string;
  let originalStateDir: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "scu-test-"));
    originalStateDir = process.env.OPENCLAW_STATE_DIR;
    process.env.OPENCLAW_STATE_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeFile(relPath: string, content: string): Promise<string> {
    const fullPath = path.join(tempDir, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    return fullPath;
  }

  async function writeFileWithMtime(
    relPath: string,
    content: string,
    mtimeSec: number,
  ): Promise<string> {
    const fullPath = await writeFile(relPath, content);
    await fs.utimes(fullPath, mtimeSec, mtimeSec);
    return fullPath;
  }

  // ==========================================================================
  // resolveExistingUsageSessionFile
  // ==========================================================================

  describe("resolveExistingUsageSessionFile", () => {
    it("当 sessionFile 存在时应直接返回该路径", async () => {
      const filePath = await writeFile("sessions/abc.jsonl", "{}");
      const result = resolveExistingUsageSessionFile({ sessionFile: filePath });
      expect(result).toBe(filePath);
    });

    it("当未提供 sessionId 和 sessionFile 时应返回 undefined", () => {
      const result = resolveExistingUsageSessionFile({});
      expect(result).toBeUndefined();
    });

    it("当 sessionId 对应的主文件存在时应返回其路径", async () => {
      await writeFile("sessions/my-session.jsonl", "{}");
      const result = resolveExistingUsageSessionFile({ sessionId: "my-session" });
      expect(result).toBe(path.join(tempDir, "sessions", "my-session.jsonl"));
    });

    it("当主文件不存在但目录中有 reset 归档时应返回最新归档", async () => {
      const dir = path.join(tempDir, "sessions");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "lost.jsonl.reset.2024-01-10T00-00-00.000Z"),
        "{}",
      );
      await fs.writeFile(
        path.join(dir, "lost.jsonl.reset.2024-01-15T00-00-00.000Z"),
        "{}",
      );
      const result = resolveExistingUsageSessionFile({ sessionId: "lost" });
      expect(result).toBe(
        path.join(dir, "lost.jsonl.reset.2024-01-15T00-00-00.000Z"),
      );
    });

    it("当主文件不存在但目录中有 deleted 归档时应返回最新归档", async () => {
      const dir = path.join(tempDir, "sessions");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "gone.jsonl.deleted.2024-02-01T00-00-00.000Z"),
        "{}",
      );
      const result = resolveExistingUsageSessionFile({ sessionId: "gone" });
      expect(result).toBe(
        path.join(dir, "gone.jsonl.deleted.2024-02-01T00-00-00.000Z"),
      );
    });

    it("当目录中既无主文件也无归档时应返回原始候选路径", async () => {
      await fs.mkdir(path.join(tempDir, "sessions"), { recursive: true });
      const result = resolveExistingUsageSessionFile({ sessionId: "nope" });
      expect(result).toBe(path.join(tempDir, "sessions", "nope.jsonl"));
    });

    it("当 sessionsDir 不存在（readdirSync 抛错）时应返回候选路径", () => {
      const result = resolveExistingUsageSessionFile({ sessionId: "missing-dir" });
      expect(result).toBe(path.join(tempDir, "sessions", "missing-dir.jsonl"));
    });

    it("当 sessionFile 存在但 sessionId 为空时应返回 sessionFile", async () => {
      const filePath = await writeFile("sessions/xyz.jsonl", "{}");
      const result = resolveExistingUsageSessionFile({
        sessionFile: filePath,
        sessionId: "",
      });
      expect(result).toBe(filePath);
    });
  });

  // ==========================================================================
  // requestCostUsageCacheRefresh
  // ==========================================================================

  describe("requestCostUsageCacheRefresh", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it("无参数调用时不应抛出异常", () => {
      expect(() => requestCostUsageCacheRefresh()).not.toThrow();
    });

    it("指定 agentId 时应正常调度", () => {
      expect(() =>
        requestCostUsageCacheRefresh({ agentId: "test-agent-refresh" }),
      ).not.toThrow();
    });

    it("传入 sessionFiles 时应正常调度", () => {
      expect(() =>
        requestCostUsageCacheRefresh({
          agentId: "file-agent",
          sessionFiles: ["/tmp/a.jsonl", "/tmp/b.jsonl"],
        }),
      ).not.toThrow();
    });

    it("多次调用同一 agentId 时应合并请求而不报错", () => {
      expect(() => {
        requestCostUsageCacheRefresh({ agentId: "merge-agent" });
        requestCostUsageCacheRefresh({
          agentId: "merge-agent",
          sessionFiles: ["/tmp/x.jsonl"],
        });
        requestCostUsageCacheRefresh({
          agentId: "merge-agent",
          sessionFiles: ["/tmp/y.jsonl"],
        });
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // loadSessionLogs（间接测试内部 normalizeUsage）
  // ==========================================================================

  describe("loadSessionLogs", () => {
    it("当会话文件不存在时应返回 null", async () => {
      const result = await loadSessionLogs({
        sessionFile: path.join(tempDir, "nonexistent.jsonl"),
      });
      expect(result).toBeNull();
    });

    it("当 limit <= 0 时应返回空数组", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl(userMessage("Hello")),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 0 });
      expect(result).toEqual([]);
    });

    it("当 limit 为负数时应返回空数组", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl(userMessage("Hello")),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: -1 });
      expect(result).toEqual([]);
    });

    it("应正确解析 user 和 assistant 消息", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl(
          userMessage("用户提问"),
          assistantMessage("助手回答", { input: 100, output: 50, total: 150 }),
        ),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 10 });
      expect(result).toHaveLength(2);
      expect(result![0].role).toBe("user");
      expect(result![0].content).toBe("用户提问");
      expect(result![1].role).toBe("assistant");
      expect(result![1].content).toBe("助手回答");
    });

    it("应正确规范化标准 usage 字段（input/output/cacheRead/cacheWrite/total）", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl(
          assistantMessage("msg", {
            input: 100,
            output: 50,
            cacheRead: 10,
            cacheWrite: 5,
            total: 165,
          }),
        ),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 10 });
      expect(result![0].tokens).toBe(165);
    });

    it("应正确规范化别名 usage 字段（inputTokens/outputTokens 等）", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl(
          assistantMessage("msg", {
            inputTokens: 200,
            outputTokens: 100,
            cacheReadTokens: 20,
            cacheWriteTokens: 10,
            totalTokens: 330,
          }),
        ),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 10 });
      expect(result![0].tokens).toBe(330);
    });

    it("当 usage 为 null 或 undefined 时 tokens 应为 undefined", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl(
          { message: { role: "assistant", content: "no usage", usage: null } },
          { message: { role: "assistant", content: "no usage field" } },
        ),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 10 });
      expect(result).toHaveLength(2);
      expect(result![0].tokens).toBeUndefined();
      expect(result![1].tokens).toBeUndefined();
    });

    it("当 total 缺失时应从分量之和计算 tokens", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl(
          assistantMessage("msg", { input: 100, output: 50, cacheRead: 10 }),
        ),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 10 });
      expect(result![0].tokens).toBe(160);
    });

    it("应从用户消息内容中去除 'System:' 前缀", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl({ message: { role: "user", content: "System: Hello world" } }),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 10 });
      expect(result![0].content).toBe("Hello world");
    });

    it("应截断超过 2000 字符的内容并添加省略号", async () => {
      const longContent = "A".repeat(3000);
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl(userMessage(longContent)),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 10 });
      expect(result![0].content).toHaveLength(2001);
      expect(result![0].content.endsWith("…")).toBe(true);
    });

    it("应正确限制返回的日志数量", async () => {
      const records = Array.from({ length: 10 }, (_, i) =>
        userMessage(`msg-${i}`, `2024-01-15T10:00:0${i}.000Z`),
      );
      const filePath = await writeFile("sessions/test.jsonl", jsonl(...records));
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 3 });
      expect(result).toHaveLength(3);
    });

    it("应解析数组格式的 content 并提取文本块", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl({
          message: {
            role: "user",
            content: [{ type: "text", text: "结构化内容" }],
          },
        }),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 10 });
      expect(result![0].content).toBe("结构化内容");
    });

    it("应跳过未识别 role 的消息", async () => {
      const filePath = await writeFile(
        "sessions/test.jsonl",
        jsonl(
          { message: { role: "system", content: "system msg" } },
          userMessage("user msg"),
        ),
      );
      const result = await loadSessionLogs({ sessionFile: filePath, limit: 10 });
      expect(result).toHaveLength(1);
      expect(result![0].role).toBe("user");
    });
  });

  // ==========================================================================
  // loadSessionCostSummary
  // ==========================================================================

  describe("loadSessionCostSummary", () => {
    it("当会话文件不存在时应返回 null", async () => {
      const result = await loadSessionCostSummary({
        sessionFile: path.join(tempDir, "nonexistent.jsonl"),
      });
      expect(result).toBeNull();
    });

    it("应正确统计消息数量和 token 总量", async () => {
      const filePath = await writeFile(
        "sessions/summary.jsonl",
        jsonl(
          userMessage("用户问题"),
          assistantMessage("助手回答", { input: 100, output: 50, total: 150 }),
        ),
      );
      const result = await loadSessionCostSummary({ sessionFile: filePath });
      expect(result).not.toBeNull();
      expect(result!.messageCounts.total).toBe(2);
      expect(result!.messageCounts.user).toBe(1);
      expect(result!.messageCounts.assistant).toBe(1);
      expect(result!.totalTokens).toBe(150);
      expect(result!.input).toBe(100);
      expect(result!.output).toBe(50);
    });

    it("应使用 startMs/endMs 过滤条目", async () => {
      const filePath = await writeFile(
        "sessions/summary.jsonl",
        jsonl(
          assistantMessage("old", { input: 10, output: 5, total: 15 }, "2024-01-10T00:00:00.000Z"),
          assistantMessage("new", { input: 100, output: 50, total: 150 }, "2024-06-15T00:00:00.000Z"),
        ),
      );
      const result = await loadSessionCostSummary({
        sessionFile: filePath,
        startMs: new Date("2024-06-01").getTime(),
        endMs: new Date("2024-12-31").getTime(),
      });
      expect(result).not.toBeNull();
      expect(result!.totalTokens).toBe(150);
      expect(result!.input).toBe(100);
    });
  });

  // ==========================================================================
  // loadSessionUsageTimeSeries
  // ==========================================================================

  describe("loadSessionUsageTimeSeries", () => {
    it("当会话文件不存在时应返回 null", async () => {
      const result = await loadSessionUsageTimeSeries({
        sessionFile: path.join(tempDir, "nonexistent.jsonl"),
      });
      expect(result).toBeNull();
    });

    it("当 maxPoints <= 0 时应返回空 points 数组", async () => {
      const filePath = await writeFile(
        "sessions/ts.jsonl",
        jsonl(assistantMessage("msg", { input: 100, output: 50, total: 150 })),
      );
      const result = await loadSessionUsageTimeSeries({
        sessionFile: filePath,
        maxPoints: 0,
      });
      expect(result).not.toBeNull();
      expect(result!.points).toEqual([]);
    });

    it("应构建累加 token 和成本的时间序列", async () => {
      const filePath = await writeFile(
        "sessions/ts.jsonl",
        jsonl(
          assistantMessage("first", { input: 100, output: 50, total: 150 }, "2024-01-15T10:00:00.000Z"),
          assistantMessage("second", { input: 200, output: 100, total: 300 }, "2024-01-15T10:00:01.000Z"),
        ),
      );
      const result = await loadSessionUsageTimeSeries({ sessionFile: filePath });
      expect(result).not.toBeNull();
      expect(result!.points).toHaveLength(2);
      expect(result!.points[0].totalTokens).toBe(150);
      expect(result!.points[0].cumulativeTokens).toBe(150);
      expect(result!.points[1].totalTokens).toBe(300);
      expect(result!.points[1].cumulativeTokens).toBe(450);
    });
  });

  // ==========================================================================
  // discoverAllSessions
  // ==========================================================================

  describe("discoverAllSessions", () => {
    it("当 sessions 目录为空时应返回空数组", async () => {
      await fs.mkdir(path.join(tempDir, "sessions"), { recursive: true });
      const result = await discoverAllSessions();
      expect(result).toEqual([]);
    });

    it("应发现会话并按 mtime 降序排列", async () => {
      const sessionsDir = path.join(tempDir, "sessions");
      await fs.mkdir(sessionsDir, { recursive: true });
      await writeFileWithMtime(
        "sessions/older.jsonl",
        jsonl(userMessage("old session")),
        1700000000,
      );
      await writeFileWithMtime(
        "sessions/newer.jsonl",
        jsonl(userMessage("new session")),
        1800000000,
      );
      const result = await discoverAllSessions();
      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe("newer");
      expect(result[1].sessionId).toBe("older");
    });

    it("应提取每个会话的首条用户消息（截取前 100 字符）", async () => {
      const longMessage = "X".repeat(200);
      await writeFile(
        "sessions/extract.jsonl",
        jsonl(userMessage(longMessage)),
      );
      const result = await discoverAllSessions();
      expect(result).toHaveLength(1);
      expect(result[0].firstUserMessage).toHaveLength(100);
      expect(result[0].firstUserMessage).toBe("X".repeat(100));
    });

    it("当 includeFirstUserMessage 为 false 时不应读取消息内容", async () => {
      await writeFile(
        "sessions/no-msg.jsonl",
        jsonl(userMessage("hidden message")),
      );
      const result = await discoverAllSessions({ includeFirstUserMessage: false });
      expect(result).toHaveLength(1);
      expect(result[0].firstUserMessage).toBeUndefined();
    });
  });

  // ==========================================================================
  // loadCostUsageSummary
  // ==========================================================================

  describe("loadCostUsageSummary", () => {
    it("当无会话文件时应返回空汇总", async () => {
      await fs.mkdir(path.join(tempDir, "sessions"), { recursive: true });
      const result = await loadCostUsageSummary({
        startMs: new Date("2024-01-01").getTime(),
        endMs: new Date("2024-12-31").getTime(),
      });
      expect(result.daily).toEqual([]);
      expect(result.totals.totalTokens).toBe(0);
      expect(result.totals.totalCost).toBe(0);
    });

    it("应汇总范围内的会话用量数据", async () => {
      await writeFile(
        "sessions/cost-test.jsonl",
        jsonl(
          assistantMessage("first", { input: 100, output: 50, total: 150 }, "2024-06-15T10:00:00.000Z"),
          assistantMessage("second", { input: 200, output: 100, total: 300 }, "2024-06-15T11:00:00.000Z"),
        ),
      );
      const result = await loadCostUsageSummary({
        startMs: new Date("2024-01-01").getTime(),
        endMs: new Date("2024-12-31").getTime(),
      });
      expect(result.totals.totalTokens).toBe(450);
      expect(result.totals.input).toBe(300);
      expect(result.totals.output).toBe(150);
      expect(result.daily.length).toBeGreaterThanOrEqual(1);
    });

    it("应排除范围外的条目", async () => {
      await writeFile(
        "sessions/range-test.jsonl",
        jsonl(
          assistantMessage("in-range", { input: 100, output: 50, total: 150 }, "2024-06-15T10:00:00.000Z"),
          assistantMessage("out-of-range", { input: 999, output: 999, total: 9999 }, "2023-01-01T00:00:00.000Z"),
        ),
      );
      const result = await loadCostUsageSummary({
        startMs: new Date("2024-01-01").getTime(),
        endMs: new Date("2024-12-31").getTime(),
      });
      expect(result.totals.totalTokens).toBe(150);
      expect(result.totals.input).toBe(100);
    });
  });

  // ==========================================================================
  // loadCostUsageSummaryFromCache
  // ==========================================================================

  describe("loadCostUsageSummaryFromCache", () => {
    it("当缓存和文件均为空时应返回空汇总且状态为 fresh", async () => {
      await fs.mkdir(path.join(tempDir, "sessions"), { recursive: true });
      const result = await loadCostUsageSummaryFromCache({
        startMs: new Date("2024-01-01").getTime(),
        endMs: new Date("2024-12-31").getTime(),
        requestRefresh: false,
      });
      expect(result.totals.totalTokens).toBe(0);
      expect(result.cacheStatus.status).toBe("fresh");
      expect(result.cacheStatus.cachedFiles).toBe(0);
    });

    it("应从缓存条目中汇总用量数据", async () => {
      const sessionDir = path.join(tempDir, "sessions");
      await fs.mkdir(sessionDir, { recursive: true });
      const sessionPath = path.join(sessionDir, "cached.jsonl");
      const content = jsonl(userMessage("hi"));
      await fs.writeFile(sessionPath, content, "utf-8");
      const stats = await fs.stat(sessionPath);

      const cacheEntry = {
        filePath: sessionPath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        pricingFingerprint: "default",
        scannedAt: Date.now(),
        parsedRecords: 1,
        countedRecords: 1,
        usageEntries: [
          {
            timestamp: new Date("2024-06-15T10:00:00.000Z").getTime(),
            input: 100,
            output: 50,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 150,
            totalCost: 0,
            inputCost: 0,
            outputCost: 0,
            cacheReadCost: 0,
            cacheWriteCost: 0,
            missingCostEntries: 0,
          },
        ],
        totals: {
          input: 100,
          output: 50,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 150,
          totalCost: 0,
          inputCost: 0,
          outputCost: 0,
          cacheReadCost: 0,
          cacheWriteCost: 0,
          missingCostEntries: 0,
        },
      };
      const cache = {
        version: 4,
        updatedAt: Date.now(),
        files: { [sessionPath]: cacheEntry },
      };
      await fs.writeFile(
        path.join(sessionDir, ".usage-cost-cache.json"),
        JSON.stringify(cache),
        "utf-8",
      );

      const result = await loadCostUsageSummaryFromCache({
        startMs: new Date("2024-01-01").getTime(),
        endMs: new Date("2024-12-31").getTime(),
        requestRefresh: false,
      });
      expect(result.totals.totalTokens).toBe(150);
      expect(result.totals.input).toBe(100);
      expect(result.totals.output).toBe(50);
      expect(result.cacheStatus.status).toBe("fresh");
    });

    it("当缓存条目与文件不匹配时应标记为 stale", async () => {
      const sessionDir = path.join(tempDir, "sessions");
      await fs.mkdir(sessionDir, { recursive: true });
      const sessionPath = path.join(sessionDir, "stale.jsonl");
      await fs.writeFile(sessionPath, jsonl(userMessage("hi")), "utf-8");

      const cacheEntry = {
        filePath: sessionPath,
        size: 99999,
        mtimeMs: 99999,
        pricingFingerprint: "default",
        scannedAt: 0,
        parsedRecords: 0,
        countedRecords: 0,
        usageEntries: [],
        totals: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          totalCost: 0,
          inputCost: 0,
          outputCost: 0,
          cacheReadCost: 0,
          cacheWriteCost: 0,
          missingCostEntries: 0,
        },
      };
      const cache = {
        version: 4,
        updatedAt: Date.now(),
        files: { [sessionPath]: cacheEntry },
      };
      await fs.writeFile(
        path.join(sessionDir, ".usage-cost-cache.json"),
        JSON.stringify(cache),
        "utf-8",
      );

      const result = await loadCostUsageSummaryFromCache({
        startMs: new Date("2024-01-01").getTime(),
        endMs: new Date("2024-12-31").getTime(),
        requestRefresh: false,
      });
      expect(result.totals.totalTokens).toBe(0);
      expect(result.cacheStatus.staleFiles).toBe(1);
    });
  });

  // ==========================================================================
  // loadSessionCostSummaryFromCache
  // ==========================================================================

  describe("loadSessionCostSummaryFromCache", () => {
    it("当缓存为空且文件不存在时应返回 null 摘要和 stale 状态", async () => {
      const result = await loadSessionCostSummaryFromCache({
        sessionFile: path.join(tempDir, "missing.jsonl"),
        requestRefresh: false,
      });
      expect(result.summary).toBeNull();
      expect(result.cacheStatus.status).toBe("stale");
      expect(result.cacheStatus.staleFiles).toBe(1);
    });

    it("当缓存条目新鲜且包含 sessionSummary 时应返回摘要", async () => {
      const sessionDir = path.join(tempDir, "sessions");
      await fs.mkdir(sessionDir, { recursive: true });
      const sessionPath = path.join(sessionDir, "cached-summary.jsonl");
      const content = jsonl(userMessage("hi"));
      await fs.writeFile(sessionPath, content, "utf-8");
      const stats = await fs.stat(sessionPath);

      const sessionSummary = {
        sessionId: "cached-summary",
        sessionFile: sessionPath,
        firstActivity: new Date("2024-06-15T10:00:00.000Z").getTime(),
        lastActivity: new Date("2024-06-15T10:00:01.000Z").getTime(),
        durationMs: 1000,
        activityDates: ["2024-06-15"],
        dailyBreakdown: [],
        dailyMessageCounts: [],
        messageCounts: { total: 1, user: 1, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 },
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        totalCost: 0,
        inputCost: 0,
        outputCost: 0,
        cacheReadCost: 0,
        cacheWriteCost: 0,
        missingCostEntries: 0,
      };

      const cacheEntry = {
        filePath: sessionPath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        pricingFingerprint: "default",
        scannedAt: Date.now(),
        parsedRecords: 0,
        countedRecords: 0,
        usageEntries: [],
        totals: {
          input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          totalCost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0,
        },
        sessionSummary,
      };
      const cache = {
        version: 4,
        updatedAt: Date.now(),
        files: { [sessionPath]: cacheEntry },
      };
      await fs.writeFile(
        path.join(sessionDir, ".usage-cost-cache.json"),
        JSON.stringify(cache),
        "utf-8",
      );

      const result = await loadSessionCostSummaryFromCache({
        sessionId: "cached-summary",
        sessionFile: sessionPath,
        requestRefresh: false,
      });
      expect(result.summary).not.toBeNull();
      expect(result.summary!.sessionId).toBe("cached-summary");
      expect(result.cacheStatus.status).toBe("fresh");
    });
  });

  // ==========================================================================
  // loadSessionCostSummariesFromCache
  // ==========================================================================

  describe("loadSessionCostSummariesFromCache", () => {
    it("当所有会话文件均不存在时应返回全 null 摘要和 stale 状态", async () => {
      const result = await loadSessionCostSummariesFromCache({
        sessions: [{ sessionFile: path.join(tempDir, "a.jsonl") }],
        requestRefresh: false,
      });
      expect(result.summaries).toHaveLength(1);
      expect(result.summaries[0]).toBeNull();
      expect(result.cacheStatus.status).toBe("stale");
      expect(result.cacheStatus.staleFiles).toBe(1);
    });

    it("当缓存新鲜时应返回摘要且状态为 fresh", async () => {
      const sessionDir = path.join(tempDir, "sessions");
      await fs.mkdir(sessionDir, { recursive: true });
      const sessionPath = path.join(sessionDir, "multi.jsonl");
      await fs.writeFile(sessionPath, jsonl(userMessage("hi")), "utf-8");
      const stats = await fs.stat(sessionPath);

      const sessionSummary = {
        sessionId: "multi",
        sessionFile: sessionPath,
        firstActivity: new Date("2024-06-15T10:00:00.000Z").getTime(),
        lastActivity: new Date("2024-06-15T10:00:00.000Z").getTime(),
        durationMs: 0,
        activityDates: ["2024-06-15"],
        dailyBreakdown: [],
        dailyMessageCounts: [],
        messageCounts: { total: 1, user: 1, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 },
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        totalCost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0,
      };

      const cacheEntry = {
        filePath: sessionPath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        pricingFingerprint: "default",
        scannedAt: Date.now(),
        parsedRecords: 0,
        countedRecords: 0,
        usageEntries: [],
        totals: {
          input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          totalCost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0,
        },
        sessionSummary,
      };
      const cache = {
        version: 4,
        updatedAt: Date.now(),
        files: { [sessionPath]: cacheEntry },
      };
      await fs.writeFile(
        path.join(sessionDir, ".usage-cost-cache.json"),
        JSON.stringify(cache),
        "utf-8",
      );

      const result = await loadSessionCostSummariesFromCache({
        sessions: [{ sessionId: "multi", sessionFile: sessionPath }],
        requestRefresh: false,
      });
      expect(result.summaries).toHaveLength(1);
      expect(result.summaries[0]).not.toBeNull();
      expect(result.summaries[0]!.sessionId).toBe("multi");
      expect(result.cacheStatus.status).toBe("fresh");
      expect(result.cacheStatus.cachedFiles).toBe(1);
    });
  });
});
