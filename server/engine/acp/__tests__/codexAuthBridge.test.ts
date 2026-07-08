import { describe, it, expect } from "vitest";
import {
  writeCodexAcpWrapper,
  writeClaudeAcpWrapper,
} from "../codexAuthBridge.js";

describe("CodexAuthBridge", () => {
  describe("writeCodexAcpWrapper", () => {
    it("should return wrapper path", async () => {
      const wrapperPath = await writeCodexAcpWrapper("/tmp/test-codex");
      expect(wrapperPath).toContain("codex-acp-wrapper.mjs");
    });
  });

  describe("writeClaudeAcpWrapper", () => {
    it("should return wrapper path", async () => {
      const wrapperPath = await writeClaudeAcpWrapper("/tmp/test-claude");
      expect(wrapperPath).toContain("claude-agent-acp-wrapper.mjs");
    });
  });
});