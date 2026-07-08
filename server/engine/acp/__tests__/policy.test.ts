import { describe, it, expect } from "vitest";
import { PolicyEngine, DEFAULT_PERMISSION_PROFILE } from "../policy.js";

describe("PolicyEngine", () => {
  describe("evaluateToolCall", () => {
    it("should allow read-only tools", () => {
      const engine = new PolicyEngine();
      const result = engine.evaluateToolCall("listFiles");
      expect(result.allowed).toBe(true);
      expect(result.level).toBe("allow");
    });

    it("should deny dangerous tools", () => {
      const engine = new PolicyEngine();
      const result = engine.evaluateToolCall("exec");
      expect(result.allowed).toBe(false);
      expect(result.level).toBe("deny");
    });

    it("should require approval for write tools", () => {
      const engine = new PolicyEngine();
      const result = engine.evaluateToolCall("writeFile");
      expect(result.allowed).toBe(false);
      expect(result.level).toBe("prompt");
      expect(result.requiresApproval).toBe(true);
    });

    it("should return default level for unknown tools", () => {
      const engine = new PolicyEngine();
      const result = engine.evaluateToolCall("unknownTool");
      expect(result.level).toBe("prompt");
    });
  });

  describe("setActiveProfile", () => {
    it("should switch to restricted profile", () => {
      const engine = new PolicyEngine();
      const result = engine.setActiveProfile("restricted");
      expect(result).toBe(true);
      expect(engine.getActiveProfile().id).toBe("restricted");
    });

    it("should switch to full access profile", () => {
      const engine = new PolicyEngine();
      const result = engine.setActiveProfile("full");
      expect(result).toBe(true);
      expect(engine.getActiveProfile().id).toBe("full");
    });

    it("should return false for unknown profile", () => {
      const engine = new PolicyEngine();
      const result = engine.setActiveProfile("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("canExecuteTool", () => {
    it("should return true for allowed tools", () => {
      const engine = new PolicyEngine();
      expect(engine.canExecuteTool("listFiles")).toBe(true);
    });

    it("should return false for denied tools", () => {
      const engine = new PolicyEngine();
      expect(engine.canExecuteTool("exec")).toBe(false);
    });

    it("should return false for tools requiring approval", () => {
      const engine = new PolicyEngine();
      expect(engine.canExecuteTool("writeFile")).toBe(false);
    });
  });

  describe("requiresApproval", () => {
    it("should return true for tools requiring approval", () => {
      const engine = new PolicyEngine();
      expect(engine.requiresApproval("writeFile")).toBe(true);
    });

    it("should return false for allowed tools", () => {
      const engine = new PolicyEngine();
      expect(engine.requiresApproval("listFiles")).toBe(false);
    });
  });
});
