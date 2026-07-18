import { describe, it, expect } from "vitest";
import {
  buildSessionSkillSnapshot,
  snapshotToLegacyFormat,
  snapshotsEqual,
  diffSnapshots,
  getSkillFromSnapshot,
  getSkillNamesFromSnapshot,
} from "../runtime/session-snapshot.js";
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

function createMockSkillEntry(skill: Skill): SkillEntry {
  return {
    skill,
    frontmatter: {},
  };
}

describe("session-snapshot", () => {
  describe("buildSessionSkillSnapshot", () => {
    it("应该从技能列表构建快照", () => {
      const skills = [
        createMockSkill("skill-1"),
        createMockSkill("skill-2"),
      ];
      const entries = skills.map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(entries);
      expect(snapshot.skills).toHaveLength(2);
      expect(snapshot.version).toBeDefined();
      expect(snapshot.createdAt).toBeDefined();
    });

    it("getSkillNamesFromSnapshot 应该按名称排序", () => {
      const skills = [
        createMockSkill("b-skill"),
        createMockSkill("a-skill"),
      ];
      const entries = skills.map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(entries);
      const names = getSkillNamesFromSnapshot(snapshot);
      expect(names[0]).toBe("a-skill");
      expect(names[1]).toBe("b-skill");
    });

    it("应该包含过滤后的值", () => {
      const skills = [createMockSkill("skill-1")];
      const entries = skills.map(createMockSkillEntry);
      const filter = ["skill-1"];
      const snapshot = buildSessionSkillSnapshot(entries, { skillFilter: filter });
      expect(snapshot.skills).toHaveLength(1);
      expect(snapshot.skills[0].name).toBe("skill-1");
    });

    it("应该只包含提示可见的技能", () => {
      const visibleSkill = createMockSkill("visible-skill");
      const hiddenSkill = createMockSkill("hidden-skill", { disableModelInvocation: true });
      const entries = [
        createMockSkillEntry(visibleSkill),
        createMockSkillEntry(hiddenSkill),
      ];
      const snapshot = buildSessionSkillSnapshot(entries);
      expect(snapshot.skills).toHaveLength(1);
      expect(snapshot.skills[0].name).toBe("visible-skill");
    });

    it("应该计算技能数量", () => {
      const skills = [
        createMockSkill("skill-1"),
        createMockSkill("skill-2"),
        createMockSkill("skill-3"),
      ];
      const entries = skills.map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(entries);
      expect(snapshot.skills.length).toBe(3);
    });

    it("includePrompt=false 时应该生成空提示", () => {
      const skills = [createMockSkill("skill-1")];
      const entries = skills.map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(entries, { includePrompt: false });
      expect(snapshot.prompt).toBe("");
    });
  });

  describe("snapshotToLegacyFormat", () => {
    it("应该转换为旧格式", () => {
      const skills = [createMockSkill("skill-1")];
      const entries = skills.map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(entries);
      const legacy = snapshotToLegacyFormat(snapshot);
      expect(Array.isArray(legacy.skills)).toBe(true);
      expect(legacy.skills).toHaveLength(1);
      expect(legacy.skills[0].name).toBe("skill-1");
    });

    it("应该保留重要字段", () => {
      const skills = [createMockSkill("test-skill", { description: "Test desc" })];
      const entries = skills.map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(entries);
      const legacy = snapshotToLegacyFormat(snapshot);
      expect(legacy.resolvedSkills).toBeDefined();
      expect(legacy.resolvedSkills?.[0].description).toBe("Test desc");
      expect(legacy.promptFormatVersion).toBeDefined();
    });
  });

  describe("snapshotsEqual", () => {
    it("相同技能的快照应该相等", () => {
      const skills = [createMockSkill("skill-1")];
      const entries = skills.map(createMockSkillEntry);
      const snapshot1 = buildSessionSkillSnapshot(entries);
      const snapshot2 = buildSessionSkillSnapshot(entries);
      expect(snapshotsEqual(snapshot1, snapshot2)).toBe(true);
    });

    it("不同技能的快照应该不相等", () => {
      const skills1 = [createMockSkill("skill-1")].map(createMockSkillEntry);
      const skills2 = [createMockSkill("skill-2")].map(createMockSkillEntry);
      const snapshot1 = buildSessionSkillSnapshot(skills1);
      const snapshot2 = buildSessionSkillSnapshot(skills2);
      expect(snapshotsEqual(snapshot1, snapshot2)).toBe(false);
    });

    it("不同数量的技能应该不相等", () => {
      const skills1 = [createMockSkill("skill-1")].map(createMockSkillEntry);
      const skills2 = [
        createMockSkill("skill-1"),
        createMockSkill("skill-2"),
      ].map(createMockSkillEntry);
      const snapshot1 = buildSessionSkillSnapshot(skills1);
      const snapshot2 = buildSessionSkillSnapshot(skills2);
      expect(snapshotsEqual(snapshot1, snapshot2)).toBe(false);
    });
  });

  describe("diffSnapshots", () => {
    it("应该检测添加的技能", () => {
      const oldSkills = [createMockSkill("skill-1")].map(createMockSkillEntry);
      const newSkills = [
        createMockSkill("skill-1"),
        createMockSkill("skill-2"),
      ].map(createMockSkillEntry);
      const snapshot1 = buildSessionSkillSnapshot(oldSkills);
      const snapshot2 = buildSessionSkillSnapshot(newSkills);
      const diff = diffSnapshots(snapshot1, snapshot2);
      expect(diff.added).toContain("skill-2");
      expect(diff.removed).toHaveLength(0);
    });

    it("应该检测移除的技能", () => {
      const oldSkills = [
        createMockSkill("skill-1"),
        createMockSkill("skill-2"),
      ].map(createMockSkillEntry);
      const newSkills = [createMockSkill("skill-1")].map(createMockSkillEntry);
      const snapshot1 = buildSessionSkillSnapshot(oldSkills);
      const snapshot2 = buildSessionSkillSnapshot(newSkills);
      const diff = diffSnapshots(snapshot1, snapshot2);
      expect(diff.removed).toContain("skill-2");
      expect(diff.added).toHaveLength(0);
    });

    it("相同的快照应该没有差异", () => {
      const skills = [createMockSkill("skill-1")].map(createMockSkillEntry);
      const snapshot1 = buildSessionSkillSnapshot(skills);
      const snapshot2 = buildSessionSkillSnapshot(skills);
      const diff = diffSnapshots(snapshot1, snapshot2);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });

    it("应该检测 changed 技能", () => {
      const skillV1 = createMockSkill("skill-1", { promptVersion: "1" });
      const skillV2 = createMockSkill("skill-1", { promptVersion: "2" });
      const snapshot1 = buildSessionSkillSnapshot([createMockSkillEntry(skillV1)]);
      const snapshot2 = buildSessionSkillSnapshot([createMockSkillEntry(skillV2)]);
      const diff = diffSnapshots(snapshot1, snapshot2);
      expect(diff.changed).toContain("skill-1");
    });
  });

  describe("getSkillFromSnapshot", () => {
    it("应该按名称查找技能", () => {
      const skills = [createMockSkill("my-skill")].map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(skills);
      const found = getSkillFromSnapshot(snapshot, "my-skill");
      expect(found).toBeDefined();
      expect(found?.name).toBe("my-skill");
    });

    it("应该不区分大小写", () => {
      const skills = [createMockSkill("MySkill")].map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(skills);
      const found = getSkillFromSnapshot(snapshot, "myskill");
      expect(found).toBeDefined();
      expect(found?.name).toBe("MySkill");
    });

    it("未找到时返回 undefined", () => {
      const skills = [createMockSkill("skill-1")].map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(skills);
      const found = getSkillFromSnapshot(snapshot, "nonexistent");
      expect(found).toBeUndefined();
    });
  });

  describe("getSkillNamesFromSnapshot", () => {
    it("应该返回所有技能名称", () => {
      const skills = [
        createMockSkill("skill-1"),
        createMockSkill("skill-2"),
        createMockSkill("skill-3"),
      ].map(createMockSkillEntry);
      const snapshot = buildSessionSkillSnapshot(skills);
      const names = getSkillNamesFromSnapshot(snapshot);
      expect(names).toEqual(["skill-1", "skill-2", "skill-3"]);
    });
  });
});
