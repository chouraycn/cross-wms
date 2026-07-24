/**
 * chat-type.ts 单元测试
 *
 * 覆盖 normalizeChatType 的规范化逻辑：direct/dm/group/channel 映射、
 * 大小写归一化、空白裁剪以及无效输入处理。
 */
import { describe, it, expect } from "vitest";
import { normalizeChatType, type ChatType } from "../chat-type.js";

describe("channels/chat-type", () => {
  describe("normalizeChatType", () => {
    it("returns 'direct' for 'direct'", () => {
      expect(normalizeChatType("direct")).toBe("direct");
    });

    it("returns 'direct' for the 'dm' alias", () => {
      expect(normalizeChatType("dm")).toBe("direct");
    });

    it("returns 'group' for 'group'", () => {
      expect(normalizeChatType("group")).toBe("group");
    });

    it("returns 'channel' for 'channel'", () => {
      expect(normalizeChatType("channel")).toBe("channel");
    });

    it("lowercases uppercase input", () => {
      expect(normalizeChatType("DIRECT")).toBe("direct");
      expect(normalizeChatType("DM")).toBe("direct");
      expect(normalizeChatType("Group")).toBe("group");
      expect(normalizeChatType("CHANNEL")).toBe("channel");
    });

    it("trims surrounding whitespace", () => {
      expect(normalizeChatType("  direct  ")).toBe("direct");
      expect(normalizeChatType("\tdm\n")).toBe("direct");
    });

    it("returns undefined for unknown values", () => {
      expect(normalizeChatType("unknown")).toBeUndefined();
      expect(normalizeChatType("public")).toBeUndefined();
      expect(normalizeChatType("directs")).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
      expect(normalizeChatType("")).toBeUndefined();
    });

    it("returns undefined for a whitespace-only string", () => {
      expect(normalizeChatType("   ")).toBeUndefined();
    });

    it("returns undefined when no argument is provided", () => {
      expect(normalizeChatType()).toBeUndefined();
    });

    it("returns undefined for null-ish input", () => {
      expect(normalizeChatType(null as unknown as string)).toBeUndefined();
    });

    it("is stable across repeated calls", () => {
      expect(normalizeChatType("dm")).toBe("direct");
      expect(normalizeChatType("dm")).toBe("direct");
    });
  });

  describe("ChatType type", () => {
    it("round-trips the three canonical values through normalizeChatType", () => {
      const values: ChatType[] = ["direct", "group", "channel"];
      expect(values).toHaveLength(3);
      for (const v of values) {
        expect(normalizeChatType(v)).toBe(v);
      }
    });
  });
});
