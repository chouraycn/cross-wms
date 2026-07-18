// 代理咨询工具测试，覆盖参数解析、工具合并策略与 prompt 构建。
import { describe, expect, it } from "vitest";
import {
  REALTIME_VOICE_AGENT_CONSULT_TOOL,
  REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
  buildRealtimeVoiceAgentConsultChatMessage,
  buildRealtimeVoiceAgentConsultPrompt,
  collectRealtimeVoiceAgentConsultVisibleText,
  isRealtimeVoiceAgentConsultToolPolicy,
  parseRealtimeVoiceAgentConsultArgs,
  resolveRealtimeVoiceAgentConsultTools,
  resolveRealtimeVoiceAgentConsultToolsAllow,
  resolveRealtimeVoiceAgentConsultToolPolicy,
} from "../agent-consult-tool.js";

describe("realtime voice agent consult tool", () => {
  it("parses consult tool args from object payload", () => {
    const parsed = parseRealtimeVoiceAgentConsultArgs({
      question: "what is the status?",
      context: "voice call",
      responseStyle: "brief",
    });
    expect(parsed).toEqual({
      question: "what is the status?",
      context: "voice call",
      responseStyle: "brief",
    });
  });

  it("throws when question is missing", () => {
    expect(() => parseRealtimeVoiceAgentConsultArgs({ context: "no question" })).toThrow(
      "question required",
    );
  });

  it("resolves consult tool policy with fallback", () => {
    expect(resolveRealtimeVoiceAgentConsultToolPolicy("safe-read-only", "owner")).toBe(
      "safe-read-only",
    );
    expect(resolveRealtimeVoiceAgentConsultToolPolicy("invalid", "owner")).toBe("owner");
    expect(resolveRealtimeVoiceAgentConsultToolPolicy(undefined, "none")).toBe("none");
    expect(isRealtimeVoiceAgentConsultToolPolicy("owner")).toBe(true);
    expect(isRealtimeVoiceAgentConsultToolPolicy("invalid")).toBe(false);
  });

  it("resolves tools list with consult tool first when policy allows", () => {
    const customTool = {
      type: "function" as const,
      name: "custom_tool",
      description: "custom",
      parameters: { type: "object" as const, properties: {} },
    };
    const tools = resolveRealtimeVoiceAgentConsultTools("safe-read-only", [customTool]);
    expect(tools[0].name).toBe(REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME);
    expect(tools[1].name).toBe("custom_tool");
    expect(tools.length).toBe(2);

    // When policy is "none", the consult tool is not included.
    const noTools = resolveRealtimeVoiceAgentConsultTools("none", [customTool]);
    expect(noTools).toEqual([customTool]);
  });

  it("resolves tool allowlist based on policy", () => {
    expect(resolveRealtimeVoiceAgentConsultToolsAllow("owner")).toBeUndefined();
    expect(resolveRealtimeVoiceAgentConsultToolsAllow("safe-read-only")).toContain("read");
    expect(resolveRealtimeVoiceAgentConsultToolsAllow("none")).toEqual([]);
  });

  it("builds a chat message and prompt from consult args", () => {
    const chatMessage = buildRealtimeVoiceAgentConsultChatMessage({
      question: "status?",
      context: "ctx",
    });
    expect(chatMessage).toContain("status?");
    expect(chatMessage).toContain("Context:\nctx");

    const prompt = buildRealtimeVoiceAgentConsultPrompt({
      args: { question: "hello?" },
      transcript: [{ role: "user", text: "hi" }],
      surface: "voice",
      userLabel: "User",
    });
    expect(prompt).toContain("Live voice request");
    expect(prompt).toContain("hello?");
    expect(prompt).toContain("User: hi");
  });

  it("collects visible text while skipping reasoning and errors", () => {
    const text = collectRealtimeVoiceAgentConsultVisibleText([
      { text: "hello" },
      { text: "world", isReasoning: true },
      { text: "error", isError: true },
      { text: "result" },
    ]);
    expect(text).toBe("hello\n\nresult");

    expect(collectRealtimeVoiceAgentConsultVisibleText([])).toBeNull();
  });

  it("exposes the shared tool descriptor", () => {
    expect(REALTIME_VOICE_AGENT_CONSULT_TOOL.name).toBe(REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME);
    expect(REALTIME_VOICE_AGENT_CONSULT_TOOL.type).toBe("function");
    expect(REALTIME_VOICE_AGENT_CONSULT_TOOL.parameters.required).toEqual(["question"]);
  });
});
