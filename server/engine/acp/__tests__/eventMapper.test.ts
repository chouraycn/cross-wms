import { describe, it, expect } from "vitest";
import {
  extractTextFromPrompt,
  extractAttachmentsFromPrompt,
  formatToolTitle,
  inferToolKind,
  extractToolCallContent,
  extractToolCallLocations,
} from "../eventMapper.js";

describe("EventMapper", () => {
  describe("extractTextFromPrompt", () => {
    it("should extract text from text blocks", () => {
      const prompt = [{ type: "text", text: "Hello world" }];
      expect(extractTextFromPrompt(prompt)).toBe("Hello world");
    });

    it("should extract text from resource blocks", () => {
      const prompt = [{ type: "resource", resource: { text: "Resource content" } }];
      expect(extractTextFromPrompt(prompt)).toBe("Resource content");
    });

    it("should extract text from resource_link blocks", () => {
      const prompt = [{ type: "resource_link", resource_link: { title: "Test", uri: "https://example.com" } }];
      expect(extractTextFromPrompt(prompt)).toContain("Resource link");
      expect(extractTextFromPrompt(prompt)).toContain("https://example.com");
    });

    it("should concatenate multiple blocks", () => {
      const prompt = [
        { type: "text", text: "First" },
        { type: "text", text: "Second" },
      ];
      expect(extractTextFromPrompt(prompt)).toBe("First\nSecond");
    });

    it("should throw error when exceeding max bytes", () => {
      const prompt = [{ type: "text", text: "a".repeat(100) }];
      expect(() => extractTextFromPrompt(prompt, 50)).toThrow();
    });
  });

  describe("extractAttachmentsFromPrompt", () => {
    it("should extract image attachments", () => {
      const prompt = [{ type: "image", data: "base64data", mimeType: "image/png" }];
      const attachments = extractAttachmentsFromPrompt(prompt);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].type).toBe("image");
      expect(attachments[0].mimeType).toBe("image/png");
    });

    it("should ignore non-image blocks", () => {
      const prompt = [{ type: "text", text: "Hello" }];
      expect(extractAttachmentsFromPrompt(prompt)).toHaveLength(0);
    });

    it("should ignore incomplete images", () => {
      const prompt = [{ type: "image", data: "base64data" }];
      expect(extractAttachmentsFromPrompt(prompt)).toHaveLength(0);
    });
  });

  describe("formatToolTitle", () => {
    it("should return base name without args", () => {
      expect(formatToolTitle("myTool", undefined)).toBe("myTool");
    });

    it("should format args as key-value pairs", () => {
      const result = formatToolTitle("myTool", { path: "/tmp/file", count: 5 });
      expect(result).toContain("path:");
      expect(result).toContain("/tmp/file");
      expect(result).toContain("count:");
    });

    it("should truncate long values", () => {
      const result = formatToolTitle("myTool", { data: "x".repeat(200) });
      expect(result.length).toBeLessThan(200);
      expect(result).toContain("...");
    });
  });

  describe("inferToolKind", () => {
    it("should infer read kind", () => {
      expect(inferToolKind("readFile")).toBe("read");
      expect(inferToolKind("readFiles")).toBe("read");
    });

    it("should infer edit kind", () => {
      expect(inferToolKind("writeFile")).toBe("edit");
      expect(inferToolKind("editFile")).toBe("edit");
    });

    it("should infer delete kind", () => {
      expect(inferToolKind("deleteFile")).toBe("delete");
      expect(inferToolKind("removeItem")).toBe("delete");
    });

    it("should infer execute kind", () => {
      expect(inferToolKind("execCommand")).toBe("execute");
      expect(inferToolKind("runBash")).toBe("execute");
    });

    it("should infer search kind", () => {
      expect(inferToolKind("searchFiles")).toBe("search");
      expect(inferToolKind("findItem")).toBe("search");
    });

    it("should infer fetch kind", () => {
      expect(inferToolKind("fetchUrl")).toBe("fetch");
      expect(inferToolKind("httpGet")).toBe("fetch");
    });

    it("should return other for unknown tools", () => {
      expect(inferToolKind("unknownTool")).toBe("other");
      expect(inferToolKind(undefined)).toBe("other");
    });
  });

  describe("extractToolCallContent", () => {
    it("should extract content from string", () => {
      const result = extractToolCallContent("test content");
      expect(result).toBeDefined();
      expect(result?.[0].content.text).toBe("test content");
    });

    it("should extract content from content blocks", () => {
      const result = extractToolCallContent({ content: [{ type: "text", text: "block content" }] });
      expect(result?.[0].content.text).toBe("block content");
    });

    it("should extract fallback text", () => {
      const result = extractToolCallContent({ message: "fallback message" });
      expect(result?.[0].content.text).toBe("fallback message");
    });

    it("should return undefined for empty input", () => {
      expect(extractToolCallContent(undefined)).toBeUndefined();
      expect(extractToolCallContent({})).toBeUndefined();
    });
  });

  describe("extractToolCallLocations", () => {
    it("should extract locations from path keys", () => {
      const result = extractToolCallLocations({ path: "/tmp/file" });
      expect(result).toBeDefined();
      expect(result?.[0].path).toBe("/tmp/file");
    });

    it("should extract locations with line numbers", () => {
      const result = extractToolCallLocations({ filePath: "/tmp/file", line: 42 });
      expect(result?.[0].line).toBe(42);
    });

    it("should extract locations from text markers", () => {
      const result = extractToolCallLocations("FILE:/tmp/result.txt");
      expect(result?.[0].path).toBe("/tmp/result.txt");
    });

    it("should deduplicate locations", () => {
      const result = extractToolCallLocations({ path: "/tmp/file" }, { path: "/tmp/file" });
      expect(result).toHaveLength(1);
    });

    it("should handle depth limits", () => {
      const deepObj = { a: { b: { c: { path: "/deep/file" } } } };
      const result = extractToolCallLocations(deepObj);
      expect(result).toBeDefined();
      expect(result?.[0].path).toBe("/deep/file");
    });

    it("should not extract locations beyond max depth", () => {
      const deepObj = { a: { b: { c: { d: { e: { path: "/too-deep/file" } } } } } };
      const result = extractToolCallLocations(deepObj);
      expect(result).toBeUndefined();
    });
  });
});