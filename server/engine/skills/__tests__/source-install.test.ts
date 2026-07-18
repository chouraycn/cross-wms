import { describe, it, expect } from "vitest";
import { validateSkillName } from "../lifecycle/source-install.js";

describe("source-install", () => {
  describe("validateSkillName", () => {
    it("应该接受有效的技能名称", () => {
      expect(validateSkillName("my-skill").valid).toBe(true);
      expect(validateSkillName("test123").valid).toBe(true);
      expect(validateSkillName("my-awesome-skill").valid).toBe(true);
      expect(validateSkillName("my_skill").valid).toBe(true);
    });

    it("应该拒绝包含空格的名称", () => {
      expect(validateSkillName("my skill").valid).toBe(false);
    });

    it("应该拒绝包含特殊字符的名称", () => {
      expect(validateSkillName("my@skill").valid).toBe(false);
      expect(validateSkillName("my#skill").valid).toBe(false);
      expect(validateSkillName("my$skill").valid).toBe(false);
    });

    it("应该拒绝空名称", () => {
      expect(validateSkillName("").valid).toBe(false);
      expect(validateSkillName("   ").valid).toBe(false);
    });

    it("应该拒绝以连字符或下划线开头的名称", () => {
      expect(validateSkillName("-myskill").valid).toBe(false);
      expect(validateSkillName("_myskill").valid).toBe(false);
    });

    it("应该拒绝以连字符或下划线结尾的名称", () => {
      expect(validateSkillName("myskill-").valid).toBe(false);
      expect(validateSkillName("myskill_").valid).toBe(false);
    });

    it("应该拒绝包含路径分隔符的名称", () => {
      expect(validateSkillName("my/skill").valid).toBe(false);
      expect(validateSkillName("my\\skill").valid).toBe(false);
    });

    it("应该拒绝包含点号的名称", () => {
      expect(validateSkillName("my.skill").valid).toBe(false);
    });

    it("应该拒绝太短的名称", () => {
      expect(validateSkillName("a").valid).toBe(false);
    });

    it("应该返回错误消息", () => {
      const result = validateSkillName("");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    });
  });
});
