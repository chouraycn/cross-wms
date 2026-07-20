import { describe, expect, it, vi } from "vitest";
import type { AssistantMessage, Model, StreamFn } from "@cdf-know/llm-core";
import { generateSummary } from "./compaction";

// Minimal stub for createAssistantMessageEventStream
function createAssistantMessageEventStream(message: AssistantMessage): { result(): Promise<AssistantMessage>; push(event: unknown): void; end(): void } & AsyncIterable<unknown> {
  const events: unknown[] = [];
  let _resolve: ((msg: AssistantMessage) => void) | null = null;
  const resultPromise = new Promise<AssistantMessage>((resolve) => { _resolve = resolve; });
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    push(event: unknown) {
      events.push(event);
    },
    end(msg?: AssistantMessage) {
      if (msg && _resolve) _resolve(msg);
    },
    result: async () => resultPromise,
  };
}

describe("generateSummary thinking options", () => {
  it("maps explicit Fable off to low effort for compaction", async () => {
    const model: Model = {
      id: "production-fable",
      name: "Production Fable",
      api: "anthropic-messages",
      provider: "anthropic",
      reasoning: false,
      cost: { input: 0, output: 0 },
      contextWindow: 1_000_000,
      maxTokens: 128_000,
    };
    const summaryMessage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "summary" }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 1,
    };
    const streamFn = vi.fn().mockImplementation((_model: unknown, _context: unknown, options?: Record<string, unknown>) => {
      expect(options?.reasoning).toBe("low");
      const stream = createAssistantMessageEventStream(summaryMessage);
      return stream;
    });

    const result = await generateSummary(
      [{ role: "user", content: "hello", timestamp: 1 }],
      model,
      1000,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "off",
      streamFn as unknown as StreamFn,
    );

    expect(result).toEqual({ ok: true, value: "summary" });
    expect(streamFn).toHaveBeenCalledOnce();
  });
});
