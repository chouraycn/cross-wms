// 快速上下文运行时测试，覆盖禁用、无管理器、空命中、命中、超时与回退策略。
import { describe, expect, it, vi } from "vitest";
import { resolveRealtimeVoiceFastContextConsult } from "../fast-context-runtime.js";
import type { RealtimeVoiceFastContextConfig } from "../fast-context-runtime.js";

function makeConfig(overrides: Partial<RealtimeVoiceFastContextConfig> = {}): RealtimeVoiceFastContextConfig {
  return {
    enabled: true,
    maxResults: 3,
    sources: ["memory"],
    timeoutMs: 1000,
    fallbackToConsult: false,
    ...overrides,
  };
}

describe("resolveRealtimeVoiceFastContextConsult", () => {
  it("returns handled=false when fast context is disabled", async () => {
    const result = await resolveRealtimeVoiceFastContextConsult({
      cfg: {},
      agentId: "agent-1",
      sessionKey: "session-1",
      config: makeConfig({ enabled: false }),
      args: { question: "what" },
      logger: {},
    });
    expect(result).toEqual({ handled: false });
  });

  it("returns handled=false when no search manager and fallbackToConsult is true", async () => {
    const result = await resolveRealtimeVoiceFastContextConsult({
      cfg: {},
      agentId: "agent-1",
      sessionKey: "session-1",
      config: makeConfig({ fallbackToConsult: true }),
      args: { question: "what" },
      logger: {},
      resolveSearchManager: async () => ({ manager: undefined, error: "none" }),
    });
    expect(result).toEqual({ handled: false });
  });

  it("returns a miss text when no search manager and fallbackToConsult is false", async () => {
    const result = await resolveRealtimeVoiceFastContextConsult({
      cfg: {},
      agentId: "agent-1",
      sessionKey: "session-1",
      config: makeConfig({ fallbackToConsult: false }),
      args: { question: "what is this" },
      logger: {},
      resolveSearchManager: async () => ({ manager: undefined, error: "none" }),
    });
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.result.text).toContain("No relevant");
      expect(result.result.text).toContain("what is this");
    }
  });

  it("returns handled=false on empty hits when fallbackToConsult is true", async () => {
    const result = await resolveRealtimeVoiceFastContextConsult({
      cfg: {},
      agentId: "agent-1",
      sessionKey: "session-1",
      config: makeConfig({ fallbackToConsult: true }),
      args: { question: "what" },
      logger: {},
      resolveSearchManager: async () => ({
        manager: { search: async () => [] },
      }),
    });
    expect(result).toEqual({ handled: false });
  });

  it("returns context text with hits when the search returns results", async () => {
    const result = await resolveRealtimeVoiceFastContextConsult({
      cfg: {},
      agentId: "agent-1",
      sessionKey: "session-1",
      config: makeConfig(),
      args: { question: "where is the order" },
      logger: {},
      resolveSearchManager: async () => ({
        manager: {
          search: async () => [
            {
              path: "orders/123.md",
              startLine: 1,
              endLine: 5,
              snippet: "Order 123 shipped on Tuesday.",
              source: "memory",
              score: 0.9,
            },
          ],
        },
      }),
    });
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.result.text).toContain("Order 123 shipped");
      expect(result.result.text).toContain("where is the order");
      expect(result.result.text).toContain("orders/123.md:1-5");
    }
  });

  it("returns handled=false on search timeout when fallbackToConsult is true", async () => {
    const result = await resolveRealtimeVoiceFastContextConsult({
      cfg: {},
      agentId: "agent-1",
      sessionKey: "session-1",
      config: makeConfig({ fallbackToConsult: true, timeoutMs: 10 }),
      args: { question: "what" },
      logger: {},
      resolveSearchManager: async () => ({
        manager: {
          search: async () => new Promise(() => undefined), // never resolves
        },
      }),
    });
    expect(result).toEqual({ handled: false });
  });

  it("returns a miss text on search timeout when fallbackToConsult is false", async () => {
    const result = await resolveRealtimeVoiceFastContextConsult({
      cfg: {},
      agentId: "agent-1",
      sessionKey: "session-1",
      config: makeConfig({ fallbackToConsult: false, timeoutMs: 10 }),
      args: { question: "what is this" },
      logger: {},
      resolveSearchManager: async () => ({
        manager: {
          search: async () => new Promise(() => undefined),
        },
      }),
    });
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.result.text).toContain("No relevant");
    }
  });

  it("uses injected labels in the generated context text", async () => {
    const result = await resolveRealtimeVoiceFastContextConsult({
      cfg: {},
      agentId: "agent-1",
      sessionKey: "session-1",
      config: makeConfig(),
      args: { question: "status" },
      logger: {},
      labels: { audienceLabel: "operator", contextName: "ops context" },
      resolveSearchManager: async () => ({
        manager: {
          search: async () => [
            {
              path: "ops/log.md",
              startLine: 1,
              endLine: 2,
              snippet: "all systems nominal",
              source: "memory",
              score: 1,
            },
          ],
        },
      }),
    });
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.result.text).toContain("operator");
      expect(result.result.text).toContain("ops context");
    }
  });
});
