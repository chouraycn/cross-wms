import { describe, it, expect } from "vitest";
import {
  buildEnhancedDependencyGraph,
  detectCycles,
  resolveDependencies,
  resolveAndInstall,
  findConflicts,
  suggestResolution,
  formatDependencyGraph,
  generateDependencyDot,
  validateDependencyVersion,
} from "../lifecycle/dependency-enhanced.js";
import type { SkillEntry } from "../types.js";

function makeEntry(
  name: string,
  promptVersion?: string,
  dependencies?: string | Array<{ skill: string; required?: boolean; version?: string; reason?: string }>,
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
      promptVersion,
    },
    frontmatter,
  };
}

describe("dependency-enhanced", () => {
  describe("buildEnhancedDependencyGraph", () => {
    it("应该构建包含节点和边的依赖图", () => {
      const entries = [
        makeEntry("core", "1.0.0"),
        makeEntry("feature-a", "2.1.0", [{ skill: "core", required: true }]),
        makeEntry("feature-b", "3.0.0", [{ skill: "core", required: false }]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);

      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);

      const coreNode = graph.nodes.find((n) => n.skillName === "core");
      expect(coreNode?.version).toBe("1.0.0");
      expect(coreNode?.status).toBe("installed");

      const featureA = graph.nodes.find((n) => n.skillName === "feature-a");
      expect(featureA?.version).toBe("2.1.0");

      const requiresEdge = graph.edges.find((e) => e.type === "requires");
      expect(requiresEdge?.from).toBe("feature-a");
      expect(requiresEdge?.to).toBe("core");

      const recommendsEdge = graph.edges.find((e) => e.type === "recommends");
      expect(recommendsEdge?.from).toBe("feature-b");
      expect(recommendsEdge?.to).toBe("core");
    });

    it("应该标记缺失的依赖为 missing 状态", () => {
      const entries = [
        makeEntry("feature", "1.0.0", [{ skill: "missing-dep", required: true }]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);

      expect(graph.nodes).toHaveLength(2);
      const missingNode = graph.nodes.find((n) => n.skillName === "missing-dep");
      expect(missingNode?.status).toBe("missing");
    });

    it("应该标记冲突的技能为 conflicted 状态", () => {
      const entries = [
        makeEntry("new-system", "2.0.0"),
        makeEntry("old-system", "1.0.0", undefined, [{ skill: "new-system", reason: "功能重复" }]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);

      const newSystem = graph.nodes.find((n) => n.skillName === "new-system");
      const oldSystem = graph.nodes.find((n) => n.skillName === "old-system");
      expect(newSystem?.status).toBe("conflicted");
      expect(oldSystem?.status).toBe("conflicted");
    });

    it("应该支持版本约束", () => {
      const entries = [
        makeEntry("core", "1.0.0"),
        makeEntry("feature", "2.0.0", [{ skill: "core", version: "^1.0.0" }]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);

      const edge = graph.edges.find((e) => e.from === "feature");
      expect(edge?.versionConstraint).toBe("^1.0.0");
    });
  });

  describe("detectCycles", () => {
    it("应该检测增强依赖图中的循环", () => {
      const entries = [
        makeEntry("a", "1.0.0", ["b"]),
        makeEntry("b", "1.0.0", ["c"]),
        makeEntry("c", "1.0.0", ["a"]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);
      const cycles = detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      const cycle = cycles[0];
      expect(cycle).toContain("a");
      expect(cycle).toContain("b");
      expect(cycle).toContain("c");
    });

    it("应该返回空数组当没有循环", () => {
      const entries = [
        makeEntry("core", "1.0.0"),
        makeEntry("feature", "1.0.0", ["core"]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);
      const cycles = detectCycles(graph);

      expect(cycles).toHaveLength(0);
    });

    it("应该检测自依赖", () => {
      const entries = [makeEntry("self-ref", "1.0.0", ["self-ref"])];
      const graph = buildEnhancedDependencyGraph(entries);
      const cycles = detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain("self-ref");
    });
  });

  describe("resolveDependencies", () => {
    it("应该解析完整的依赖链", () => {
      const entries = [
        makeEntry("core", "1.0.0"),
        makeEntry("feature", "2.0.0", [{ skill: "core", reason: "需要核心功能" }]),
        makeEntry("app", "3.0.0", [{ skill: "feature", reason: "需要功能模块" }]),
      ];
      const resolved = resolveDependencies("app", entries);

      expect(resolved?.skillName).toBe("app");
      expect(resolved?.version).toBe("3.0.0");
      expect(resolved?.dependencies).toHaveLength(1);

      const featureDep = resolved?.dependencies[0];
      expect(featureDep?.skillName).toBe("feature");
      expect(featureDep?.reason).toBe("需要功能模块");
      expect(featureDep?.dependencies).toHaveLength(1);

      const coreDep = featureDep?.dependencies[0];
      expect(coreDep?.skillName).toBe("core");
      expect(coreDep?.reason).toBe("需要核心功能");
    });

    it("应该标记缺失的依赖", () => {
      const entries = [
        makeEntry("app", "1.0.0", [{ skill: "missing-dep", required: true }]),
      ];
      const resolved = resolveDependencies("app", entries);

      expect(resolved?.dependencies).toHaveLength(1);
      const missingDep = resolved?.dependencies[0];
      expect(missingDep?.skillName).toBe("missing-dep");
      expect(missingDep?.status).toBe("missing");
    });

    it("应该返回 null 当技能不存在", () => {
      const entries = [makeEntry("core", "1.0.0")];
      const resolved = resolveDependencies("non-existent", entries);

      expect(resolved).toBeNull();
    });
  });

  describe("resolveAndInstall", () => {
    it("应该解析并返回缺失的依赖列表", async () => {
      const entries = [
        makeEntry("app", "1.0.0", [{ skill: "dep1", required: true }, { skill: "dep2", required: true }]),
        makeEntry("dep1", "1.0.0"),
      ];
      const result = await resolveAndInstall("app", entries);

      expect(result.success).toBe(false);
      expect(result.installed).toHaveLength(1);
      expect(result.installed).toContain("dep2");
    });

    it("应该返回成功当所有依赖都满足", async () => {
      const entries = [
        makeEntry("core", "1.0.0"),
        makeEntry("app", "1.0.0", ["core"]),
      ];
      const result = await resolveAndInstall("app", entries);

      expect(result.success).toBe(true);
      expect(result.installed).toHaveLength(0);
    });
  });

  describe("findConflicts", () => {
    it("应该查找依赖冲突", () => {
      const entries = [
        makeEntry("new-system", "2.0.0"),
        makeEntry("old-system", "1.0.0", undefined, [{ skill: "new-system", reason: "功能重复" }]),
      ];
      const conflicts = findConflicts(entries);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].skillA).toBe("old-system");
      expect(conflicts[0].skillB).toBe("new-system");
      expect(conflicts[0].versionA).toBe("1.0.0");
      expect(conflicts[0].versionB).toBe("2.0.0");
      expect(conflicts[0].reason).toBe("功能重复");
    });

    it("应该去重相同的冲突", () => {
      const entries = [
        makeEntry("a", "1.0.0", undefined, [{ skill: "b", reason: "冲突" }]),
        makeEntry("b", "1.0.0", undefined, [{ skill: "a", reason: "冲突" }]),
      ];
      const conflicts = findConflicts(entries);

      expect(conflicts).toHaveLength(1);
    });

    it("应该返回空数组当没有冲突", () => {
      const entries = [
        makeEntry("core", "1.0.0"),
        makeEntry("feature", "1.0.0", ["core"]),
      ];
      const conflicts = findConflicts(entries);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe("suggestResolution", () => {
    it("应该为功能重复冲突提供建议", () => {
      const conflict: { skillA: string; versionA: string; skillB: string; versionB: string; reason: string } = {
        skillA: "old-system",
        versionA: "1.0.0",
        skillB: "new-system",
        versionB: "2.0.0",
        reason: "功能重复",
      };
      const suggestion = suggestResolution(conflict);

      expect(suggestion.suggestions).toHaveLength(3);
      expect(suggestion.preferredAction).toContain("保留");
    });

    it("应该为不兼容冲突提供建议", () => {
      const conflict: { skillA: string; versionA: string; skillB: string; versionB: string; reason: string } = {
        skillA: "plugin-v2",
        versionA: "2.0.0",
        skillB: "core-v1",
        versionB: "1.0.0",
        reason: "API 不兼容",
      };
      const suggestion = suggestResolution(conflict);

      expect(suggestion.suggestions).toHaveLength(3);
      expect(suggestion.preferredAction).toContain("降级");
    });

    it("应该为已弃用冲突提供建议", () => {
      const conflict: { skillA: string; versionA: string; skillB: string; versionB: string; reason: string } = {
        skillA: "deprecated-skill",
        versionA: "1.0.0",
        skillB: "new-skill",
        versionB: "2.0.0",
        reason: "已弃用",
      };
      const suggestion = suggestResolution(conflict);

      expect(suggestion.suggestions).toHaveLength(3);
      expect(suggestion.preferredAction).toContain("卸载");
    });
  });

  describe("formatDependencyGraph", () => {
    it("应该格式化依赖图为可读文本", () => {
      const entries = [
        makeEntry("core", "1.0.0"),
        makeEntry("feature", "2.0.0", ["core"]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);
      const formatted = formatDependencyGraph(graph);

      expect(formatted).toContain("增强依赖图");
      expect(formatted).toContain("core@1.0.0");
      expect(formatted).toContain("feature@2.0.0");
      expect(formatted).toContain("→");
    });

    it("应该包含循环依赖信息", () => {
      const entries = [
        makeEntry("a", "1.0.0", ["b"]),
        makeEntry("b", "1.0.0", ["a"]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);
      const formatted = formatDependencyGraph(graph);

      expect(formatted).toContain("循环依赖");
      expect(formatted).toContain("a → b");
    });
  });

  describe("generateDependencyDot", () => {
    it("应该生成有效的 Graphviz DOT 格式", () => {
      const entries = [
        makeEntry("core", "1.0.0"),
        makeEntry("feature", "2.0.0", ["core"]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);
      const dot = generateDependencyDot(graph);

      expect(dot.startsWith("digraph")).toBe(true);
      expect(dot).toContain('"core"');
      expect(dot).toContain('"feature"');
      expect(dot).toContain("->");
      expect(dot.endsWith("}")).toBe(true);
    });

    it("应该为不同状态的节点生成不同颜色", () => {
      const entries = [
        makeEntry("installed", "1.0.0"),
        makeEntry("missing-ref", "1.0.0", ["missing-dep"]),
      ];
      const graph = buildEnhancedDependencyGraph(entries);
      const dot = generateDependencyDot(graph);

      expect(dot).toContain("#90EE90");
      expect(dot).toContain("#FFB6C1");
    });
  });

  describe("validateDependencyVersion", () => {
    it("应该验证完全匹配的版本", () => {
      const result = validateDependencyVersion("core", "1.0.0", "1.0.0");
      expect(result.valid).toBe(true);
      expect(result.satisfies).toBe(true);
      expect(result.message).toContain("完全匹配");
    });

    it("应该验证 ^ 版本约束", () => {
      let result = validateDependencyVersion("core", "^1.0.0", "1.0.0");
      expect(result.valid).toBe(true);
      expect(result.satisfies).toBe(true);

      result = validateDependencyVersion("core", "^1.0.0", "1.1.0");
      expect(result.valid).toBe(true);
      expect(result.satisfies).toBe(true);

      result = validateDependencyVersion("core", "^1.0.0", "2.0.0");
      expect(result.valid).toBe(false);
      expect(result.satisfies).toBe(false);
      expect(result.message).toContain("主版本不匹配");
    });

    it("应该验证 ~ 版本约束", () => {
      let result = validateDependencyVersion("core", "~1.0.0", "1.0.0");
      expect(result.valid).toBe(true);
      expect(result.satisfies).toBe(true);

      result = validateDependencyVersion("core", "~1.0.0", "1.0.5");
      expect(result.valid).toBe(true);
      expect(result.satisfies).toBe(true);

      result = validateDependencyVersion("core", "~1.0.0", "1.1.0");
      expect(result.valid).toBe(false);
      expect(result.satisfies).toBe(false);
      expect(result.message).toContain("主/次版本不匹配");
    });

    it("应该处理版本过低的情况", () => {
      const result = validateDependencyVersion("core", "2.0.0", "1.0.0");
      expect(result.valid).toBe(false);
      expect(result.satisfies).toBe(false);
      expect(result.message).toContain("版本过低");
    });

    it("应该处理版本高于要求的情况", () => {
      const result = validateDependencyVersion("core", "1.0.0", "2.0.0");
      expect(result.valid).toBe(true);
      expect(result.satisfies).toBe(true);
      expect(result.message).toContain("版本高于要求");
    });

    it("应该处理无效的版本字符串", () => {
      const result = validateDependencyVersion("core", "invalid", "1.0.0");
      expect(result.valid).toBe(true);
      expect(result.satisfies).toBe(true);
      expect(result.message).toContain("版本约束格式无效");
    });
  });
});
