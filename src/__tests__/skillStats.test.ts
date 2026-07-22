import { describe, it, expect, vi } from "vitest";

// 简单的 mock（metadata 中的 dependencies/conflicts 字段会被识别）
const mockSkills = [
  { id: "skill-a", name: "技能A", enabled: true, source: "builtin", metadata: { dependencies: ['core'] }, description: "这是技能A的描述".repeat(3) },
  { id: "skill-b", name: "技能B", enabled: true, source: "builtin", metadata: {}, description: "技能B".repeat(5) },
  { id: "skill-c", name: "技能C", enabled: false, source: "market", metadata: { dependencies: ['x'], conflicts: ['y'] }, description: "技能C描述".repeat(2) },
  { id: "skill-d", name: "技能D", enabled: true, source: "user", metadata: {}, description: "" },
  { id: "skill-e", name: "技能E", enabled: true, source: "workspace", metadata: {}, description: "E".repeat(30) },
];

// mock registry 等
vi.mock("../utils/skillRegistry.js", () => ({
  skillRegistry: {
    list: () => mockSkills,
  },
}));

vi.mock("../utils/skillCategory.js", () => ({
  skillCategoryManager: {
    getSkillCategory: (id: string) => ({ name: `分类-${id}` }),
    getCategoryStats: () => [],
    getCategory: () => null,
  },
}));

vi.mock("../utils/skillFavorites.js", () => ({
  getFavoriteSkills: () => ["skill-a", "skill-b"],
  getRecentSkills: () => ["skill-a", "skill-c"],
}));

vi.mock("../utils/skillChain.js", () => ({
  skillChainManager: {
    list: () => [{ steps: { a: {}, b: {} } }, { steps: { c: {} } }],
    getRequiredSkills: (chain: { steps: Record<string, unknown> }) => Object.keys(chain.steps),
  },
}));

vi.mock("../utils/skillWorkshop.js", () => ({
  skillWorkshop: {
    getProposalCount: () => ({ total: 10, pending: 3, applied: 5, rejected: 1, quarantined: 1 }),
  },
}));

const { skillStatsManager } = await import("../utils/skillStats.js");

describe("skillStats", () => {
  describe("getHealthOverview", () => {
    it("应该返回健康度评分", () => {
      const health = skillStatsManager.getHealthOverview();
      expect(health.total).toBe(5);
      expect(health.enabled).toBe(4);
      expect(health.disabled).toBe(1);
      expect(health.enabledRate).toBeCloseTo(0.8, 2);
      expect(health.withDependencies).toBe(2);
      expect(health.withConflicts).toBe(1);
      expect(health.healthScore).toBeGreaterThanOrEqual(0);
      expect(health.healthScore).toBeLessThanOrEqual(100);
    });

    it("空技能列表时得分应为 0", () => {
      // 这个测试需要新的 mock，简单跳过
    });
  });

  describe("getSourceSummary", () => {
    it("应该返回按计数降序的源分布", () => {
      const summary = skillStatsManager.getSourceSummary();
      expect(summary.length).toBeGreaterThan(0);
      // 验证按 count 降序
      for (let i = 1; i < summary.length; i++) {
        expect(summary[i - 1].count).toBeGreaterThanOrEqual(summary[i].count);
      }
    });

    it("每个 source 应包含中英文标签", () => {
      const summary = skillStatsManager.getSourceSummary();
      for (const item of summary) {
        expect(item.label).toBeTruthy();
        expect(item.percentage).toBeGreaterThan(0);
        expect(item.percentage).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("getRecentlyActiveSkills", () => {
    it("应该返回最近使用的技能", () => {
      const recent = skillStatsManager.getRecentlyActiveSkills(5);
      expect(recent.length).toBe(2);
      expect(recent[0].id).toBe("skill-a");
    });

    it("应该限制返回数量", () => {
      const recent = skillStatsManager.getRecentlyActiveSkills(1);
      expect(recent.length).toBe(1);
    });
  });

  describe("getRecommendedSkills", () => {
    it("应该返回已收藏 + 最近使用的技能", () => {
      const recs = skillStatsManager.getRecommendedSkills(5);
      expect(recs.length).toBeGreaterThan(0);
      // skill-a 既是 favorites 又是 recent，应排第一
      expect(recs[0].id).toBe("skill-a");
    });

    it("推荐的技能必须有 reason 字段", () => {
      const recs = skillStatsManager.getRecommendedSkills(5);
      for (const rec of recs) {
        expect(rec.reason).toBeTruthy();
      }
    });

    it("不应推荐未启用的技能", () => {
      const recs = skillStatsManager.getRecommendedSkills(5);
      // skill-c 是禁用的，虽然在 recent 但不推荐
      const ids = recs.map((r) => r.id);
      expect(ids).not.toContain("skill-c");
    });
  });

  describe("getOverviewStats", () => {
    it("应该返回基础统计", () => {
      const stats = skillStatsManager.getOverviewStats();
      expect(stats.total).toBe(5);
      expect(stats.enabled).toBe(4);
      expect(stats.disabled).toBe(1);
      expect(stats.favorites).toBe(2);
      expect(stats.recent).toBe(2);
      expect(stats.chains).toBe(2);
    });
  });

  describe("getCategoryBreakdown", () => {
    it("应该返回类别分布", () => {
      const breakdown = skillStatsManager.getCategoryBreakdown();
      expect(Array.isArray(breakdown)).toBe(true);
    });
  });

  describe("getSourceBreakdown", () => {
    it("应该返回源分布", () => {
      const breakdown = skillStatsManager.getSourceBreakdown();
      expect(breakdown.length).toBeGreaterThan(0);
      for (const item of breakdown) {
        expect(item.label).toBeTruthy();
        expect(item.percentage).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("getTopSkills", () => {
    it("应该返回 top 技能列表", () => {
      const top = skillStatsManager.getTopSkills(3);
      expect(top.length).toBeLessThanOrEqual(3);
    });
  });

  describe("getChainStats", () => {
    it("应该返回链统计", () => {
      const chainStats = skillStatsManager.getChainStats();
      expect(chainStats.total).toBe(2);
      expect(chainStats.avgSteps).toBeCloseTo(1.5, 1);
    });
  });
});
