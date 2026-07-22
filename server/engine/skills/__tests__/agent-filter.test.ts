import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Skill, SkillEntry } from "../types.js";
import {
  setAgentFilter,
  getAgentFilter,
  removeAgentFilter,
  clearAllAgentFilters,
  filterSkillsForAgent,
  isSkillVisibleForAgent,
  listAgentVisibleSkills,
  addSkillToAgentWhitelist,
  removeSkillFromAgentWhitelist,
  denySkillForAgent,
  allowSkillForAgent,
  loadAgentFiltersFromFile,
  saveAgentFiltersToFile,
  setAgentFilterConfig,
  getAgentFilterConfig,
  getAgentFilterCount,
} from "../discovery/agent-filter.js";

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

function createMockSkillEntry(
  skill: Skill,
  overrides: Partial<SkillEntry> = {},
): SkillEntry {
  return {
    skill,
    frontmatter: {},
    ...overrides,
  };
}

describe("agent-filter", () => {
  beforeEach(() => {
    clearAllAgentFilters();
    setAgentFilterConfig({ defaultVisibility: "all" });
  });

  afterEach(() => {
    clearAllAgentFilters();
    setAgentFilterConfig({ defaultVisibility: "all" });
  });

  describe("setAgentFilter / getAgentFilter", () => {
    it("应该设置和获取代理过滤器", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a", "skill-b"],
      });

      const filter = getAgentFilter("agent-1");
      expect(filter).toBeDefined();
      expect(filter?.visibility).toBe("whitelist");
      expect(filter?.allowedSkills).toEqual(["skill-a", "skill-b"]);
    });

    it("应该规范化技能名称", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["My Skill", "my_skill", "MY-SKILL"],
      });

      const filter = getAgentFilter("agent-1");
      expect(filter?.allowedSkills).toEqual(["my-skill"]);
    });

    it("应该规范化标签", () => {
      setAgentFilter("agent-1", {
        visibility: "tagged",
        skillTags: ["DevTools", "  testing  ", "PRODUCTION"],
      });

      const filter = getAgentFilter("agent-1");
      expect(filter?.skillTags).toEqual(["devtools", "testing", "production"]);
    });

    it("空 agentId 应该抛出错误", () => {
      expect(() => setAgentFilter("", { visibility: "all" })).toThrow();
      expect(() => setAgentFilter("  ", { visibility: "all" })).toThrow();
    });

    it("应该部分更新现有过滤器", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a"],
        deniedSkills: ["skill-b"],
      });

      setAgentFilter("agent-1", {
        allowedSkills: ["skill-a", "skill-c"],
      });

      const filter = getAgentFilter("agent-1");
      expect(filter?.visibility).toBe("whitelist");
      expect(filter?.allowedSkills).toEqual(["skill-a", "skill-c"]);
      expect(filter?.deniedSkills).toEqual(["skill-b"]);
    });
  });

  describe("removeAgentFilter", () => {
    it("应该移除代理过滤器", () => {
      setAgentFilter("agent-1", { visibility: "all" });
      expect(getAgentFilter("agent-1")).toBeDefined();

      const result = removeAgentFilter("agent-1");
      expect(result).toBe(true);
      expect(getAgentFilter("agent-1")).toBeUndefined();
    });

    it("移除不存在的过滤器返回 false", () => {
      const result = removeAgentFilter("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("clearAllAgentFilters", () => {
    it("应该清除所有代理过滤器", () => {
      setAgentFilter("agent-1", { visibility: "all" });
      setAgentFilter("agent-2", { visibility: "whitelist" });
      expect(getAgentFilterCount()).toBe(2);

      clearAllAgentFilters();
      expect(getAgentFilterCount()).toBe(0);
      expect(getAgentFilter("agent-1")).toBeUndefined();
      expect(getAgentFilter("agent-2")).toBeUndefined();
    });
  });

  describe("visibility = 'all'", () => {
    it("所有技能都应该可见", () => {
      setAgentFilter("agent-1", { visibility: "all" });

      const skillA = createMockSkillEntry(createMockSkill("skill-a"));
      const skillB = createMockSkillEntry(createMockSkill("skill-b"));

      expect(isSkillVisibleForAgent("agent-1", "skill-a", skillA)).toBe(true);
      expect(isSkillVisibleForAgent("agent-1", "skill-b", skillB)).toBe(true);
    });
  });

  describe("visibility = 'whitelist'", () => {
    it("只有白名单中的技能可见", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a", "skill-b"],
      });

      const skillA = createMockSkillEntry(createMockSkill("skill-a"));
      const skillB = createMockSkillEntry(createMockSkill("skill-b"));
      const skillC = createMockSkillEntry(createMockSkill("skill-c"));

      expect(isSkillVisibleForAgent("agent-1", "skill-a", skillA)).toBe(true);
      expect(isSkillVisibleForAgent("agent-1", "skill-b", skillB)).toBe(true);
      expect(isSkillVisibleForAgent("agent-1", "skill-c", skillC)).toBe(false);
    });

    it("应该匹配规范化的技能名称", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["my-skill"],
      });

      const skill = createMockSkillEntry(createMockSkill("My Skill"));
      expect(isSkillVisibleForAgent("agent-1", "My Skill", skill)).toBe(true);
    });
  });

  describe("visibility = 'tagged'", () => {
    it("匹配标签的技能可见", () => {
      setAgentFilter("agent-1", {
        visibility: "tagged",
        skillTags: ["devtools", "testing"],
      });

      const skillA = createMockSkillEntry(createMockSkill("skill-a"), {
        frontmatter: { tags: "devtools, cli" },
      });
      const skillB = createMockSkillEntry(createMockSkill("skill-b"), {
        frontmatter: { tag: "testing" },
      });
      const skillC = createMockSkillEntry(createMockSkill("skill-c"), {
        frontmatter: { tags: "production" },
      });

      expect(isSkillVisibleForAgent("agent-1", "skill-a", skillA)).toBe(true);
      expect(isSkillVisibleForAgent("agent-1", "skill-b", skillB)).toBe(true);
      expect(isSkillVisibleForAgent("agent-1", "skill-c", skillC)).toBe(false);
    });

    it("没有提供 skill 对象时返回 false", () => {
      setAgentFilter("agent-1", {
        visibility: "tagged",
        skillTags: ["devtools"],
      });

      expect(isSkillVisibleForAgent("agent-1", "skill-a")).toBe(false);
    });

    it("标签匹配应该不区分大小写", () => {
      setAgentFilter("agent-1", {
        visibility: "tagged",
        skillTags: ["DEVTOOLS"],
      });

      const skill = createMockSkillEntry(createMockSkill("skill-a"), {
        frontmatter: { tags: "DevTools" },
      });

      expect(isSkillVisibleForAgent("agent-1", "skill-a", skill)).toBe(true);
    });
  });

  describe("deniedSkills 优先级", () => {
    it("deniedSkills 应该优先于 all 可见性", () => {
      setAgentFilter("agent-1", {
        visibility: "all",
        deniedSkills: ["skill-b"],
      });

      const skillA = createMockSkillEntry(createMockSkill("skill-a"));
      const skillB = createMockSkillEntry(createMockSkill("skill-b"));

      expect(isSkillVisibleForAgent("agent-1", "skill-a", skillA)).toBe(true);
      expect(isSkillVisibleForAgent("agent-1", "skill-b", skillB)).toBe(false);
    });

    it("deniedSkills 应该优先于 whitelist 可见性", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a", "skill-b"],
        deniedSkills: ["skill-b"],
      });

      const skillA = createMockSkillEntry(createMockSkill("skill-a"));
      const skillB = createMockSkillEntry(createMockSkill("skill-b"));

      expect(isSkillVisibleForAgent("agent-1", "skill-a", skillA)).toBe(true);
      expect(isSkillVisibleForAgent("agent-1", "skill-b", skillB)).toBe(false);
    });

    it("deniedSkills 应该优先于 tagged 可见性", () => {
      setAgentFilter("agent-1", {
        visibility: "tagged",
        skillTags: ["devtools"],
        deniedSkills: ["skill-a"],
      });

      const skillA = createMockSkillEntry(createMockSkill("skill-a"), {
        frontmatter: { tags: "devtools" },
      });
      const skillB = createMockSkillEntry(createMockSkill("skill-b"), {
        frontmatter: { tags: "devtools" },
      });

      expect(isSkillVisibleForAgent("agent-1", "skill-a", skillA)).toBe(false);
      expect(isSkillVisibleForAgent("agent-1", "skill-b", skillB)).toBe(true);
    });
  });

  describe("filterSkillsForAgent", () => {
    it("应该返回带有可见性信息的过滤结果", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a"],
        deniedSkills: ["skill-c"],
      });

      const skills = [
        createMockSkillEntry(createMockSkill("skill-a")),
        createMockSkillEntry(createMockSkill("skill-b")),
        createMockSkillEntry(createMockSkill("skill-c")),
      ];

      const results = filterSkillsForAgent("agent-1", skills);
      expect(results).toHaveLength(3);
      expect(results[0].visible).toBe(true);
      expect(results[0].reason).toBe("visible");
      expect(results[1].visible).toBe(false);
      expect(results[1].reason).toBe("not-in-whitelist");
      expect(results[2].visible).toBe(false);
      expect(results[2].reason).toBe("denied");
    });

    it("tagged 模式应该返回 tag-mismatch 原因", () => {
      setAgentFilter("agent-1", {
        visibility: "tagged",
        skillTags: ["devtools"],
      });

      const skills = [
        createMockSkillEntry(createMockSkill("skill-a"), {
          frontmatter: { tags: "production" },
        }),
      ];

      const results = filterSkillsForAgent("agent-1", skills);
      expect(results[0].visible).toBe(false);
      expect(results[0].reason).toBe("tag-mismatch");
    });
  });

  describe("listAgentVisibleSkills", () => {
    it("应该只返回可见的技能", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a", "skill-c"],
      });

      const skills = [
        createMockSkillEntry(createMockSkill("skill-a")),
        createMockSkillEntry(createMockSkill("skill-b")),
        createMockSkillEntry(createMockSkill("skill-c")),
      ];

      const visible = listAgentVisibleSkills("agent-1", skills);
      expect(visible).toHaveLength(2);
      expect(visible.map((s) => s.skill.name)).toEqual(["skill-a", "skill-c"]);
    });
  });

  describe("addSkillToAgentWhitelist / removeSkillFromAgentWhitelist", () => {
    it("应该添加技能到白名单", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a"],
      });

      addSkillToAgentWhitelist("agent-1", "skill-b");

      const filter = getAgentFilter("agent-1");
      expect(filter?.allowedSkills).toContain("skill-a");
      expect(filter?.allowedSkills).toContain("skill-b");
    });

    it("添加到白名单应该设置 visibility 为 whitelist", () => {
      addSkillToAgentWhitelist("agent-2", "skill-a");

      const filter = getAgentFilter("agent-2");
      expect(filter?.visibility).toBe("whitelist");
      expect(filter?.allowedSkills).toContain("skill-a");
    });

    it("不应该重复添加相同的技能", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a"],
      });

      addSkillToAgentWhitelist("agent-1", "skill-a");
      addSkillToAgentWhitelist("agent-1", "Skill A");

      const filter = getAgentFilter("agent-1");
      expect(filter?.allowedSkills?.length).toBe(1);
    });

    it("应该从白名单移除技能", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a", "skill-b"],
      });

      const result = removeSkillFromAgentWhitelist("agent-1", "skill-a");
      expect(result).toBe(true);

      const filter = getAgentFilter("agent-1");
      expect(filter?.allowedSkills).toEqual(["skill-b"]);
    });

    it("移除不存在的技能返回 false", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a"],
      });

      const result = removeSkillFromAgentWhitelist("agent-1", "skill-b");
      expect(result).toBe(false);
    });

    it("没有白名单时移除返回 false", () => {
      const result = removeSkillFromAgentWhitelist("nonexistent", "skill-a");
      expect(result).toBe(false);
    });
  });

  describe("denySkillForAgent / allowSkillForAgent", () => {
    it("应该拒绝技能", () => {
      setAgentFilter("agent-1", { visibility: "all" });

      denySkillForAgent("agent-1", "skill-b");

      const filter = getAgentFilter("agent-1");
      expect(filter?.deniedSkills).toContain("skill-b");
    });

    it("拒绝技能应该创建新过滤器", () => {
      denySkillForAgent("agent-2", "skill-a");

      const filter = getAgentFilter("agent-2");
      expect(filter).toBeDefined();
      expect(filter?.deniedSkills).toContain("skill-a");
      expect(filter?.visibility).toBe("all");
    });

    it("不应该重复拒绝相同的技能", () => {
      denySkillForAgent("agent-1", "skill-a");
      denySkillForAgent("agent-1", "Skill A");

      const filter = getAgentFilter("agent-1");
      expect(filter?.deniedSkills?.length).toBe(1);
    });

    it("应该允许被拒绝的技能（从拒绝列表移除）", () => {
      setAgentFilter("agent-1", {
        visibility: "all",
        deniedSkills: ["skill-a", "skill-b"],
      });

      const result = allowSkillForAgent("agent-1", "skill-a");
      expect(result).toBe(true);

      const filter = getAgentFilter("agent-1");
      expect(filter?.deniedSkills).toEqual(["skill-b"]);
    });

    it("允许未被拒绝的技能返回 false", () => {
      setAgentFilter("agent-1", {
        visibility: "all",
        deniedSkills: ["skill-a"],
      });

      const result = allowSkillForAgent("agent-1", "skill-b");
      expect(result).toBe(false);
    });

    it("没有拒绝列表时允许返回 false", () => {
      const result = allowSkillForAgent("nonexistent", "skill-a");
      expect(result).toBe(false);
    });
  });

  describe("默认配置", () => {
    it("默认 visibility 应该是 all", () => {
      expect(getAgentFilterConfig().defaultVisibility).toBe("all");
    });

    it("没有过滤器的代理应该遵循默认可见性", () => {
      const skill = createMockSkillEntry(createMockSkill("skill-a"));
      expect(isSkillVisibleForAgent("unknown-agent", "skill-a", skill)).toBe(true);
    });

    it("设置默认可见性为 tagged 时未知代理不可见", () => {
      setAgentFilterConfig({ defaultVisibility: "tagged" });
      const skill = createMockSkillEntry(createMockSkill("skill-a"));
      expect(isSkillVisibleForAgent("unknown-agent", "skill-a", skill)).toBe(false);
    });
  });

  describe("文件持久化", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-filter-test-"));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("应该保存和加载过滤器", () => {
      setAgentFilter("agent-1", {
        visibility: "whitelist",
        allowedSkills: ["skill-a", "skill-b"],
        deniedSkills: ["skill-c"],
      });
      setAgentFilter("agent-2", {
        visibility: "tagged",
        skillTags: ["devtools", "testing"],
      });

      const filePath = path.join(tempDir, "filters.json");
      saveAgentFiltersToFile(filePath);

      expect(fs.existsSync(filePath)).toBe(true);

      clearAllAgentFilters();
      expect(getAgentFilterCount()).toBe(0);

      const loaded = loadAgentFiltersFromFile(filePath);
      expect(loaded).toBe(true);
      expect(getAgentFilterCount()).toBe(2);

      const filter1 = getAgentFilter("agent-1");
      expect(filter1?.visibility).toBe("whitelist");
      expect(filter1?.allowedSkills).toEqual(["skill-a", "skill-b"]);
      expect(filter1?.deniedSkills).toEqual(["skill-c"]);

      const filter2 = getAgentFilter("agent-2");
      expect(filter2?.visibility).toBe("tagged");
      expect(filter2?.skillTags).toEqual(["devtools", "testing"]);
    });

    it("应该保存和加载默认配置", () => {
      setAgentFilterConfig({ defaultVisibility: "tagged" });

      const filePath = path.join(tempDir, "filters.json");
      saveAgentFiltersToFile(filePath);

      setAgentFilterConfig({ defaultVisibility: "all" });
      expect(getAgentFilterConfig().defaultVisibility).toBe("all");

      loadAgentFiltersFromFile(filePath);
      expect(getAgentFilterConfig().defaultVisibility).toBe("tagged");
    });

    it("加载不存在的文件返回 false", () => {
      const filePath = path.join(tempDir, "nonexistent.json");
      const result = loadAgentFiltersFromFile(filePath);
      expect(result).toBe(false);
    });

    it("加载无效的 JSON 文件返回 false", () => {
      const filePath = path.join(tempDir, "invalid.json");
      fs.writeFileSync(filePath, "not valid json", "utf-8");

      const result = loadAgentFiltersFromFile(filePath);
      expect(result).toBe(false);
    });

    it("应该自动创建目录", () => {
      const filePath = path.join(tempDir, "sub", "dir", "filters.json");
      saveAgentFiltersToFile(filePath);

      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("清除和重置", () => {
    it("clearAllAgentFilters 应该重置所有状态", () => {
      setAgentFilter("agent-1", { visibility: "whitelist", allowedSkills: ["skill-a"] });
      setAgentFilter("agent-2", { visibility: "all", deniedSkills: ["skill-b"] });

      expect(getAgentFilterCount()).toBe(2);

      clearAllAgentFilters();

      expect(getAgentFilterCount()).toBe(0);
      expect(getAgentFilter("agent-1")).toBeUndefined();
      expect(getAgentFilter("agent-2")).toBeUndefined();
    });

    it("多次清除应该是安全的", () => {
      clearAllAgentFilters();
      clearAllAgentFilters();
      expect(getAgentFilterCount()).toBe(0);
    });
  });
});
