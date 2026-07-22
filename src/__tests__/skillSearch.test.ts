import { describe, it, expect, vi } from "vitest";

import type { SkillEntry } from '../utils/skillRegistry.js';

const mockSkills: SkillEntry[] = [
  { id: "skill-a", name: "入库规划", enabled: true, source: "builtin", metadata: { name: "入库规划", description: "入库规划技能", dependencies: ['core'] } as any, description: "这是入库规划技能的详细描述，包含多个关键词".repeat(2), filePath: '/skills/skill-a/SKILL.md', baseDir: '/skills/skill-a' },
  { id: "skill-b", name: "出库优化", enabled: true, source: "builtin", metadata: {} as any, description: "出库优化描述".repeat(3), filePath: '/skills/skill-b/SKILL.md', baseDir: '/skills/skill-b' },
  { id: "skill-c", name: "库存管理", enabled: false, source: "market", metadata: { name: "库存管理", description: "库存管理技能", dependencies: ['core'], conflicts: ['old'] } as any, description: "库存管理技能的详细描述".repeat(2), filePath: '/skills/skill-c/SKILL.md', baseDir: '/skills/skill-c' },
  { id: "skill-d", name: "数据分析", enabled: true, source: "user", metadata: {} as any, description: "", filePath: '/skills/skill-d/SKILL.md', baseDir: '/skills/skill-d' },
];

vi.mock("../utils/skillRegistry.js", () => ({
  skillRegistry: {
    list: () => mockSkills,
  },
}));

const { SkillSearch } = await import("../utils/skillSearch.js");
const search = new SkillSearch();
search.buildIndex(mockSkills);

describe("SkillSearch", () => {
  describe("search with advanced filters", () => {
    it("应该支持 hasDependencies 过滤", () => {
      const results = search.search("", { hasDependencies: true, limit: 10 });
      expect(results.length).toBe(2);
      expect(results.map((r) => r.skill.id).sort()).toEqual(["skill-a", "skill-c"]);
    });

    it("应该支持 healthFilter=healthy", () => {
      const results = search.search("", { healthFilter: "healthy", limit: 10 });
      // skill-a: desc>=20 + metadata(name+desc) + deps = 40+30+30 = 100 >= 80
      // skill-c: desc>=20 + metadata(name+desc) + deps = 40+30+30 = 100 >= 80
      // skill-b: desc>=20 + metadata(no) + no deps = 40+0+0 = 40 < 80
      expect(results.some((r) => r.skill.id === "skill-a")).toBe(true);
      expect(results.some((r) => r.skill.id === "skill-b")).toBe(false);
    });

    it("应该支持 healthFilter=critical", () => {
      const results = search.search("", { healthFilter: "critical", limit: 10 });
      // skill-d: no desc + no metadata = 0 < 60
      expect(results.some((r) => r.skill.id === "skill-d")).toBe(true);
      expect(results.some((r) => r.skill.id === "skill-a")).toBe(false);
    });

    it("应该支持 sortBy=name", () => {
      const results = search.search("", { sortBy: "name", limit: 10 });
      const names = results.map((r) => r.skill.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "zh-CN")));
    });

    it("应该支持 sortBy=health", () => {
      const results = search.search("", { sortBy: "health", limit: 10 });
      // 按健康度降序
      expect(results[0].skill.id).toBe("skill-a"); // metadata + desc
      expect(results[results.length - 1].skill.id).toBe("skill-d"); // no metadata, no desc
    });

    it("应该支持组合过滤", () => {
      const results = search.search("", {
        hasDependencies: true,
        healthFilter: "healthy",
        enabledOnly: true,
        limit: 10,
      });
      expect(results.length).toBe(1);
      expect(results[0].skill.id).toBe("skill-a");
    });

    it("应该支持模糊搜索", () => {
      const results = search.search("出库", { fuzzy: true, limit: 10 });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.skill.id === "skill-b")).toBe(true);
    });

    it("应该支持 sources 过滤", () => {
      const results = search.search("", { sources: ["builtin"], limit: 10 });
      expect(results.every((r) => r.skill.source === "builtin")).toBe(true);
    });
  });

  describe("autocomplete", () => {
    it("应该返回匹配的技能名称", () => {
      const results = search.autocomplete("入", { limit: 5 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe("skill");
    });
  });
});
