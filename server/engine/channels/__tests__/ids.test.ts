/**
 * ids.ts 单元测试
 *
 * 覆盖 generateId 及各类型专用生成器、ID 解析（getIdTimestamp / getIdType）、
 * 校验（isValidId）以及 normalizeChatChannelId 的规范化逻辑。
 */
import { describe, it, expect } from "vitest";
import {
  generateId,
  generateMessageId,
  generateConversationId,
  generateSessionId,
  generateThreadId,
  generateEventId,
  generateTurnId,
  generateDeliveryId,
  generatePairingId,
  generateWizardId,
  generateStreamId,
  getIdTimestamp,
  getIdType,
  isValidId,
  normalizeChatChannelId,
  type IdType,
} from "../ids.js";

describe("channels/ids", () => {
  describe("generateId", () => {
    it("produces a string starting with the type", () => {
      const id = generateId("message");
      expect(typeof id).toBe("string");
      expect(id.startsWith("message_")).toBe(true);
    });

    it("prepends the prefix when provided", () => {
      const id = generateId("message", "slack");
      expect(id.startsWith("slack_message_")).toBe(true);
    });

    it("does not prepend a leading underscore when no prefix is given", () => {
      const id = generateId("session");
      expect(id.startsWith("_")).toBe(false);
      expect(id.startsWith("session_")).toBe(true);
    });

    it("produces unique ids on repeated calls", () => {
      const a = generateId("event");
      const b = generateId("event");
      expect(a).not.toBe(b);
    });

    it("embeds a 13-digit timestamp segment between underscores", () => {
      const id = generateId("turn");
      expect(id).toMatch(/_\d{13}_/);
    });
  });

  describe("typed id generators", () => {
    it("generateMessageId uses the 'message' type", () => {
      expect(getIdType(generateMessageId())).toBe("message");
    });

    it("generateMessageId forwards the channel id as a prefix", () => {
      const id = generateMessageId("slack");
      expect(id.startsWith("slack_message_")).toBe(true);
    });

    it("generateConversationId uses the 'conversation' type", () => {
      expect(getIdType(generateConversationId())).toBe("conversation");
    });

    it("generateSessionId uses the 'session' type", () => {
      expect(getIdType(generateSessionId())).toBe("session");
    });

    it("generateThreadId uses the 'thread' type", () => {
      expect(getIdType(generateThreadId())).toBe("thread");
    });

    it("generateEventId uses the 'event' type", () => {
      expect(getIdType(generateEventId())).toBe("event");
    });

    it("generateTurnId uses the 'turn' type", () => {
      expect(getIdType(generateTurnId())).toBe("turn");
    });

    it("generateDeliveryId uses the 'delivery' type", () => {
      expect(getIdType(generateDeliveryId())).toBe("delivery");
    });

    it("generatePairingId uses the 'pairing' type", () => {
      expect(getIdType(generatePairingId())).toBe("pairing");
    });

    it("generateWizardId uses the 'wizard' type", () => {
      expect(getIdType(generateWizardId())).toBe("wizard");
    });

    it("generateStreamId uses the 'stream' type", () => {
      expect(getIdType(generateStreamId())).toBe("stream");
    });
  });

  describe("getIdTimestamp", () => {
    it("extracts the timestamp from a generated id", () => {
      const id = generateId("message");
      const ts = getIdTimestamp(id);
      expect(ts).not.toBeNull();
      expect(typeof ts).toBe("number");
      expect(Math.abs(Date.now() - (ts as number))).toBeLessThan(5000);
    });

    it("returns null when no 13-digit timestamp segment is present", () => {
      expect(getIdTimestamp("message_abc_def")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(getIdTimestamp("")).toBeNull();
    });
  });

  describe("getIdType", () => {
    it("returns the type for a valid generated id", () => {
      expect(getIdType(generateId("session"))).toBe("session");
    });

    it("returns null for an unknown type prefix", () => {
      expect(getIdType("unknown_1234567890123_abc")).toBeNull();
    });

    it("returns null when the id has no underscore separator", () => {
      expect(getIdType("noseparator")).toBeNull();
    });

    it("returns null for an id whose channel prefix shadows the type", () => {
      // generateId with a prefix puts the prefix first; getIdType parses the
      // leading lowercase run, which is the prefix rather than the type.
      const id = generateId("message", "slack");
      expect(getIdType(id)).toBeNull();
    });
  });

  describe("isValidId", () => {
    it("returns true for a freshly generated id without a prefix", () => {
      expect(isValidId(generateId("event"))).toBe(true);
    });

    it("returns true when the requested type matches", () => {
      const id = generateId("turn");
      expect(isValidId(id, "turn")).toBe(true);
    });

    it("returns false when the requested type does not match", () => {
      const id = generateId("turn");
      expect(isValidId(id, "message")).toBe(false);
    });

    it("returns false for an id without a timestamp segment", () => {
      expect(isValidId("message_abc")).toBe(false);
    });

    it("distinguishes presence-of-timestamp from type matching on prefixed ids", () => {
      const id = generateId("message", "slack");
      // has a timestamp so isValidId(id) is true, but type "message" does not match
      expect(isValidId(id)).toBe(true);
      expect(isValidId(id, "message")).toBe(false);
    });
  });

  describe("normalizeChatChannelId", () => {
    it("lowercases the input", () => {
      expect(normalizeChatChannelId("Slack")).toBe("slack");
    });

    it("trims surrounding whitespace", () => {
      expect(normalizeChatChannelId("  discord  ")).toBe("discord");
    });

    it("returns null for undefined input", () => {
      expect(normalizeChatChannelId(undefined)).toBeNull();
    });

    it("returns null for null input", () => {
      expect(normalizeChatChannelId(null)).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(normalizeChatChannelId("")).toBeNull();
    });

    it("returns null for a whitespace-only string", () => {
      expect(normalizeChatChannelId("   ")).toBeNull();
    });
  });

  describe("IdType", () => {
    it("covers all known id type values and round-trips them", () => {
      const types: IdType[] = [
        "message",
        "conversation",
        "session",
        "thread",
        "event",
        "turn",
        "delivery",
        "pairing",
        "wizard",
        "stream",
      ];
      expect(types).toHaveLength(10);
      for (const t of types) {
        expect(getIdType(generateId(t))).toBe(t);
      }
    });
  });
});
