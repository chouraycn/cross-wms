import { describe, it, expect } from "vitest";
import { normalizeConversationText } from "../conversationId.js";

describe("ConversationId", () => {
  describe("normalizeConversationText", () => {
    it("should trim string values", () => {
      expect(normalizeConversationText("  hello  ")).toBe("hello");
    });

    it("should convert numbers to strings", () => {
      expect(normalizeConversationText(123)).toBe("123");
    });

    it("should convert bigint to strings", () => {
      expect(normalizeConversationText(123n)).toBe("123");
    });

    it("should convert boolean to strings", () => {
      expect(normalizeConversationText(true)).toBe("true");
      expect(normalizeConversationText(false)).toBe("false");
    });

    it("should return empty string for objects", () => {
      expect(normalizeConversationText({})).toBe("");
      expect(normalizeConversationText([])).toBe("");
    });

    it("should return empty string for null/undefined", () => {
      expect(normalizeConversationText(null)).toBe("");
      expect(normalizeConversationText(undefined)).toBe("");
    });
  });
});