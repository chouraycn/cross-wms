/**
 * string-helpers 单元测试
 */

import { describe, it, expect } from "vitest";

import {
  normalizeOptionalString,
  normalizeOptionalLowercaseString,
  normalizeLowercaseStringOrEmpty,
} from "../string-helpers.js";

describe("media / string-helpers", () => {
  describe("normalizeOptionalString", () => {
    it("普通字符串应去除首尾空白后返回", () => {
      expect(normalizeOptionalString("  hello  ")).toBe("hello");
    });

    it("空白字符串应返回 undefined", () => {
      expect(normalizeOptionalString("    ")).toBeUndefined();
    });

    it("空字符串应返回 undefined", () => {
      expect(normalizeOptionalString("")).toBeUndefined();
    });

    it("非字符串应返回 undefined", () => {
      expect(normalizeOptionalString(undefined)).toBeUndefined();
      expect(normalizeOptionalString(null)).toBeUndefined();
      expect(normalizeOptionalString(123)).toBeUndefined();
      expect(normalizeOptionalString({})).toBeUndefined();
    });

    it("已修剪的字符串应原样返回", () => {
      expect(normalizeOptionalString("hello")).toBe("hello");
    });
  });

  describe("normalizeOptionalLowercaseString", () => {
    it("大写应转为小写", () => {
      expect(normalizeOptionalLowercaseString("HELLO")).toBe("hello");
    });

    it("混合大小写应转为小写", () => {
      expect(normalizeOptionalLowercaseString("  HeLLo  ")).toBe("hello");
    });

    it("空白或非字符串应返回 undefined", () => {
      expect(normalizeOptionalLowercaseString("   ")).toBeUndefined();
      expect(normalizeOptionalLowercaseString(42)).toBeUndefined();
    });
  });

  describe("normalizeLowercaseStringOrEmpty", () => {
    it("大写应转为小写", () => {
      expect(normalizeLowercaseStringOrEmpty("WORLD")).toBe("world");
    });

    it("非字符串应返回空字符串", () => {
      expect(normalizeLowercaseStringOrEmpty(undefined)).toBe("");
      expect(normalizeLowercaseStringOrEmpty(null)).toBe("");
      expect(normalizeLowercaseStringOrEmpty(7)).toBe("");
    });

    it("空白字符串应返回空字符串", () => {
      expect(normalizeLowercaseStringOrEmpty("   ")).toBe("");
    });
  });
});
