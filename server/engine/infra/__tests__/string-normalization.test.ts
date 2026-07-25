/**
 * string-normalization 单元测试
 */

import { describe, it, expect } from "vitest";

import {
  normalizeStringEntries,
  normalizeStringEntriesLower,
  uniqueValues,
  uniqueStrings,
  sortUniqueStrings,
  normalizeUniqueStringEntries,
  normalizeUniqueStringEntriesLower,
  normalizeSortedUniqueStringEntries,
  normalizeTrimmedStringList,
  normalizeUniqueTrimmedStringList,
  normalizeSortedUniqueTrimmedStringList,
  normalizeOptionalTrimmedStringList,
  normalizeArrayBackedTrimmedStringList,
  normalizeSingleOrTrimmedStringList,
  normalizeUniqueSingleOrTrimmedStringList,
  normalizeCsvOrLooseStringList,
  normalizeHyphenSlug,
  normalizeAtHashSlug,
} from "../string-normalization.js";

describe("infra / string-normalization", () => {
  describe("normalizeStringEntries", () => {
    it("should trim whitespace and filter empty strings from array", () => {
      expect(normalizeStringEntries(["  hello  ", "world", "", "  "])).toEqual([
        "hello",
        "world",
      ]);
    });

    it("should handle undefined and null inputs", () => {
      expect(normalizeStringEntries(undefined)).toEqual([]);
      expect(normalizeStringEntries(null as any)).toEqual([]);
    });

    it("should stringify non-string values and normalize", () => {
      expect(normalizeStringEntries([123, true, " test "])).toEqual([
        "123",
        "true",
        "test",
      ]);
    });

    it("should handle Unicode strings", () => {
      expect(
        normalizeStringEntries(["  你好  ", "世界", "  Hello World  "])
      ).toEqual(["你好", "世界", "Hello World"]);
    });

    it("should handle empty array", () => {
      expect(normalizeStringEntries([])).toEqual([]);
    });
  });

  describe("normalizeStringEntriesLower", () => {
    it("should normalize entries and convert to lowercase", () => {
      expect(
        normalizeStringEntriesLower(["  HELLO  ", "World", "TEST"])
      ).toEqual(["hello", "world", "test"]);
    });

    it("should handle mixed case Unicode strings", () => {
      expect(normalizeStringEntriesLower(["  你好  ", "ABC", "TeSt"])).toEqual([
        "你好",
        "abc",
        "test",
      ]);
    });

    it("should filter empty strings after normalization", () => {
      expect(normalizeStringEntriesLower(["  ", "", "TEST"])).toEqual(["test"]);
    });
  });

  describe("uniqueValues", () => {
    it("should return unique values preserving insertion order", () => {
      expect(uniqueValues([1, 2, 2, 3, 1, 4])).toEqual([1, 2, 3, 4]);
    });

    it("should handle strings", () => {
      expect(uniqueValues(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
    });

    it("should handle objects by reference", () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      expect(uniqueValues([obj1, obj2, obj1])).toEqual([obj1, obj2]);
    });

    it("should handle empty iterable", () => {
      expect(uniqueValues([])).toEqual([]);
    });
  });

  describe("uniqueStrings", () => {
    it("should return unique strings preserving insertion order", () => {
      expect(uniqueStrings(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
    });

    it("should handle case-sensitive uniqueness", () => {
      expect(uniqueStrings(["A", "a", "A", "B"])).toEqual(["A", "a", "B"]);
    });
  });

  describe("sortUniqueStrings", () => {
    it("should return unique strings sorted in ASCII order", () => {
      expect(sortUniqueStrings(["c", "a", "b", "a", "c"])).toEqual([
        "a",
        "b",
        "c",
      ]);
    });

    it("should handle Unicode strings", () => {
      // Unicode code point order: 世(U+4E16) < 你(U+4F60) < 好(U+597D) < 界(U+754C)
      expect(sortUniqueStrings(["你", "好", "你", "世", "界"])).toEqual([
        "世",
        "你",
        "好",
        "界",
      ]);
    });

    it("should maintain stable sort order", () => {
      expect(sortUniqueStrings(["z", "a", "m", "a", "z"])).toEqual([
        "a",
        "m",
        "z",
      ]);
    });
  });

  describe("normalizeUniqueStringEntries", () => {
    it("should normalize, dedupe, and preserve insertion order", () => {
      expect(
        normalizeUniqueStringEntries(["  a  ", "b", "a", "  c  ", "b"])
      ).toEqual(["a", "b", "c"]);
    });

    it("should handle undefined input", () => {
      expect(normalizeUniqueStringEntries(undefined)).toEqual([]);
    });

    it("should handle mixed types", () => {
      expect(
        normalizeUniqueStringEntries([123, "  test  ", 123, "test", true])
      ).toEqual(["123", "test", "true"]);
    });
  });

  describe("normalizeUniqueStringEntriesLower", () => {
    it("should lowercase, normalize, dedupe, and preserve insertion order", () => {
      expect(
        normalizeUniqueStringEntriesLower(["  A  ", "b", "a", "  C  ", "B"])
      ).toEqual(["a", "b", "c"]);
    });

    it("should handle empty and whitespace strings", () => {
      expect(
        normalizeUniqueStringEntriesLower(["  ", "", "TEST", "test"])
      ).toEqual(["test"]);
    });
  });

  describe("normalizeSortedUniqueStringEntries", () => {
    it("should normalize, dedupe, and sort", () => {
      expect(
        normalizeSortedUniqueStringEntries(["  c  ", "a", "b", "a", "c"])
      ).toEqual(["a", "b", "c"]);
    });

    it("should handle Unicode strings", () => {
      // Unicode code point order: 世(U+4E16) < 你(U+4F60) < 界(U+754C)
      expect(
        normalizeSortedUniqueStringEntries(["世", "你", "界", "你"])
      ).toEqual(["世", "你", "界"]);
    });
  });

  describe("normalizeTrimmedStringList", () => {
    it("should normalize array of strings", () => {
      expect(
        normalizeTrimmedStringList(["  hello  ", "world", "", "  "])
      ).toEqual(["hello", "world"]);
    });

    it("should return empty array for non-array input", () => {
      expect(normalizeTrimmedStringList("test")).toEqual([]);
      expect(normalizeTrimmedStringList(123)).toEqual([]);
      expect(normalizeTrimmedStringList(null)).toEqual([]);
      expect(normalizeTrimmedStringList(undefined)).toEqual([]);
    });

    it("should handle array with non-string values", () => {
      expect(normalizeTrimmedStringList([123, " test ", true])).toEqual([
        "test",
      ]);
    });
  });

  describe("normalizeUniqueTrimmedStringList", () => {
    it("should normalize array and dedupe preserving insertion order", () => {
      expect(
        normalizeUniqueTrimmedStringList(["  a  ", "b", "a", "c", "b"])
      ).toEqual(["a", "b", "c"]);
    });

    it("should return empty array for non-array input", () => {
      expect(normalizeUniqueTrimmedStringList("test")).toEqual([]);
    });
  });

  describe("normalizeSortedUniqueTrimmedStringList", () => {
    it("should normalize array, dedupe, and sort", () => {
      expect(
        normalizeSortedUniqueTrimmedStringList(["  c  ", "a", "b", "a", "c"])
      ).toEqual(["a", "b", "c"]);
    });

    it("should handle empty array", () => {
      expect(normalizeSortedUniqueTrimmedStringList([])).toEqual([]);
    });
  });

  describe("normalizeOptionalTrimmedStringList", () => {
    it("should return undefined for empty array", () => {
      expect(normalizeOptionalTrimmedStringList([])).toBeUndefined();
      expect(normalizeOptionalTrimmedStringList(["  ", ""])).toBeUndefined();
    });

    it("should return array for non-empty input", () => {
      expect(normalizeOptionalTrimmedStringList(["  a  ", "b"])).toEqual([
        "a",
        "b",
      ]);
    });

    it("should return undefined for non-array input", () => {
      expect(normalizeOptionalTrimmedStringList("test")).toBeUndefined();
      expect(normalizeOptionalTrimmedStringList(null)).toBeUndefined();
    });
  });

  describe("normalizeArrayBackedTrimmedStringList", () => {
    it("should return undefined for non-array input", () => {
      expect(
        normalizeArrayBackedTrimmedStringList("test")
      ).toBeUndefined();
      expect(normalizeArrayBackedTrimmedStringList(123)).toBeUndefined();
    });

    it("should preserve explicit empty array", () => {
      expect(normalizeArrayBackedTrimmedStringList([])).toEqual([]);
    });

    it("should normalize array contents", () => {
      expect(
        normalizeArrayBackedTrimmedStringList(["  a  ", "b", "", "  "])
      ).toEqual(["a", "b"]);
    });
  });

  describe("normalizeSingleOrTrimmedStringList", () => {
    it("should handle single string value", () => {
      expect(normalizeSingleOrTrimmedStringList("  test  ")).toEqual(["test"]);
    });

    it("should handle array of strings", () => {
      expect(
        normalizeSingleOrTrimmedStringList(["  a  ", "b", "", "  "])
      ).toEqual(["a", "b"]);
    });

    it("should return empty array for invalid input", () => {
      expect(normalizeSingleOrTrimmedStringList(123)).toEqual([]);
      expect(normalizeSingleOrTrimmedStringList(null)).toEqual([]);
      expect(normalizeSingleOrTrimmedStringList("  ")).toEqual([]);
    });
  });

  describe("normalizeUniqueSingleOrTrimmedStringList", () => {
    it("should handle single string and dedupe", () => {
      expect(
        normalizeUniqueSingleOrTrimmedStringList("  test  ")
      ).toEqual(["test"]);
    });

    it("should handle array and dedupe", () => {
      expect(
        normalizeUniqueSingleOrTrimmedStringList(["  a  ", "b", "a", "c"])
      ).toEqual(["a", "b", "c"]);
    });
  });

  describe("normalizeCsvOrLooseStringList", () => {
    it("should parse comma-separated string", () => {
      expect(normalizeCsvOrLooseStringList("a, b, c, d")).toEqual([
        "a",
        "b",
        "c",
        "d",
      ]);
    });

    it("should handle array input", () => {
      expect(normalizeCsvOrLooseStringList(["  a  ", "b", ""])).toEqual([
        "a",
        "b",
      ]);
    });

    it("should filter empty entries from CSV", () => {
      expect(normalizeCsvOrLooseStringList("a, , b, ,c")).toEqual([
        "a",
        "b",
        "c",
      ]);
    });

    it("should return empty array for non-string non-array input", () => {
      expect(normalizeCsvOrLooseStringList(123)).toEqual([]);
      expect(normalizeCsvOrLooseStringList(null)).toEqual([]);
    });

    it("should handle Unicode CSV strings", () => {
      expect(normalizeCsvOrLooseStringList("你好, 世界, test")).toEqual([
        "你好",
        "世界",
        "test",
      ]);
    });
  });

  describe("normalizeHyphenSlug", () => {
    it("should normalize to lowercase hyphenated slug", () => {
      expect(normalizeHyphenSlug("  Hello World  ")).toBe("hello-world");
    });

    it("should allow special characters # @ . _ +", () => {
      expect(normalizeHyphenSlug("Test #123")).toBe("test-#123");
      expect(normalizeHyphenSlug("user@domain")).toBe("user@domain");
      expect(normalizeHyphenSlug("file.name")).toBe("file.name");
      expect(normalizeHyphenSlug("under_score")).toBe("under_score");
      expect(normalizeHyphenSlug("test+value")).toBe("test+value");
    });

    it("should handle multiple spaces and hyphens", () => {
      expect(normalizeHyphenSlug("hello   world")).toBe("hello-world");
      expect(normalizeHyphenSlug("hello--world")).toBe("hello-world");
      expect(normalizeHyphenSlug("hello   --   world")).toBe("hello-world");
    });

    it("should trim leading and trailing hyphens and dots", () => {
      expect(normalizeHyphenSlug("-hello world-")).toBe("hello-world");
      expect(normalizeHyphenSlug(".hello world.")).toBe("hello-world");
    });

    it("should handle empty and whitespace input", () => {
      expect(normalizeHyphenSlug("")).toBe("");
      expect(normalizeHyphenSlug("   ")).toBe("");
      expect(normalizeHyphenSlug(null)).toBe("");
      expect(normalizeHyphenSlug(undefined)).toBe("");
    });

    it("should handle Unicode strings", () => {
      expect(normalizeHyphenSlug("你好 世界")).toBe("你好-世界");
    });

    it("should normalize Unicode to NFC form", () => {
      // Test with composed vs decomposed Unicode characters
      const composed = "é"; // é as single character
      const decomposed = "e\u0301"; // e + combining acute accent
      expect(normalizeHyphenSlug(composed)).toBe(
        normalizeHyphenSlug(decomposed)
      );
    });
  });

  describe("normalizeAtHashSlug", () => {
    it("should remove @ and # prefixes", () => {
      expect(normalizeAtHashSlug("@channel")).toBe("channel");
      expect(normalizeAtHashSlug("#channel")).toBe("channel");
      expect(normalizeAtHashSlug("@@channel")).toBe("channel");
      expect(normalizeAtHashSlug("##channel")).toBe("channel");
    });

    it("should convert spaces and underscores to hyphens", () => {
      expect(normalizeAtHashSlug("hello world")).toBe("hello-world");
      expect(normalizeAtHashSlug("hello_world")).toBe("hello-world");
      expect(normalizeAtHashSlug("hello   world")).toBe("hello-world");
    });

    it("should only allow alphanumeric and hyphen characters", () => {
      expect(normalizeAtHashSlug("test#123")).toBe("test-123");
      expect(normalizeAtHashSlug("test@domain")).toBe("test-domain");
      expect(normalizeAtHashSlug("test.value")).toBe("test-value");
    });

    it("should collapse multiple hyphens", () => {
      expect(normalizeAtHashSlug("a---b")).toBe("a-b");
      expect(normalizeAtHashSlug("test   value")).toBe("test-value");
    });

    it("should trim leading and trailing hyphens", () => {
      expect(normalizeAtHashSlug("-test-")).toBe("test");
      expect(normalizeAtHashSlug("--test--")).toBe("test");
    });

    it("should handle empty and whitespace input", () => {
      expect(normalizeAtHashSlug("")).toBe("");
      expect(normalizeAtHashSlug("   ")).toBe("");
      expect(normalizeAtHashSlug(null)).toBe("");
      expect(normalizeAtHashSlug(undefined)).toBe("");
    });

    it("should handle Unicode strings", () => {
      expect(normalizeAtHashSlug("@你好世界")).toBe("你好世界");
      expect(normalizeAtHashSlug("#测试 频道")).toBe("测试-频道");
    });

    it("should convert to lowercase", () => {
      expect(normalizeAtHashSlug("@TestChannel")).toBe("testchannel");
      expect(normalizeAtHashSlug("#UPPERCASE")).toBe("uppercase");
    });
  });

  describe("performance considerations", () => {
    it("should handle long strings efficiently", () => {
      const longString = "a ".repeat(1000) + "b";
      const result = normalizeStringEntries([longString]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(longString.trim());
    });

    it("should handle large arrays efficiently", () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => `item ${i}`);
      const result = normalizeStringEntries(largeArray);
      expect(result).toHaveLength(1000);
      expect(result[0]).toBe("item 0");
      expect(result[999]).toBe("item 999");
    });

    it("should handle deduplication of large arrays", () => {
      const repeatedArray = Array.from({ length: 1000 }, (_, i) => `item ${i % 10}`);
      const result = normalizeUniqueStringEntries(repeatedArray);
      expect(result).toHaveLength(10);
      expect(result).toEqual([
        "item 0",
        "item 1",
        "item 2",
        "item 3",
        "item 4",
        "item 5",
        "item 6",
        "item 7",
        "item 8",
        "item 9",
      ]);
    });

    it("should handle long CSV strings efficiently", () => {
      const longCsv = Array.from({ length: 100 }, (_, i) => `item${i}`).join(", ");
      const result = normalizeCsvOrLooseStringList(longCsv);
      expect(result).toHaveLength(100);
      expect(result[0]).toBe("item0");
      expect(result[99]).toBe("item99");
    });

    it("should handle long slug generation efficiently", () => {
      const longText = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
      const result = normalizeHyphenSlug(longText);
      expect(result).toMatch(/^word0-word1/);
      expect(result.split("-")).toHaveLength(100);
    });
  });
});