import { describe, it, expect } from "vitest";
import { parseFrontmatter, resolveSkillInvocationPolicy, resolveSkillMetadata, parseInstallSpec } from "../loading/frontmatter.js";

describe("frontmatter", () => {
  describe("parseFrontmatter", () => {
    it("应该解析基本的 frontmatter", () => {
      const content = `---
name: test-skill
description: A test skill
emoji: 🧪
---

# Test Skill
`;
      const result = parseFrontmatter(content);
      expect(result.name).toBe("test-skill");
      expect(result.description).toBe("A test skill");
      expect(result.emoji).toBe("🧪");
    });

    it("当没有 frontmatter 时返回空对象", () => {
      const content = "# Just a markdown file\nNo frontmatter here";
      const result = parseFrontmatter(content);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it("应该处理带引号的值", () => {
      const content = `---
name: "quoted name"
description: 'single quoted'
---

Content
`;
      const result = parseFrontmatter(content);
      expect(result.name).toBe("quoted name");
      expect(result.description).toBe("single quoted");
    });

    it("应该跳过注释和空行", () => {
      const content = `---
# This is a comment
name: test

description: desc
---

Content
`;
      const result = parseFrontmatter(content);
      expect(result.name).toBe("test");
      expect(result.description).toBe("desc");
    });
  });

  describe("resolveSkillInvocationPolicy", () => {
    it("应该使用默认值", () => {
      const result = resolveSkillInvocationPolicy({});
      expect(result.userInvocable).toBe(true);
      expect(result.disableModelInvocation).toBe(false);
    });

    it("应该解析 user-invocable", () => {
      expect(resolveSkillInvocationPolicy({ "user-invocable": "false" }).userInvocable).toBe(false);
      expect(resolveSkillInvocationPolicy({ "user-invocable": "true" }).userInvocable).toBe(true);
    });

    it("应该解析 disable-model-invocation", () => {
      expect(resolveSkillInvocationPolicy({ "disable-model-invocation": "true" }).disableModelInvocation).toBe(true);
      expect(resolveSkillInvocationPolicy({ "disable-model-invocation": "false" }).disableModelInvocation).toBe(false);
    });
  });

  describe("resolveSkillMetadata", () => {
    it("应该从简单的 frontmatter 解析元数据", () => {
      const fm = {
        emoji: "🚀",
        homepage: "https://example.com",
        "skill-key": "my-skill",
        os: "linux,darwin",
      };
      const result = resolveSkillMetadata(fm);
      expect(result?.emoji).toBe("🚀");
      expect(result?.homepage).toBe("https://example.com");
      expect(result?.skillKey).toBe("my-skill");
      expect(result?.os).toEqual(["linux", "darwin"]);
    });

    it("当没有元数据时返回 undefined", () => {
      const result = resolveSkillMetadata({});
      expect(result).toBeUndefined();
    });
  });

  describe("parseInstallSpec", () => {
    it("应该解析 brew 安装规格", () => {
      const spec = parseInstallSpec("brew,formula=git");
      expect(spec?.kind).toBe("brew");
      expect(spec?.formula).toBe("git");
    });

    it("应该解析 node 安装规格", () => {
      const spec = parseInstallSpec("node,package=lodash");
      expect(spec?.kind).toBe("node");
      expect(spec?.package).toBe("lodash");
    });

    it("应该解析 download 安装规格", () => {
      const spec = parseInstallSpec("download,url=https://example.com/file.tar.gz,extract=true");
      expect(spec?.kind).toBe("download");
      expect(spec?.url).toBe("https://example.com/file.tar.gz");
      expect(spec?.extract).toBe(true);
    });

    it("对于无效的规格返回 undefined", () => {
      expect(parseInstallSpec("invalid")).toBeUndefined();
      expect(parseInstallSpec("brew")).toBeUndefined();
      expect(parseInstallSpec("node,package=")).toBeUndefined();
    });

    it("应该验证 URL 协议", () => {
      const spec = parseInstallSpec("download,url=ftp://bad.com/file");
      expect(spec).toBeUndefined();
    });
  });
});
