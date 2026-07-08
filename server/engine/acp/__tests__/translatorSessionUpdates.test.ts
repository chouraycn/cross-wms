import { describe, it, expect, beforeEach } from "vitest";
import {
  toSessionUpdate,
  sessionUpdateToOpenAiDelta,
  SessionLineageManager,
  getSessionLineageManager,
  resetSessionLineageManager,
} from "../translatorSessionUpdates.js";
import type { AcpTurnEvent } from "../acpTypes.js";

describe("Translator - Session Updates", () => {
  describe("toSessionUpdate", () => {
    it("should convert message event to text update", () => {
      const event: AcpTurnEvent = { type: "message", content: "Hello" } as any;
      const result = toSessionUpdate(event, 1);
      expect(result).toEqual({ kind: "text", text: "Hello", sequence: 1 });
    });

    it("should convert thinking event to thinking update", () => {
      const event: AcpTurnEvent = { type: "thinking", content: "thinking..." } as any;
      const result = toSessionUpdate(event, 1);
      expect(result).toEqual({ kind: "thinking", thinking: "thinking...", sequence: 1 });
    });

    it("should convert tool_use event to tool_call update", () => {
      const event: AcpTurnEvent = { type: "tool_use", id: "tc1", name: "search", input: { q: "x" } } as any;
      const result = toSessionUpdate(event, 1);
      expect(result).toEqual({ kind: "tool_call", id: "tc1", name: "search", input: { q: "x" }, sequence: 1 });
    });

    it("should convert tool_result event", () => {
      const event: AcpTurnEvent = { type: "tool_result", id: "tc1", output: "result" } as any;
      const result = toSessionUpdate(event, 1);
      expect(result).toEqual({ kind: "tool_result", id: "tc1", output: "result", sequence: 1 });
    });

    it("should convert done event", () => {
      const event: AcpTurnEvent = { type: "done", finishReason: "stop" } as any;
      const result = toSessionUpdate(event, 1);
      expect(result).toEqual({ kind: "done", finishReason: "stop", sequence: 1 });
    });

    it("should return null for unknown event type", () => {
      const event: AcpTurnEvent = { type: "unknown" as any } as any;
      const result = toSessionUpdate(event, 1);
      expect(result).toBeNull();
    });
  });

  describe("sessionUpdateToOpenAiDelta", () => {
    it("should convert text update to OpenAI delta", () => {
      const delta = sessionUpdateToOpenAiDelta({ kind: "text", text: "Hi", sequence: 1 });
      expect(delta).toEqual({ role: "assistant", content: "Hi" });
    });

    it("should skip thinking by default", () => {
      const delta = sessionUpdateToOpenAiDelta({ kind: "thinking", thinking: "...", sequence: 1 });
      expect(delta).toBeNull();
    });

    it("should include thinking when option enabled", () => {
      const delta = sessionUpdateToOpenAiDelta(
        { kind: "thinking", thinking: "...", sequence: 1 },
        { includeThinking: true },
      );
      expect(delta).toEqual({ role: "assistant", content: "..." });
    });

    it("should convert tool_call to OpenAI tool_calls", () => {
      const delta = sessionUpdateToOpenAiDelta({
        kind: "tool_call",
        id: "tc1",
        name: "search",
        input: { q: "x" },
        sequence: 1,
      });
      expect(delta?.role).toBe("assistant");
      expect(delta?.tool_calls).toHaveLength(1);
      expect(delta?.tool_calls?.[0].id).toBe("tc1");
    });

    it("should convert done event to null", () => {
      const delta = sessionUpdateToOpenAiDelta({ kind: "done", finishReason: "stop", sequence: 1 });
      expect(delta).toBeNull();
    });
  });

  describe("SessionLineageManager", () => {
    let manager: SessionLineageManager;

    beforeEach(() => {
      manager = new SessionLineageManager();
    });

    it("should register root session with depth 0", () => {
      const lineage = manager.register({ sessionId: "root" });
      expect(lineage.depth).toBe(0);
      expect(lineage.rootSessionId).toBe("root");
      expect(lineage.parentSessionId).toBeUndefined();
    });

    it("should register child session with depth 1", () => {
      manager.register({ sessionId: "root" });
      const child = manager.register({ sessionId: "child", parentSessionId: "root" });
      expect(child.depth).toBe(1);
      expect(child.rootSessionId).toBe("root");
    });

    it("should register grandchild with depth 2", () => {
      manager.register({ sessionId: "root" });
      manager.register({ sessionId: "child", parentSessionId: "root" });
      const grand = manager.register({ sessionId: "grand", parentSessionId: "child" });
      expect(grand.depth).toBe(2);
    });

    it("should get root session id", () => {
      manager.register({ sessionId: "root" });
      manager.register({ sessionId: "child", parentSessionId: "root" });
      manager.register({ sessionId: "grand", parentSessionId: "child" });
      expect(manager.getRootSessionId("grand")).toBe("root");
    });

    it("should get children", () => {
      manager.register({ sessionId: "root" });
      manager.register({ sessionId: "c1", parentSessionId: "root" });
      manager.register({ sessionId: "c2", parentSessionId: "root" });
      expect(manager.getChildren("root")).toEqual(["c1", "c2"]);
    });

    it("should remove session", () => {
      manager.register({ sessionId: "root" });
      manager.register({ sessionId: "child", parentSessionId: "root" });
      manager.remove("child");
      expect(manager.getChildren("root")).toEqual([]);
      expect(manager.get("child")).toBeUndefined();
    });

    it("should clear all lineage", () => {
      manager.register({ sessionId: "root" });
      manager.clear();
      expect(manager.get("root")).toBeUndefined();
    });
  });

  describe("getSessionLineageManager singleton", () => {
    beforeEach(() => {
      resetSessionLineageManager();
    });

    it("should return same instance", () => {
      const m1 = getSessionLineageManager();
      const m2 = getSessionLineageManager();
      expect(m1).toBe(m2);
    });

    it("should reset on resetSessionLineageManager", () => {
      const m1 = getSessionLineageManager();
      resetSessionLineageManager();
      const m2 = getSessionLineageManager();
      expect(m1).not.toBe(m2);
    });
  });
});
