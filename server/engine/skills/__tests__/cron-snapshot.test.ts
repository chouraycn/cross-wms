import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  startSkillSnapshotCron,
  stopSkillSnapshotCron,
  triggerManualRefresh,
  getSnapshotStats,
  getLastSnapshot,
  resetCronSnapshotState,
  isRefreshing,
  DEFAULT_SNAPSHOT_INTERVAL_MS,
  MIN_SNAPSHOT_INTERVAL_MS,
} from "../runtime/cron-snapshot.js";
import type { ScheduledRefreshHandle } from "../runtime/cron-snapshot.js";
import type { Skill, SkillEntry } from "../types.js";

vi.mock("../runtime/refresh.js", () => ({
  refreshSkills: vi.fn(),
  getCachedSkills: vi.fn(),
  clearSkillCache: vi.fn(),
}));

vi.mock("../discovery/status.js", () => ({
  computeSkillStatus: vi.fn(),
}));

vi.mock("../runtime/session-snapshot.js", () => ({
  buildSessionSkillSnapshot: vi.fn(),
}));

vi.mock("../../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { refreshSkills, getCachedSkills } from "../runtime/refresh.js";
import { computeSkillStatus } from "../discovery/status.js";
import { buildSessionSkillSnapshot } from "../runtime/session-snapshot.js";

function createMockSkill(name: string, overrides: Partial<Skill> = {}): Skill {
  return {
    name,
    description: `Description for ${name}`,
    filePath: `/skills/${name}/SKILL.md`,
    baseDir: `/skills/${name}`,
    source: "bundled",
    disableModelInvocation: false,
    ...overrides,
  };
}

function createMockSkillEntry(skill: Skill): SkillEntry {
  return {
    skill,
    frontmatter: {},
  };
}

const mockWorkspaceDir = "/test/workspace";

describe("cron-snapshot", () => {
  beforeEach(() => {
    resetCronSnapshotState();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("startSkillSnapshotCron", () => {
    it("应该返回带有 id 和 stop/isRunning 方法的 handle", () => {
      const handle = startSkillSnapshotCron({
        intervalMs: 60_000,
        workspaceDir: mockWorkspaceDir,
      });

      expect(handle.id).toBeDefined();
      expect(typeof handle.id).toBe("string");
      expect(typeof handle.stop).toBe("function");
      expect(typeof handle.isRunning).toBe("function");
      expect(handle.isRunning()).toBe(true);

      handle.stop();
    });

    it("启动时不应该立即刷新", () => {
      vi.mocked(refreshSkills).mockResolvedValue({
        success: true,
        previousCount: 0,
        newCount: 2,
        added: ["skill-1", "skill-2"],
        removed: [],
        changed: [],
      });
      vi.mocked(getCachedSkills).mockReturnValue([]);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 2,
        bySource: { bundled: 2, workspace: 0, unknown: 0 },
        promptVisible: 2,
        userInvocable: 2,
        runtimeVisible: 2,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: [],
        prompt: "",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      const handle = startSkillSnapshotCron({
        intervalMs: 60_000,
        workspaceDir: mockWorkspaceDir,
      });

      expect(refreshSkills).not.toHaveBeenCalled();

      handle.stop();
    });

    it("应该在 interval 后触发刷新", async () => {
      const entries = [
        createMockSkillEntry(createMockSkill("skill-1")),
        createMockSkillEntry(createMockSkill("skill-2")),
      ];

      vi.mocked(refreshSkills).mockResolvedValue({
        success: true,
        previousCount: 0,
        newCount: 2,
        added: ["skill-1", "skill-2"],
        removed: [],
        changed: [],
      });
      vi.mocked(getCachedSkills).mockReturnValue(entries);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 2,
        bySource: { bundled: 2, workspace: 0, unknown: 0 },
        promptVisible: 2,
        userInvocable: 2,
        runtimeVisible: 2,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: entries.map((e) => e.skill),
        prompt: "mock prompt",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      const handle = startSkillSnapshotCron({
        intervalMs: 60_000,
        workspaceDir: mockWorkspaceDir,
      });

      vi.advanceTimersByTime(60_000);
      await vi.runAllTicks();

      expect(refreshSkills).toHaveBeenCalledTimes(1);
      expect(refreshSkills).toHaveBeenCalledWith(mockWorkspaceDir);

      handle.stop();
    });

    it("启动新 cron 时应该停止旧的", () => {
      const handle1 = startSkillSnapshotCron({
        intervalMs: 60_000,
        workspaceDir: mockWorkspaceDir,
      });

      expect(handle1.isRunning()).toBe(true);

      const handle2 = startSkillSnapshotCron({
        intervalMs: 120_000,
        workspaceDir: mockWorkspaceDir,
      });

      expect(handle1.isRunning()).toBe(false);
      expect(handle2.isRunning()).toBe(true);

      handle2.stop();
    });

    it("间隔低于最小值时应该使用最小值", () => {
      const handle = startSkillSnapshotCron({
        intervalMs: 10_000,
        workspaceDir: mockWorkspaceDir,
      });

      expect(handle.isRunning()).toBe(true);

      vi.advanceTimersByTime(10_000);
      expect(refreshSkills).not.toHaveBeenCalled();

      vi.advanceTimersByTime(19_000);
      expect(refreshSkills).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1_000);
      expect(refreshSkills).toHaveBeenCalledTimes(1);

      handle.stop();
    });

    it("默认间隔应该是 5 分钟", () => {
      expect(DEFAULT_SNAPSHOT_INTERVAL_MS).toBe(300_000);
    });

    it("最小间隔应该是 30 秒", () => {
      expect(MIN_SNAPSHOT_INTERVAL_MS).toBe(30_000);
    });
  });

  describe("stopSkillSnapshotCron", () => {
    it("应该停止定时刷新", () => {
      const handle = startSkillSnapshotCron({
        intervalMs: 60_000,
        workspaceDir: mockWorkspaceDir,
      });

      expect(handle.isRunning()).toBe(true);

      stopSkillSnapshotCron(handle);

      expect(handle.isRunning()).toBe(false);
    });

    it("多次停止应该是安全的", () => {
      const handle = startSkillSnapshotCron({
        intervalMs: 60_000,
        workspaceDir: mockWorkspaceDir,
      });

      stopSkillSnapshotCron(handle);
      stopSkillSnapshotCron(handle);

      expect(handle.isRunning()).toBe(false);
    });

    it("停止后不应该再触发刷新", async () => {
      const entries = [createMockSkillEntry(createMockSkill("skill-1"))];

      vi.mocked(refreshSkills).mockResolvedValue({
        success: true,
        previousCount: 0,
        newCount: 1,
        added: ["skill-1"],
        removed: [],
        changed: [],
      });
      vi.mocked(getCachedSkills).mockReturnValue(entries);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 1,
        bySource: { bundled: 1, workspace: 0, unknown: 0 },
        promptVisible: 1,
        userInvocable: 1,
        runtimeVisible: 1,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: entries.map((e) => e.skill),
        prompt: "mock prompt",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      const handle = startSkillSnapshotCron({
        intervalMs: 60_000,
        workspaceDir: mockWorkspaceDir,
      });

      stopSkillSnapshotCron(handle);

      vi.advanceTimersByTime(120_000);
      await vi.runAllTicks();

      expect(refreshSkills).not.toHaveBeenCalled();
    });
  });

  describe("triggerManualRefresh", () => {
    it("应该立即触发刷新", async () => {
      const entries = [
        createMockSkillEntry(createMockSkill("skill-1")),
        createMockSkillEntry(createMockSkill("skill-2")),
      ];

      vi.mocked(refreshSkills).mockResolvedValue({
        success: true,
        previousCount: 0,
        newCount: 2,
        added: ["skill-1", "skill-2"],
        removed: [],
        changed: [],
      });
      vi.mocked(getCachedSkills).mockReturnValue(entries);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 2,
        bySource: { bundled: 2, workspace: 0, unknown: 0 },
        promptVisible: 2,
        userInvocable: 2,
        runtimeVisible: 2,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: entries.map((e) => e.skill),
        prompt: "mock prompt",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      await triggerManualRefresh(mockWorkspaceDir);

      expect(refreshSkills).toHaveBeenCalledTimes(1);
      expect(refreshSkills).toHaveBeenCalledWith(mockWorkspaceDir);
    });

    it("手动刷新后应该更新统计信息", async () => {
      const entries = [createMockSkillEntry(createMockSkill("skill-1"))];

      vi.mocked(refreshSkills).mockResolvedValue({
        success: true,
        previousCount: 0,
        newCount: 1,
        added: ["skill-1"],
        removed: [],
        changed: [],
      });
      vi.mocked(getCachedSkills).mockReturnValue(entries);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 1,
        bySource: { bundled: 1, workspace: 0, unknown: 0 },
        promptVisible: 1,
        userInvocable: 1,
        runtimeVisible: 1,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: entries.map((e) => e.skill),
        prompt: "mock prompt",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      const beforeStats = getSnapshotStats();
      expect(beforeStats.refreshCount).toBe(0);

      await triggerManualRefresh(mockWorkspaceDir);

      const afterStats = getSnapshotStats();
      expect(afterStats.refreshCount).toBe(1);
      expect(afterStats.totalSkills).toBe(1);
      expect(afterStats.eligibleSkills).toBe(1);
      expect(afterStats.lastRefreshAt).toBeGreaterThan(0);
      expect(afterStats.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("应该支持传入 agentId", async () => {
      vi.mocked(refreshSkills).mockResolvedValue({
        success: true,
        previousCount: 0,
        newCount: 0,
        added: [],
        removed: [],
        changed: [],
      });
      vi.mocked(getCachedSkills).mockReturnValue([]);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 0,
        bySource: { bundled: 0, workspace: 0, unknown: 0 },
        promptVisible: 0,
        userInvocable: 0,
        runtimeVisible: 0,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: [],
        prompt: "",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      await triggerManualRefresh(mockWorkspaceDir, "agent-123");

      expect(refreshSkills).toHaveBeenCalledWith(mockWorkspaceDir);
    });
  });

  describe("getSnapshotStats", () => {
    it("初始状态应该返回零值统计", () => {
      const stats = getSnapshotStats();
      expect(stats.lastRefreshAt).toBe(0);
      expect(stats.refreshCount).toBe(0);
      expect(stats.totalSkills).toBe(0);
      expect(stats.eligibleSkills).toBe(0);
      expect(stats.durationMs).toBe(0);
    });

    it("刷新后应该更新统计信息", async () => {
      const entries = [
        createMockSkillEntry(createMockSkill("skill-1")),
        createMockSkillEntry(createMockSkill("skill-2")),
        createMockSkillEntry(createMockSkill("skill-3")),
      ];

      vi.mocked(refreshSkills).mockResolvedValue({
        success: true,
        previousCount: 0,
        newCount: 3,
        added: ["skill-1", "skill-2", "skill-3"],
        removed: [],
        changed: [],
      });
      vi.mocked(getCachedSkills).mockReturnValue(entries);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 3,
        bySource: { bundled: 3, workspace: 0, unknown: 0 },
        promptVisible: 2,
        userInvocable: 3,
        runtimeVisible: 3,
        disabled: 1,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: entries.slice(0, 2).map((e) => e.skill),
        prompt: "mock prompt",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      await triggerManualRefresh(mockWorkspaceDir);

      const stats = getSnapshotStats();
      expect(stats.refreshCount).toBe(1);
      expect(stats.totalSkills).toBe(3);
      expect(stats.eligibleSkills).toBe(2);
    });

    it("返回的统计信息应该是副本而不是引用", () => {
      const stats1 = getSnapshotStats();
      stats1.refreshCount = 999;

      const stats2 = getSnapshotStats();
      expect(stats2.refreshCount).toBe(0);
    });
  });

  describe("getLastSnapshot", () => {
    it("初始状态应该返回 null", () => {
      expect(getLastSnapshot()).toBeNull();
    });

    it("刷新后应该返回快照数据", async () => {
      const entries = [createMockSkillEntry(createMockSkill("skill-1"))];
      const mockSnapshot = {
        skills: entries.map((e) => e.skill),
        prompt: "mock prompt",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      };

      vi.mocked(refreshSkills).mockResolvedValue({
        success: true,
        previousCount: 0,
        newCount: 1,
        added: ["skill-1"],
        removed: [],
        changed: [],
      });
      vi.mocked(getCachedSkills).mockReturnValue(entries);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 1,
        bySource: { bundled: 1, workspace: 0, unknown: 0 },
        promptVisible: 1,
        userInvocable: 1,
        runtimeVisible: 1,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue(mockSnapshot);

      await triggerManualRefresh(mockWorkspaceDir);

      const snapshot = getLastSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot?.skills).toHaveLength(1);
      expect(snapshot?.prompt).toBe("mock prompt");
    });
  });

  describe("并发保护", () => {
    it("上次刷新未完成时应该跳过", async () => {
      let resolveRefresh: ((value: unknown) => void) | null = null;
      const refreshPromise = new Promise((resolve) => {
        resolveRefresh = resolve;
      });

      vi.mocked(refreshSkills).mockReturnValue(
        refreshPromise as Promise<{
          success: boolean;
          previousCount: number;
          newCount: number;
          added: string[];
          removed: string[];
          changed: string[];
        }>,
      );

      const manualPromise = triggerManualRefresh(mockWorkspaceDir);
      await vi.runAllTicks();

      expect(isRefreshing()).toBe(true);

      const secondPromise = triggerManualRefresh(mockWorkspaceDir);
      await vi.runAllTicks();

      expect(refreshSkills).toHaveBeenCalledTimes(1);

      resolveRefresh?.({
        success: true,
        previousCount: 0,
        newCount: 1,
        added: ["skill-1"],
        removed: [],
        changed: [],
      });

      vi.mocked(getCachedSkills).mockReturnValue([
        createMockSkillEntry(createMockSkill("skill-1")),
      ]);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 1,
        bySource: { bundled: 1, workspace: 0, unknown: 0 },
        promptVisible: 1,
        userInvocable: 1,
        runtimeVisible: 1,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: [createMockSkill("skill-1")],
        prompt: "mock",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      await manualPromise;
      await secondPromise;

      expect(isRefreshing()).toBe(false);
    });

    it("刷新完成后应该允许下一次刷新", async () => {
      const entries = [createMockSkillEntry(createMockSkill("skill-1"))];

      vi.mocked(refreshSkills).mockResolvedValue({
        success: true,
        previousCount: 0,
        newCount: 1,
        added: ["skill-1"],
        removed: [],
        changed: [],
      });
      vi.mocked(getCachedSkills).mockReturnValue(entries);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 1,
        bySource: { bundled: 1, workspace: 0, unknown: 0 },
        promptVisible: 1,
        userInvocable: 1,
        runtimeVisible: 1,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: entries.map((e) => e.skill),
        prompt: "mock prompt",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      await triggerManualRefresh(mockWorkspaceDir);
      expect(isRefreshing()).toBe(false);

      await triggerManualRefresh(mockWorkspaceDir);
      expect(refreshSkills).toHaveBeenCalledTimes(2);
    });
  });

  describe("错误处理", () => {
    it("刷新失败时应该记录错误但不中断 cron", async () => {
      const testError = new Error("Test refresh error");
      vi.mocked(refreshSkills).mockRejectedValue(testError);

      await triggerManualRefresh(mockWorkspaceDir);

      expect(getSnapshotStats().refreshCount).toBe(0);
      expect(isRefreshing()).toBe(false);
    });

    it("refreshSkills 返回 success=false 时不应该更新统计", async () => {
      vi.mocked(refreshSkills).mockResolvedValue({
        success: false,
        previousCount: 0,
        newCount: 0,
        added: [],
        removed: [],
        changed: [],
      });

      await triggerManualRefresh(mockWorkspaceDir);

      expect(getSnapshotStats().refreshCount).toBe(0);
      expect(isRefreshing()).toBe(false);
    });

    it("cron 中的错误不应该阻止后续刷新", async () => {
      let callCount = 0;
      vi.mocked(refreshSkills).mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.reject(new Error("First call fails"));
        }
        return Promise.resolve({
          success: true,
          previousCount: 0,
          newCount: 1,
          added: ["skill-1"],
          removed: [],
          changed: [],
        });
      });

      const entries = [createMockSkillEntry(createMockSkill("skill-1"))];
      vi.mocked(getCachedSkills).mockReturnValue(entries);
      vi.mocked(computeSkillStatus).mockReturnValue({
        total: 1,
        bySource: { bundled: 1, workspace: 0, unknown: 0 },
        promptVisible: 1,
        userInvocable: 1,
        runtimeVisible: 1,
        disabled: 0,
      });
      vi.mocked(buildSessionSkillSnapshot).mockReturnValue({
        skills: entries.map((e) => e.skill),
        prompt: "mock prompt",
        version: 1,
        promptFormatVersion: 1,
        createdAt: Date.now(),
      });

      const handle = startSkillSnapshotCron({
        intervalMs: 60_000,
        workspaceDir: mockWorkspaceDir,
      });

      vi.advanceTimersByTime(60_000);
      await vi.runAllTicks();

      expect(callCount).toBe(1);
      expect(getSnapshotStats().refreshCount).toBe(0);

      vi.advanceTimersByTime(60_000);
      await vi.runAllTicks();

      expect(callCount).toBe(2);
      expect(getSnapshotStats().refreshCount).toBe(1);

      handle.stop();
    });
  });
});
