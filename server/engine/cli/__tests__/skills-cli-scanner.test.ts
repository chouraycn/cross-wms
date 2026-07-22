import { describe, it, expect } from "vitest";
import { parseSkillMd } from "../skills-cli.scanner.js";

describe("skills-cli.scanner", () => {
  describe("parseSkillMd", () => {
    it("应该解析 YAML frontmatter", () => {
      const md = `---
name: test-skill
description: A test skill
version: 1.0.0
---

# Body content
Here is the body.
`;
      const { frontmatter, body } = parseSkillMd(md);
      expect(frontmatter.name).toBe("test-skill");
      expect(frontmatter.description).toBe("A test skill");
      expect(frontmatter.version).toBe("1.0.0");
      expect(body).toContain("# Body content");
      expect(body).toContain("Here is the body.");
    });

    it("应该将数组字段序列化为 JSON 字符串", () => {
      const md = `---
name: array-skill
tags:
  - tag1
  - tag2
---

body
`;
      const { frontmatter } = parseSkillMd(md);
      expect(frontmatter.name).toBe("array-skill");
      expect(JSON.parse(frontmatter.tags)).toEqual(["tag1", "tag2"]);
    });

    it("应该将对象字段序列化为 JSON 字符串", () => {
      const md = `---
name: obj-skill
metadata:
  category: wms
  level: 3
---

body
`;
      const { frontmatter } = parseSkillMd(md);
      expect(JSON.parse(frontmatter.metadata)).toEqual({ category: "wms", level: 3 });
    });

    it("无 frontmatter 时应返回空 frontmatter 和完整 body", () => {
      const md = `# Just content
No frontmatter here.
`;
      const { frontmatter, body } = parseSkillMd(md);
      expect(frontmatter).toEqual({});
      expect(body).toBe(md);
    });

    it("YAML 解析失败时应优雅降级", () => {
      const md = `---
invalid: [yaml
this is not valid: : :
---

body
`;
      const { frontmatter, body } = parseSkillMd(md);
      // 解析失败时 frontmatter 为空，body 仍可访问
      expect(typeof frontmatter).toBe("object");
      expect(body).toContain("body");
    });

    it("应该支持带 dependencies 数组的技能", () => {
      const md = `---
name: dep-skill
dependencies: '["core", "helper"]'
conflicts: '["old-skill"]'
---

body
`;
      const { frontmatter } = parseSkillMd(md);
      expect(JSON.parse(frontmatter.dependencies)).toEqual(["core", "helper"]);
      expect(JSON.parse(frontmatter.conflicts)).toEqual(["old-skill"]);
    });
  });
});
