import { describe, it, expect } from "vitest";
import {
  buildSkillIndexEntries,
  isSkillRuntimeVisible,
  isSkillPromptVisible,
  isSkillUserInvocable,
  filterPromptVisibleSkillEntries,
  filterUserInvocableSkillEntries,
  findSkillByNormalizedName,
  searchSkills,
} from "../discovery/skill-index.js";
import { normalizeSkillName } from "../discovery/filter.js";
import type { Skill, SkillEntry } from "../types.js";

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

describe("skill-index", () => {
  describe("isSkillRuntimeVisible", () => {
    it("默认技能应该在运行时可见", () => {
      const skill = createMockSkill("test-skill");
      const entry = createMockSkillEntry(skill);
      expect(isSkillRuntimeVisible(entry)).toBe(true);
    });

    it("exposure 设置为 false 时不可见", () => {
      const skill = createMockSkill("test-skill");
      const entry = createMockSkillEntry(skill, {
        exposure: {
          includeInRuntimeRegistry: false,
          includeInAvailableSkillsPrompt: false,
          userInvocable: true,
        },
      });
      expect(isSkillRuntimeVisible(entry)).toBe(false);
    });
  });

  describe("isSkillPromptVisible", () => {
    it("默认技能应该在提示中可见", () => {
      const skill = createMockSkill("test-skill");
      const entry = createMockSkillEntry(skill);
      expect(isSkillPromptVisible(entry)).toBe(true);
    });

    it("禁用模型调用的技能不应该在提示中可见", () => {
      const skill = createMockSkill("test-skill", { disableModelInvocation: true });
      const entry = createMockSkillEntry(skill);
      expect(isSkillPromptVisible(entry)).toBe(false);
    });

    it("exposure 设置应该优先", () => {
      const skill = createMockSkill("test-skill", { disableModelInvocation: true });
      const entry = createMockSkillEntry(skill, {
        exposure: {
          includeInRuntimeRegistry: true,
          includeInAvailableSkillsPrompt: true,
          userInvocable: true,
        },
      });
      expect(isSkillPromptVisible(entry)).toBe(true);
    });
  });

  describe("isSkillUserInvocable", () => {
    it("默认技能应该是用户可调用的", () => {
      const skill = createMockSkill("test-skill");
      const entry = createMockSkillEntry(skill);
      expect(isSkillUserInvocable(entry)).toBe(true);
    });

    it("设置为不可调用时应该返回 false", () => {
      const skill = createMockSkill("test-skill");
      const entry = createMockSkillEntry(skill, {
        invocation: {
          userInvocable: false,
          disableModelInvocation: false,
        },
      });
      expect(isSkillUserInvocable(entry)).toBe(false);
    });
  });

  describe("buildSkillIndexEntries", () => {
    it("应该构建索引条目", () => {
      const skill = createMockSkill("test-skill");
      const entry = createMockSkillEntry(skill);
      const entries = buildSkillIndexEntries([entry]);
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe("test-skill");
      expect(entries[0].normalizedName).toBe(normalizeSkillName("test-skill"));
      expect(entries[0].bundled).toBe(true);
    });

    it("应该设置正确的可见性标志", () => {
      const visibleSkill = createMockSkill("visible-skill");
      const hiddenSkill = createMockSkill("hidden-skill", { disableModelInvocation: true });
      const entries = buildSkillIndexEntries([
        createMockSkillEntry(visibleSkill),
        createMockSkillEntry(hiddenSkill),
      ]);
      const visible = entries.find(e => e.name === "visible-skill")!;
      const hidden = entries.find(e => e.name === "hidden-skill")!;

      expect(visible.promptVisible).toBe(true);
      expect(visible.runtimeVisible).toBe(true);

      expect(hidden.promptVisible).toBe(false);
      expect(hidden.runtimeVisible).toBe(true);
    });

    it("应该正确设置 source 字段", () => {
      const bundledSkill = createMockSkill("bundled-skill", { source: "bundled" });
      const workspaceSkill = createMockSkill("workspace-skill", { source: "workspace" });
      const entries = buildSkillIndexEntries([
        createMockSkillEntry(bundledSkill),
        createMockSkillEntry(workspaceSkill),
      ]);
      expect(entries.find(e => e.name === "bundled-skill")!.bundled).toBe(true);
      expect(entries.find(e => e.name === "workspace-skill")!.bundled).toBe(false);
    });
  });

  describe("filterPromptVisibleSkillEntries", () => {
    it("应该只返回提示可见的条目", () => {
      const visibleSkill = createMockSkill("visible-skill");
      const hiddenSkill = createMockSkill("hidden-skill", { disableModelInvocation: true });
      const entries = [
        createMockSkillEntry(visibleSkill),
        createMockSkillEntry(hiddenSkill),
      ];
      const filtered = filterPromptVisibleSkillEntries(entries);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].skill.name).toBe("visible-skill");
    });
  });

  describe("filterUserInvocableSkillEntries", () => {
    it("应该只返回用户可调用的条目", () => {
      const invocableSkill = createMockSkill("invocable-skill");
      const notInvocableSkill = createMockSkill("not-invocable");
      const entries = [
        createMockSkillEntry(invocableSkill),
        createMockSkillEntry(notInvocableSkill, {
          invocation: { userInvocable: false, disableModelInvocation: false },
        }),
      ];
      const filtered = filterUserInvocableSkillEntries(entries);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].skill.name).toBe("invocable-skill");
    });
  });

  describe("findSkillByNormalizedName", () => {
    it("应该通过规范化名称查找技能", () => {
      const skill1 = createMockSkill("MySkill");
      const skill2 = createMockSkill("AnotherSkill");
      const entries = buildSkillIndexEntries([
        createMockSkillEntry(skill1),
        createMockSkillEntry(skill2),
      ]);
      const found = findSkillByNormalizedName(entries, "myskill");
      expect(found).toBeDefined();
      expect(found?.name).toBe("MySkill");
    });

    it("未找到时返回 undefined", () => {
      const skill = createMockSkill("skill-1");
      const entries = buildSkillIndexEntries([createMockSkillEntry(skill)]);
      const found = findSkillByNormalizedName(entries, "nonexistent");
      expect(found).toBeUndefined();
    });
  });

  describe("searchSkills", () => {
    it("应该按名称搜索技能", () => {
      const skill1 = createMockSkill("typescript-helper");
      const skill2 = createMockSkill("python-helper");
      const skill3 = createMockSkill("javascript-lint");
      const entries = buildSkillIndexEntries([
        createMockSkillEntry(skill1),
        createMockSkillEntry(skill2),
        createMockSkillEntry(skill3),
      ]);
      const results = searchSkills(entries, "helper");
      expect(results.length).toBe(2);
      expect(results.map(r => r.name)).toContain("typescript-helper");
      expect(results.map(r => r.name)).toContain("python-helper");
    });

    it("应该按描述搜索", () => {
      const skill1 = createMockSkill("skill-1", { description: "A coding helper for TypeScript" });
      const skill2 = createMockSkill("skill-2", { description: "Something else entirely" });
      const entries = buildSkillIndexEntries([
        createMockSkillEntry(skill1),
        createMockSkillEntry(skill2),
      ]);
      const results = searchSkills(entries, "coding");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("skill-1");
    });

    it("空查询应该返回所有结果", () => {
      const skill1 = createMockSkill("skill-1");
      const skill2 = createMockSkill("skill-2");
      const entries = buildSkillIndexEntries([
        createMockSkillEntry(skill1),
        createMockSkillEntry(skill2),
      ]);
      const results = searchSkills(entries, "");
      expect(results.length).toBe(2);
    });
  });
});
