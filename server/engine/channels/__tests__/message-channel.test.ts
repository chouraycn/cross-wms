/**
 * message-channel.ts 单元测试
 *
 * 覆盖通道常量、normalizeMessageChannel 规范化、各类判断函数
 * （isDeliverableMessageChannel / isInternal* / isNativeApprovalChannel /
 * isMarkdownCapableMessageChannel）以及 resolveMessageChannel 回退逻辑。
 */
import { describe, it, expect } from "vitest";
import {
  INTERNAL_MESSAGE_CHANNEL,
  NATIVE_APPROVAL_CHANNELS,
  BUILT_IN_CHANNEL_IDS,
  normalizeMessageChannel,
  isDeliverableMessageChannel,
  isInternalMessageChannel,
  isInternalNonDeliveryChannel,
  isNativeApprovalChannel,
  isMarkdownCapableMessageChannel,
  resolveMessageChannel,
} from "../message-channel.js";

describe("channels/message-channel", () => {
  describe("constants", () => {
    it("exposes INTERNAL_MESSAGE_CHANNEL as 'webchat'", () => {
      expect(INTERNAL_MESSAGE_CHANNEL).toBe("webchat");
    });

    it("NATIVE_APPROVAL_CHANNELS includes webchat and slack", () => {
      expect(NATIVE_APPROVAL_CHANNELS).toContain("webchat");
      expect(NATIVE_APPROVAL_CHANNELS).toContain("slack");
    });

    it("BUILT_IN_CHANNEL_IDS includes cli and tui", () => {
      expect(BUILT_IN_CHANNEL_IDS).toContain("cli");
      expect(BUILT_IN_CHANNEL_IDS).toContain("tui");
    });
  });

  describe("normalizeMessageChannel", () => {
    it("lowercases the input", () => {
      expect(normalizeMessageChannel("Discord")).toBe("discord");
    });

    it("trims surrounding whitespace", () => {
      expect(normalizeMessageChannel("  slack  ")).toBe("slack");
    });

    it("returns undefined for an empty string", () => {
      expect(normalizeMessageChannel("")).toBeUndefined();
    });

    it("returns undefined for a whitespace-only string", () => {
      expect(normalizeMessageChannel("   ")).toBeUndefined();
    });

    it("returns undefined for undefined input", () => {
      expect(normalizeMessageChannel(undefined)).toBeUndefined();
    });

    it("returns undefined for null input", () => {
      expect(normalizeMessageChannel(null)).toBeUndefined();
    });
  });

  describe("isInternalMessageChannel", () => {
    it("returns true for 'webchat'", () => {
      expect(isInternalMessageChannel("webchat")).toBe(true);
    });

    it("returns true for case-insensitive 'WebChat'", () => {
      expect(isInternalMessageChannel("WebChat")).toBe(true);
    });

    it("returns false for a non-internal channel", () => {
      expect(isInternalMessageChannel("discord")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isInternalMessageChannel(undefined)).toBe(false);
    });
  });

  describe("isInternalNonDeliveryChannel", () => {
    it("returns true for 'heartbeat'", () => {
      expect(isInternalNonDeliveryChannel("heartbeat")).toBe(true);
    });

    it("returns true for 'cron'", () => {
      expect(isInternalNonDeliveryChannel("cron")).toBe(true);
    });

    it("returns false for a deliverable channel", () => {
      expect(isInternalNonDeliveryChannel("discord")).toBe(false);
    });
  });

  describe("isDeliverableMessageChannel", () => {
    it("returns true for a normalized external channel", () => {
      expect(isDeliverableMessageChannel("discord")).toBe(true);
    });

    it("returns false for the internal webchat channel", () => {
      expect(isDeliverableMessageChannel("webchat")).toBe(false);
    });

    it("returns false for a non-delivery channel", () => {
      expect(isDeliverableMessageChannel("heartbeat")).toBe(false);
    });

    it("returns false when the value is not already normalized", () => {
      // normalized('Discord') === 'discord' !== 'Discord'
      expect(isDeliverableMessageChannel("Discord")).toBe(false);
    });
  });

  describe("isNativeApprovalChannel", () => {
    it("returns true for a known approval channel", () => {
      expect(isNativeApprovalChannel("telegram")).toBe(true);
    });

    it("returns false for an unknown channel", () => {
      expect(isNativeApprovalChannel("unknown")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isNativeApprovalChannel(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isNativeApprovalChannel(undefined)).toBe(false);
    });
  });

  describe("isMarkdownCapableMessageChannel", () => {
    it("returns true for webchat", () => {
      expect(isMarkdownCapableMessageChannel("webchat")).toBe(true);
    });

    it("returns true for tui", () => {
      expect(isMarkdownCapableMessageChannel("tui")).toBe(true);
    });

    it("returns true for cli", () => {
      expect(isMarkdownCapableMessageChannel("cli")).toBe(true);
    });

    it("returns true for slack", () => {
      expect(isMarkdownCapableMessageChannel("slack")).toBe(true);
    });

    it("returns false for an unknown channel", () => {
      expect(isMarkdownCapableMessageChannel("unknown")).toBe(false);
    });

    it("returns false for empty input", () => {
      expect(isMarkdownCapableMessageChannel("")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(isMarkdownCapableMessageChannel("Slack")).toBe(true);
    });
  });

  describe("resolveMessageChannel", () => {
    it("returns the normalized primary channel", () => {
      expect(resolveMessageChannel("Discord", "slack")).toBe("discord");
    });

    it("falls back to the secondary channel when primary is missing", () => {
      expect(resolveMessageChannel(undefined, "Slack")).toBe("slack");
    });

    it("falls back to the secondary channel when primary is empty", () => {
      expect(resolveMessageChannel("", "slack")).toBe("slack");
    });

    it("returns undefined when both channels are missing", () => {
      expect(resolveMessageChannel(undefined, undefined)).toBeUndefined();
    });

    it("returns undefined when both channels are empty", () => {
      expect(resolveMessageChannel("", "")).toBeUndefined();
    });
  });
});
