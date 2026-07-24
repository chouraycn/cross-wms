/**
 * helpers.ts 单元测试
 *
 * helpers.ts 当前为降级 stub 实现：所有导出函数返回固定的空值（undefined 或 ""）。
 * 这些测试锁定其行为契约，避免后续重构时意外回归。
 */
import { describe, it, expect } from "vitest";
import {
  resolveChannelDefaultAccountId,
  formatPairingApproveHint,
  parseOptionalDelimitedEntries,
  buildAccountScopedDmSecurityPolicy,
} from "../helpers.js";

describe("channels/helpers (stub implementations)", () => {
  describe("resolveChannelDefaultAccountId", () => {
    it("returns undefined with no arguments", () => {
      expect(resolveChannelDefaultAccountId()).toBeUndefined();
    });

    it("returns undefined with arbitrary arguments", () => {
      expect(resolveChannelDefaultAccountId("slack", "acct-1", { x: 1 })).toBeUndefined();
    });

    it("is a function", () => {
      expect(typeof resolveChannelDefaultAccountId).toBe("function");
    });
  });

  describe("formatPairingApproveHint", () => {
    it("returns an empty string with no arguments", () => {
      expect(formatPairingApproveHint()).toBe("");
    });

    it("returns an empty string regardless of arguments", () => {
      expect(formatPairingApproveHint("slack", "user-1")).toBe("");
    });

    it("is a function", () => {
      expect(typeof formatPairingApproveHint).toBe("function");
    });
  });

  describe("parseOptionalDelimitedEntries", () => {
    it("returns undefined with no arguments", () => {
      expect(parseOptionalDelimitedEntries()).toBeUndefined();
    });

    it("returns undefined for a delimited string input", () => {
      expect(parseOptionalDelimitedEntries("a,b,c")).toBeUndefined();
    });

    it("is a function", () => {
      expect(typeof parseOptionalDelimitedEntries).toBe("function");
    });
  });

  describe("buildAccountScopedDmSecurityPolicy", () => {
    it("returns undefined with no arguments", () => {
      expect(buildAccountScopedDmSecurityPolicy()).toBeUndefined();
    });

    it("returns undefined for an object argument", () => {
      expect(buildAccountScopedDmSecurityPolicy({ accountId: "a" })).toBeUndefined();
    });

    it("is a function", () => {
      expect(typeof buildAccountScopedDmSecurityPolicy).toBe("function");
    });
  });

  describe("stub stability", () => {
    it("returns the same value on repeated calls", () => {
      expect(resolveChannelDefaultAccountId()).toBe(resolveChannelDefaultAccountId());
      expect(formatPairingApproveHint()).toBe(formatPairingApproveHint());
      expect(parseOptionalDelimitedEntries()).toBe(parseOptionalDelimitedEntries());
      expect(buildAccountScopedDmSecurityPolicy()).toBe(buildAccountScopedDmSecurityPolicy());
    });

    it("does not throw for any combination of arguments", () => {
      expect(() => resolveChannelDefaultAccountId(null, undefined, 0)).not.toThrow();
      expect(() => formatPairingApproveHint(null)).not.toThrow();
      expect(() => parseOptionalDelimitedEntries(null, undefined)).not.toThrow();
      expect(() => buildAccountScopedDmSecurityPolicy(null)).not.toThrow();
    });
  });
});
