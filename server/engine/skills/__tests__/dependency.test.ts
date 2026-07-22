import { describe, it, expect } from "vitest";
import {
  parseDependencyConfig,
  buildDependencyGraph,
  detectCycles,
  checkDependencies,
  checkAllDependencies,
  sortByDependencies,
  formatDependencyResult,
  generateDependencyReport,
} from "../lifecycle/dependency.js";
import type { SkillEntry } from "../types.js";

function makeEntry(
  name: string,
  dependencies?: string | Array<{ skill: string; required?: boolean; reason?: string }>,
  conflicts?: string | Array<{ skill: string; reason: string }>
): SkillEntry {
  const frontmatter: Record<string, string> = {};
  if (dependencies) {
    frontmatter.dependencies =
      typeof dependencies === "string" ? dependencies : JSON.stringify(dependencies);
  }
  if (conflicts) {
    frontmatter.conflicts =
      typeof conflicts === "string" ? conflicts : JSON.stringify(conflicts);
  }
  return {
    skill: {
      name,
      description: `${name} description`,
      filePath: `/skills/${name}/SKILL.md`,
      baseDir: `/skills/${name}`,
      source: "bundled",
      disableModelInvocation: false,
    },
    frontmatter,
  };
}

describe("dependency", () => {
  describe("parseDependencyConfig", () => {
    it("应该解析字符串格式的依赖", () => {
      const entry = makeEntry("test-skill", '["dep1", "dep2"]');
      const config = parseDependencyConfig(entry);
      expect(config.dependsOn).toHaveLength(2);
      expect(config.dependsOn![0]).toEqual({ skill: "dep1", required: true });
      expect(config.dependsOn![1]).toEqual({ skill: "dep2", required: true });
    });

    it("应该解析对象格式的依赖", () => {
      const entry = makeEntry("test-skill", [
        { skill: "dep1", required: true, reason: "需要基础功能" },
        { skill: "dep2", required: false, reason: "增强功能" },
      ]);
      const config = parseDependencyConfig(entry);
      expect(config.dependsOn).toHaveLength(2);
      expect(config.dependsOn![0]).toEqual({
        skill: "dep1",
        required: true,
        reason: "需要基础功能",
      });
      expect(config.dependsOn![1]).toEqual({
        skill: "dep2",
        required: false,
        reason: "增强功能",
      });
    });

    it("应该解析冲突声明", () => {
      const entry = makeEntry("test-skill", undefined, [
        { skill: "old-system", reason: "功能重复", suggestion: "卸载 old-system" },
      ]);
      const config = parseDependencyConfig(entry);
      expect(config.conflictsWith).toHaveLength(1);
      expect(config.conflictsWith![0]).toEqual({
        skill: "old-system",
        reason: "功能重复",
        suggestion: "卸载 old-system",
      });
    });

    it("空技能应该返回空配置", () => {
      const entry = makeEntry("test-skill");
      const config = parseDependencyConfig(entry);
      expect(config.dependsOn).toBeUndefined();
      expect(config.conflictsWith).toBeUndefined();
    });

    it("应该优雅处理无效的 JSON", () => {
      const entry = makeEntry("test-skill", "invalid json");
      const config = parseDependencyConfig(entry);
      expect(config.dependsOn).toBeUndefined();
    });
  });

  describe("buildDependencyGraph", () => {
    it("应该构建正确的依赖图", () => {
      const entries = [
        makeEntry("core"),
        makeEntry("feature-a", ["core"]),
        makeEntry("feature-b", ["core"]),
        makeEntry("app", ["feature-a", "feature-b"]),
      ];
      const graph = buildDependencyGraph(entries);

      expect(graph.get("core")!.depth).toBe(0);
      expect(graph.get("feature-a")!.depth).toBe(1);
      expect(graph.get("feature-b")!.depth).toBe(1);
      expect(graph.get("app")!.depth).toBe(2);

      expect(graph.get("feature-a")!.dependencies).toHaveLength(1);
      expect(graph.get("feature-a")!.dependencies[0].skill.skill.name).toBe("core");

      expect(graph.get("core")!.dependents).toHaveLength(2);
    });

    it("孤立技能深度为 0", () => {
      const entries = [makeEntry("standalone")];
      const graph = buildDependencyGraph(entries);
      expect(graph.get("standalone")!.depth).toBe(0);
    });

    it("应该处理缺失的依赖（不存在的技能）", () => {
      const entries = [
        makeEntry("feature-a", ["missing-dep"]),
      ];
      const graph = buildDependencyGraph(entries);
      expect(graph.get("feature-a")!.dependencies).toHaveLength(0);
    });
  });

  describe("detectCycles", () => {
    it("应该检测循环依赖", () => {
      const entries = [
        makeEntry("a", ["b"]),
        makeEntry("b", ["c"]),
        makeEntry("c", ["a"]),
      ];
      const cycles = detectCycles(entries);
      expect(cycles.length).toBeGreaterThan(0);
      // 循环应该包含 a, b, c
      const cycle = cycles[0];
      expect(cycle).toContain("a");
      expect(cycle).toContain("b");
      expect(cycle).toContain("c");
    });

    it("应该返回空数组当没有循环", () => {
      const entries = [
        makeEntry("core"),
        makeEntry("feature-a", ["core"]),
        makeEntry("feature-b", ["core"]),
      ];
      const cycles = detectCycles(entries);
      expect(cycles).toHaveLength(0);
    });

    it("应该检测自依赖", () => {
      const entries = [makeEntry("self-ref", ["self-ref"])];
      const cycles = detectCycles(entries);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain("self-ref");
    });

    it("应该去重相同的循环", () => {
      const entries = [
        makeEntry("a", ["b"]),
        makeEntry("b", ["a"]),
      ];
      const cycles = detectCycles(entries);
      // a->b->a 和 b->a->b 是同一个循环，应该只保留一个
      expect(cycles).toHaveLength(1);
    });
  });

  describe("checkDependencies", () => {
    it("应该通过没有依赖的技能检查", () => {
      const entries = [makeEntry("standalone")];
      const result = checkDependencies(entries[0], entries);
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
      expect(result.cycles).toHaveLength(0);
    });

    it("应该检测缺失的必需依赖", () => {
      const entries = [makeEntry("feature-a", ["missing-dep"])];
      const result = checkDependencies(entries[0], entries);
      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].skill).toBe("missing-dep");
    });

    it("不应该将可选依赖标记为缺失", () => {
      const entries = [
        makeEntry("feature-a", [{ skill: "optional-dep", required: false }]),
      ];
      const result = checkDependencies(entries[0], entries);
      expect(result.missing).toHaveLength(0);
      expect(result.optionalMissing).toHaveLength(1);
      expect(result.valid).toBe(true); // 可选依赖不影响有效性
    });

    it("应该检测冲突", () => {
      const entries = [
        makeEntry("new-system"),
        makeEntry("old-system", undefined, [{ skill: "new-system", reason: "不兼容" }]),
      ];
      const result = checkDependencies(entries[1], entries);
      expect(result.valid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].skill).toBe("new-system");
    });

    it("应该检测循环依赖", () => {
      const entries = [
        makeEntry("a", ["b"]),
        makeEntry("b", ["a"]),
      ];
      const result = checkDependencies(entries[0], entries);
      expect(result.cycles.length).toBeGreaterThan(0);
      expect(result.valid).toBe(false);
    });

    it("满足所有依赖时应该通过", () => {
      const entries = [
        makeEntry("core"),
        makeEntry("feature-a", ["core"]),
      ];
      const result = checkDependencies(entries[1], entries);
      expect(result.valid).toBe(true);
    });
  });

  describe("checkAllDependencies", () => {
    it("应该返回所有技能的检查结果", () => {
      const entries = [
        makeEntry("core"),
        makeEntry("feature-a", ["core"]),
        makeEntry("feature-b", ["missing"]),
      ];
      const results = checkAllDependencies(entries);
      expect(results.size).toBe(3);
      expect(results.get("core")!.valid).toBe(true);
      expect(results.get("feature-a")!.valid).toBe(true);
      expect(results.get("feature-b")!.valid).toBe(false);
    });
  });

  describe("sortByDependencies", () => {
    it("应该按依赖深度排序（基础依赖在前）", () => {
      const entries = [
        makeEntry("app", ["feature"]),
        makeEntry("feature", ["core"]),
        makeEntry("core"),
      ];
      const sorted = sortByDependencies(entries);
      expect(sorted[0].skill.name).toBe("core");
      expect(sorted[1].skill.name).toBe("feature");
      expect(sorted[2].skill.name).toBe("app");
    });

    it("不应该改变独立技能的相对顺序", () => {
      const entries = [makeEntry("b"), makeEntry("a"), makeEntry("c")];
      const sorted = sortByDependencies(entries);
      // 所有深度为 0，按原顺序
      expect(sorted.map((e) => e.skill.name)).toEqual(["b", "a", "c"]);
    });
  });

  describe("formatDependencyResult", () => {
    it("应该格式化有效的结果", () => {
      const result = {
        valid: true,
        missing: [],
        conflicts: [],
        optionalMissing: [],
        cycles: [],
      };
      const text = formatDependencyResult("test-skill", result);
      expect(text).toContain("test-skill");
      expect(text).toContain("✅");
    });

    it("应该格式化包含缺失依赖的结果", () => {
      const result = {
        valid: false,
        missing: [{ skill: "dep1", required: true, reason: "需要基础功能" }],
        conflicts: [],
        optionalMissing: [],
        cycles: [],
      };
      const text = formatDependencyResult("test-skill", result);
      expect(text).toContain("❌");
      expect(text).toContain("dep1");
      expect(text).toContain("需要基础功能");
    });

    it("应该格式化包含冲突的结果", () => {
      const result = {
        valid: false,
        missing: [],
        conflicts: [
          { skill: "old-system", reason: "功能重复", suggestion: "卸载旧系统" },
        ],
        optionalMissing: [],
        cycles: [],
      };
      const text = formatDependencyResult("test-skill", result);
      expect(text).toContain("old-system");
      expect(text).toContain("功能重复");
      expect(text).toContain("卸载旧系统");
    });

    it("应该格式化包含循环依赖的结果", () => {
      const result = {
        valid: false,
        missing: [],
        conflicts: [],
        optionalMissing: [],
        cycles: [["a", "b", "c"]],
      };
      const text = formatDependencyResult("test-skill", result);
      expect(text).toContain("a → b → c");
    });
  });

  describe("generateDependencyReport", () => {
    it("应该生成完整的依赖报告", () => {
      const entries = [
        makeEntry("core"),
        makeEntry("feature-a", ["core"]),
        makeEntry("feature-b", [{ skill: "optional", required: false }]),
      ];
      const report = generateDependencyReport(entries);
      expect(report).toContain("技能总数: 3");
      expect(report).toContain("依赖声明: 2");
      expect(report).toContain("✅");
    });

    it("应该在报告中列出问题技能", () => {
      const entries = [
        makeEntry("feature-a", ["missing-dep"]),
      ];
      const report = generateDependencyReport(entries);
      expect(report).toContain("⚠️");
      expect(report).toContain("feature-a");
    });

    it("应该按层级列出技能", () => {
      const entries = [
        makeEntry("core"),
        makeEntry("feature", ["core"]),
      ];
      const report = generateDependencyReport(entries);
      expect(report).toContain("依赖层级:");
      expect(report).toContain("层级 0:");
      expect(report).toContain("层级 1:");
    });
  });
});
