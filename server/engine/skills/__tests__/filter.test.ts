import { describe, it, expect } from "vitest";
import {
  normalizeSkillFilter,
  normalizeSkillFilterForComparison,
  matchesSkillFilter,
  skillMatchesFilter,
  normalizeSkillName,
} from "../discovery/filter.js";

describe("filter", () => {
  describe("normalizeSkillName", () => {
    it("应该转换为小写", () => {
      expect(normalizeSkillName("MySkill")).toBe("myskill");
    });

    it("应该将空格和下划线替换为连字符", () => {
      expect(normalizeSkillName("my skill name")).toBe("my-skill-name");
      expect(normalizeSkillName("my_skill_name")).toBe("my-skill-name");
      expect(normalizeSkillName("my/skill/name")).toBe("my-skill-name");
    });

    it("应该移除特殊字符", () => {
      expect(normalizeSkillName("my@skill#name!")).toBe("myskillname");
    });

    it("应该折叠连续的连字符", () => {
      expect(normalizeSkillName("my--skill")).toBe("my-skill");
    });

    it("应该修剪前后的连字符", () => {
      expect(normalizeSkillName("-my-skill-")).toBe("my-skill");
    });

    it("应该处理空字符串", () => {
      expect(normalizeSkillName("")).toBe("");
      expect(normalizeSkillName("   ")).toBe("");
    });
  });

  describe("normalizeSkillFilter", () => {
    it("当未定义时返回 undefined", () => {
      expect(normalizeSkillFilter(undefined)).toBeUndefined();
    });

    it("应该过滤掉非字符串值", () => {
      const result = normalizeSkillFilter(["skill1", 123, "skill2", null, "skill3"]);
      expect(result).toEqual(["skill1", "skill2", "skill3"]);
    });

    it("应该修剪空白字符", () => {
      const result = normalizeSkillFilter(["  skill1  ", "skill2"]);
      expect(result).toEqual(["skill1", "skill2"]);
    });

    it("应该过滤掉空字符串", () => {
      const result = normalizeSkillFilter(["skill1", "", "skill2", "  "]);
      expect(result).toEqual(["skill1", "skill2"]);
    });
  });

  describe("normalizeSkillFilterForComparison", () => {
    it("应该去重并排序", () => {
      const result = normalizeSkillFilterForComparison(["c", "a", "b", "a", "c"]);
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("当未定义时返回 undefined", () => {
      expect(normalizeSkillFilterForComparison(undefined)).toBeUndefined();
    });
  });

  describe("matchesSkillFilter", () => {
    it("应该检测相等的过滤器", () => {
      expect(matchesSkillFilter(["a", "b"], ["b", "a"])).toBe(true);
    });

    it("应该检测不同的过滤器", () => {
      expect(matchesSkillFilter(["a", "b"], ["a", "c"])).toBe(false);
    });

    it("应该处理 undefined 情况", () => {
      expect(matchesSkillFilter(undefined, undefined)).toBe(true);
      expect(matchesSkillFilter(["a"], undefined)).toBe(false);
      expect(matchesSkillFilter(undefined, ["a"])).toBe(false);
    });
  });

  describe("skillMatchesFilter", () => {
    it("当过滤器未定义时返回 true", () => {
      expect(skillMatchesFilter("my-skill", undefined)).toBe(true);
    });

    it("当过滤器为空时返回 true", () => {
      expect(skillMatchesFilter("my-skill", [])).toBe(true);
    });

    it("应该匹配规范化的名称", () => {
      expect(skillMatchesFilter("MySkill", ["myskill"])).toBe(true);
      expect(skillMatchesFilter("my_skill", ["my-skill"])).toBe(true);
    });

    it("当不匹配时返回 false", () => {
      expect(skillMatchesFilter("my-skill", ["other-skill"])).toBe(false);
    });
  });
});
