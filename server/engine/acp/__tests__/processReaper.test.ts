import { describe, it, expect } from "vitest";
import {
  isOpenClawLeaseAwareAcpxProcessCommand,
  isOpenClawOwnedAcpxProcessCommand,
} from "../processReaper.js";

describe("ProcessReaper", () => {
  describe("isOpenClawLeaseAwareAcpxProcessCommand", () => {
    it("should return false for undefined command", () => {
      expect(isOpenClawLeaseAwareAcpxProcessCommand({ command: undefined })).toBe(false);
    });

    it("should return false for empty command", () => {
      expect(isOpenClawLeaseAwareAcpxProcessCommand({ command: "" })).toBe(false);
    });

    it("should return false for non-wrapper command", () => {
      expect(isOpenClawLeaseAwareAcpxProcessCommand({ command: "node server.js" })).toBe(false);
    });

    it("should return true for codex-acp-wrapper command", () => {
      expect(isOpenClawLeaseAwareAcpxProcessCommand({
        command: "node /path/to/codex-acp-wrapper.mjs",
      })).toBe(true);
    });

    it("should return true for claude-agent-acp-wrapper command", () => {
      expect(isOpenClawLeaseAwareAcpxProcessCommand({
        command: "node /path/to/claude-agent-acp-wrapper.mjs",
      })).toBe(true);
    });

    it("should return false when wrapperRoot is specified and command doesn't match", () => {
      expect(isOpenClawLeaseAwareAcpxProcessCommand({
        command: "node /other/path/codex-acp-wrapper.mjs",
        wrapperRoot: "/path/to/wrapper",
      })).toBe(false);
    });

    it("should return true when wrapperRoot matches", () => {
      expect(isOpenClawLeaseAwareAcpxProcessCommand({
        command: "node /path/to/wrapper/codex-acp-wrapper.mjs",
        wrapperRoot: "/path/to/wrapper",
      })).toBe(true);
    });
  });

  describe("isOpenClawOwnedAcpxProcessCommand", () => {
    it("should return false for undefined command", () => {
      expect(isOpenClawOwnedAcpxProcessCommand({ command: undefined })).toBe(false);
    });

    it("should return false for empty command", () => {
      expect(isOpenClawOwnedAcpxProcessCommand({ command: "" })).toBe(false);
    });

    it("should return true for lease-aware wrapper command", () => {
      expect(isOpenClawOwnedAcpxProcessCommand({
        command: "node /path/to/codex-acp-wrapper.mjs",
      })).toBe(true);
    });

    it("should return true for codex-acp package in plugin-runtime-deps", () => {
      expect(isOpenClawOwnedAcpxProcessCommand({
        command: "node /plugin-runtime-deps/node_modules/@zed-industries/codex-acp/dist/cli.js",
      })).toBe(true);
    });

    it("should return true for claude-agent-acp package in plugin-runtime-deps", () => {
      expect(isOpenClawOwnedAcpxProcessCommand({
        command: "node /plugin-runtime-deps/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js",
      })).toBe(true);
    });

    it("should return true for acpx package in plugin-runtime-deps", () => {
      expect(isOpenClawOwnedAcpxProcessCommand({
        command: "node /plugin-runtime-deps/node_modules/acpx/dist/index.js",
      })).toBe(true);
    });

    it("should return false for acp package not in plugin-runtime-deps", () => {
      expect(isOpenClawOwnedAcpxProcessCommand({
        command: "node /node_modules/@zed-industries/codex-acp/dist/cli.js",
      })).toBe(false);
    });

    it("should return false for unrelated command", () => {
      expect(isOpenClawOwnedAcpxProcessCommand({
        command: "node /node_modules/express/index.js",
      })).toBe(false);
    });
  });
});