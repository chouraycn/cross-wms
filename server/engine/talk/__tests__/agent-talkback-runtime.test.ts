// 代理回话队列测试，覆盖 debounce、串行执行、错误回退、abort 中止与停止态过滤。
import { describe, expect, it, vi } from "vitest";
import { createRealtimeVoiceAgentTalkbackQueue } from "../agent-talkback-runtime.js";

const TICK = 20;

function settle(ms = TICK): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeQueue(overrides: Partial<Parameters<typeof createRealtimeVoiceAgentTalkbackQueue>[0]> = {}) {
  const consult = vi.fn(async () => ({ text: "answer" }));
  const deliver = vi.fn();
  const params = {
    debounceMs: 1,
    isStopped: () => false,
    logger: { info: vi.fn(), warn: vi.fn() },
    logPrefix: "[test]",
    responseStyle: "concise",
    fallbackText: "fallback",
    consult,
    deliver,
    ...overrides,
  } as const;
  return { queue: createRealtimeVoiceAgentTalkbackQueue(params), consult, deliver, params };
}

describe("createRealtimeVoiceAgentTalkbackQueue", () => {
  it("debounces and runs a consult, delivering the result text", async () => {
    const { queue, consult, deliver } = makeQueue();
    queue.enqueue("what is the time");
    expect(consult).not.toHaveBeenCalled();
    await settle();
    expect(consult).toHaveBeenCalledTimes(1);
    expect(consult.mock.calls[0][0]).toMatchObject({
      question: "what is the time",
      responseStyle: "concise",
    });
    expect(deliver).toHaveBeenCalledWith("answer");
  });

  it("merges adjacent fragments sharing the same metadata into one consult", async () => {
    const { queue, consult } = makeQueue();
    const metadata = { lane: 1 };
    queue.enqueue("hello", metadata);
    queue.enqueue("world", metadata);
    await settle();
    expect(consult).toHaveBeenCalledTimes(1);
    expect(consult.mock.calls[0][0].question).toBe("hello\nworld");
  });

  it("delivers the fallback text when the consult throws a non-abort error", async () => {
    const consult = vi.fn(async () => {
      throw new Error("boom");
    });
    const deliver = vi.fn();
    const { queue } = makeQueue({ consult, deliver });
    queue.enqueue("question one");
    await settle();
    expect(deliver).toHaveBeenCalledWith("fallback");
  });

  it("does not deliver when the consult throws an AbortError (close aborted it)", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const consult = vi.fn((args: { signal: AbortSignal }) => {
      return new Promise<{ text: string }>((_resolve, reject) => {
        args.signal.addEventListener("abort", () => reject(abortError));
      });
    });
    const deliver = vi.fn();
    const { queue } = makeQueue({ consult, deliver });
    queue.enqueue("long question");
    await settle();
    // Consult is now in-flight; closing aborts it.
    queue.close();
    await settle();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("ignores empty and whitespace-only questions", async () => {
    const { queue, consult } = makeQueue();
    queue.enqueue("");
    queue.enqueue("   ");
    await settle();
    expect(consult).not.toHaveBeenCalled();
  });

  it("skips enqueueing when the session is already stopped", async () => {
    const { queue, consult } = makeQueue({ isStopped: () => true });
    queue.enqueue("hello");
    await settle();
    expect(consult).not.toHaveBeenCalled();
  });

  it("runs queued questions serially after an active consult finishes", async () => {
    let resolveFirst: (value: { text: string }) => void = () => undefined;
    const consult = vi.fn((args: { signal: AbortSignal }) => {
      const callIndex = consult.mock.calls.length;
      if (callIndex === 1) {
        return new Promise<{ text: string }>((resolve) => {
          resolveFirst = resolve;
        });
      }
      void args;
      return Promise.resolve({ text: "second answer" });
    });
    const deliver = vi.fn();
    const { queue } = makeQueue({ consult, deliver });
    queue.enqueue("first");
    await settle();
    // First consult is in-flight; enqueue second while active (different metadata lane).
    queue.enqueue("second", { lane: 2 });
    await settle();
    expect(deliver).not.toHaveBeenCalled();
    // Resolve first consult; the queue should drain the second.
    resolveFirst({ text: "first answer" });
    await settle();
    expect(deliver).toHaveBeenNthCalledWith(1, "first answer");
    expect(deliver).toHaveBeenNthCalledWith(2, "second answer");
  });
});
