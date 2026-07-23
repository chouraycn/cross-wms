// 代理咨询运行时测试，覆盖可见文本回传、空结果回退、abort 回退与参数透传。
import { describe, expect, it, vi } from "vitest";
import { consultRealtimeVoiceAgent } from "../agent-consult-runtime.js";
import type {
  RealtimeVoiceAgentConsultRuntime,
  RealtimeVoiceAgentConsultRunParams,
  RealtimeVoiceAgentConsultRunResult,
} from "../agent-consult-runtime.js";

function makeRuntime(
  result: RealtimeVoiceAgentConsultRunResult,
): RealtimeVoiceAgentConsultRuntime & { calls: RealtimeVoiceAgentConsultRunParams[] } {
  const calls: RealtimeVoiceAgentConsultRunParams[] = [];
  return {
    calls,
    async consult(params) {
      calls.push(params);
      return result;
    },
  };
}

describe("consultRealtimeVoiceAgent", () => {
  it("returns visible speakable text from agent payloads", async () => {
    const runtime = makeRuntime({
      payloads: [{ text: "The order is shipped." }, { text: "It arrives tomorrow." }],
    });
    const result = await consultRealtimeVoiceAgent({
      agentRuntime: runtime,
      logger: {},
      sessionKey: "session-1",
      args: { question: "where is my order" },
      transcript: [],
      surface: "voice bridge",
      userLabel: "customer",
    });
    expect(result.text).toContain("The order is shipped.");
    expect(result.text).toContain("It arrives tomorrow.");
  });

  it("skips reasoning and error payloads when collecting visible text", async () => {
    const runtime = makeRuntime({
      payloads: [
        { text: "thinking...", isReasoning: true },
        { text: "boom", isError: true },
        { text: "Final answer." },
      ],
    });
    const result = await consultRealtimeVoiceAgent({
      agentRuntime: runtime,
      logger: {},
      sessionKey: "session-1",
      args: { question: "hi" },
      transcript: [],
      surface: "voice",
      userLabel: "user",
    });
    expect(result.text).toBe("Final answer.");
  });

  it("returns fallback text and warns when agent produced no speakable text", async () => {
    const warn = vi.fn();
    const runtime = makeRuntime({ payloads: [] });
    const result = await consultRealtimeVoiceAgent({
      agentRuntime: runtime,
      logger: { warn },
      sessionKey: "session-1",
      args: { question: "hi" },
      transcript: [],
      surface: "voice",
      userLabel: "user",
      fallbackText: "standby",
    });
    expect(result.text).toBe("standby");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no speakable text"));
  });

  it("returns fallback text and warns when the agent run was aborted", async () => {
    const warn = vi.fn();
    const runtime = makeRuntime({ payloads: [], meta: { aborted: true } });
    const result = await consultRealtimeVoiceAgent({
      agentRuntime: runtime,
      logger: { warn },
      sessionKey: "session-1",
      args: { question: "hi" },
      transcript: [],
      surface: "voice",
      userLabel: "user",
    });
    expect(result.text).toBe("I need a moment to verify that before answering.");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("aborted"));
  });

  it("forwards timeoutMs, toolsAllow, and extraSystemPrompt to the agent runtime", async () => {
    const runtime = makeRuntime({ payloads: [{ text: "ok" }] });
    await consultRealtimeVoiceAgent({
      agentRuntime: runtime,
      logger: {},
      sessionKey: "session-1",
      args: { question: "hi" },
      transcript: [],
      surface: "voice",
      userLabel: "user",
      timeoutMs: 5000,
      toolsAllow: ["read"],
      extraSystemPrompt: "custom system prompt",
    });
    expect(runtime.calls[0]).toMatchObject({
      sessionKey: "session-1",
      timeoutMs: 5000,
      toolsAllow: ["read"],
      extraSystemPrompt: "custom system prompt",
    });
  });

  it("uses the default system prompt when none is provided", async () => {
    const runtime = makeRuntime({ payloads: [{ text: "ok" }] });
    await consultRealtimeVoiceAgent({
      agentRuntime: runtime,
      logger: {},
      sessionKey: "session-1",
      args: { question: "hi" },
      transcript: [],
      surface: "voice",
      userLabel: "user",
    });
    expect(runtime.calls[0].extraSystemPrompt).toContain("configured agent");
  });

  it("includes transcript entries in the built prompt", async () => {
    const runtime = makeRuntime({ payloads: [{ text: "ok" }] });
    await consultRealtimeVoiceAgent({
      agentRuntime: runtime,
      logger: {},
      sessionKey: "session-1",
      args: { question: "status" },
      transcript: [
        { role: "user", text: "hello" },
        { role: "assistant", text: "hi there" },
      ],
      surface: "voice",
      userLabel: "caller",
    });
    expect(runtime.calls[0].prompt).toContain("caller: hello");
    expect(runtime.calls[0].prompt).toContain("Agent: hi there");
    expect(runtime.calls[0].prompt).toContain("status");
  });
});
