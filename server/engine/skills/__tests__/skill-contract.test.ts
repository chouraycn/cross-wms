import { describe, it, expect } from "vitest";
import { formatSkillsForPrompt, resolveSkillKey, resolveSkillSource } from "../loading/skill-contract.js";
import type { Skill } from "../types.js";

function createMockSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: "test-skill",
    description: "A test skill",
    filePath: "/skills/test-skill/SKILL.md",
    baseDir: "/skills/test-skill",
    source: "bundled",
    disableModelInvocation: false,
    ...overrides,
  };
}

describe("skill-contract", () => {
  describe("formatSkillsForPrompt", () => {
    it("空技能列表返回空字符串", () => {
      const result = formatSkillsForPrompt([]);
      expect(result).toBe("");
    });

    it("应该生成有效的 XML 格式", () => {
      const skill = createMockSkill();
      const result = formatSkillsForPrompt([skill]);
      expect(result).toContain("<available_skills>");
      expect(result).toContain("</available_skills>");
      expect(result).toContain("<skill>");
      expect(result).toContain("</skill>");
      expect(result).toContain("<name>test-skill</name>");
    });

    it("应该转义 XML 特殊字符", () => {
      const skill = createMockSkill({
        name: "test & skill",
        description: "A <b>bold</b> description",
      });
      const result = formatSkillsForPrompt([skill]);
      expect(result).toContain("test &amp; skill");
      expect(result).toContain("&lt;b&gt;");
    });

    it("应该包含多个技能", () => {
      const skills = [
        createMockSkill({ name: "skill-1", description: "First skill" }),
        createMockSkill({ name: "skill-2", description: "Second skill" }),
      ];
      const result = formatSkillsForPrompt(skills);
      expect(result).toContain("skill-1");
      expect(result).toContain("skill-2");
    });

    it("应该包含 promptVersion", () => {
      const skill = createMockSkill({ promptVersion: "1.0.0" });
      const result = formatSkillsForPrompt([skill]);
      expect(result).toContain("<version>1.0.0</version>");
    });
  });

  describe("resolveSkillKey", () => {
    it("应该从元数据返回 skillKey", () => {
      const skill = createMockSkill();
      expect(resolveSkillKey(skill, { skillKey: "custom-key" })).toBe("custom-key");
    });

    it("没有元数据时返回技能名称", () => {
      const skill = createMockSkill();
      expect(resolveSkillKey(skill)).toBe("test-skill");
    });

    it("元数据没有 skillKey 时返回名称", () => {
      const skill = createMockSkill();
      expect(resolveSkillKey(skill, {})).toBe("test-skill");
    });
  });

  describe("resolveSkillSource", () => {
    it("应该返回 bundled 来源", () => {
      const skill = createMockSkill({ source: "bundled" });
      expect(resolveSkillSource(skill)).toBe("bundled");
    });

    it("应该返回 workspace 来源", () => {
      const skill = createMockSkill({ source: "workspace" });
      expect(resolveSkillSource(skill)).toBe("workspace");
    });

    it("应该返回 unknown 来源", () => {
      const skill = createMockSkill({ source: "unknown" });
      expect(resolveSkillSource(skill)).toBe("unknown");
    });
  });
});
