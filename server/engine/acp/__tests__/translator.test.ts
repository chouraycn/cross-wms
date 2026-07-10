import { describe, it, expect } from "vitest";
import { AcpTranslator } from "../translator.js";
import type { OpenAiChatCompletionRequest } from "../translator.js";
import type { AcpTurnEvent } from "../acpTypes.js";

describe("AcpTranslator", () => {
  const translator = new AcpTranslator();

  describe("translateOpenAiToAcp", () => {
    it("should translate basic OpenAI request", () => {
      const openAiRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        max_tokens: 100,
      };

      const acpRequest = translator.translateOpenAiToAcp(openAiRequest as unknown as OpenAiChatCompletionRequest);

      expect(acpRequest.model).toBe("gpt-4o");
      expect(acpRequest.messages).toEqual([{ role: "user", content: "Hello" }]);
      expect(acpRequest.temperature).toBe(0.7);
      expect(acpRequest.maxTokens).toBe(100);
    });

    it("should translate tools", () => {
      const openAiRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Search" }],
        tools: [{
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web",
            parameters: { type: "object", properties: { query: { type: "string" } } },
          },
        }],
      };

      const acpRequest = translator.translateOpenAiToAcp(openAiRequest as unknown as OpenAiChatCompletionRequest);

      expect(acpRequest.tools).toBeDefined();
      expect(acpRequest.tools?.length).toBe(1);
      expect(acpRequest.tools?.[0].name).toBe("web_search");
    });

    it("should translate tool_choice", () => {
      const openAiRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        tool_choice: "none",
      };

      const acpRequest = translator.translateOpenAiToAcp(openAiRequest as unknown as OpenAiChatCompletionRequest);

      expect(acpRequest.tool_choice).toBe("none");
    });
  });

  describe("translateAcpTurnToOpenAi", () => {
    it("should translate basic turn result", () => {
      const turnResult = {
        content: "Hello there!",
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };

      const response = translator.translateAcpTurnToOpenAi(turnResult, "req_123", "gpt-4o");

      expect(response.id).toBe("req_123");
      expect(response.object).toBe("chat.completion");
      expect(response.choices[0].message?.content).toBe("Hello there!");
      expect(response.choices[0].finish_reason).toBe("stop");
    });

    it("should translate tool calls", () => {
      const turnResult = {
        toolCalls: [{
          id: "tool_1",
          name: "web_search",
          input: { query: "hello" },
        }],
        finishReason: "tool_calls",
      };

      const response = translator.translateAcpTurnToOpenAi(turnResult, "req_123", "gpt-4o");

      expect(response.choices[0].message?.tool_calls).toBeDefined();
      expect(response.choices[0].message?.tool_calls?.[0].function.name).toBe("web_search");
    });
  });

  describe("translateAcpEventToOpenAiChunk", () => {
    it("should translate text_delta event", () => {
      const event = { type: "text_delta", text: "Hello" };
      const chunk = translator.translateAcpEventToOpenAiChunk(event as unknown as AcpTurnEvent, "req_123", "gpt-4o");

      expect(chunk).not.toBeNull();
      expect(chunk?.object).toBe("chat.completion.chunk");
      expect(chunk?.choices[0].delta?.content).toBe("Hello");
    });

    it("should translate tool_call event", () => {
      const event = { type: "tool_call", id: "tool_1", name: "search", input: { query: "test" } };
      const chunk = translator.translateAcpEventToOpenAiChunk(event as unknown as AcpTurnEvent, "req_123", "gpt-4o");

      expect(chunk).not.toBeNull();
      expect(chunk?.choices[0].delta?.tool_calls?.[0].function.name).toBe("search");
    });

    it("should translate done event", () => {
      const event = { type: "done", finishReason: "stop" };
      const chunk = translator.translateAcpEventToOpenAiChunk(event as unknown as AcpTurnEvent, "req_123", "gpt-4o");

      expect(chunk).not.toBeNull();
      expect(chunk?.choices[0].finish_reason).toBe("stop");
    });

    it("should return null for error event", () => {
      const event = { type: "error", error: "Failed" };
      const chunk = translator.translateAcpEventToOpenAiChunk(event as unknown as AcpTurnEvent, "req_123", "gpt-4o");

      expect(chunk).toBeNull();
    });
  });

  describe("translateToolResultToMessage", () => {
    it("should translate tool result", () => {
      const toolResult = { id: "tool_1", result: { data: "test" } };
      const message = translator.translateToolResultToMessage(toolResult);

      expect(message.role).toBe("tool");
      expect(message.content).toBe(JSON.stringify({ data: "test" }));
      expect(message.tool_call_id).toBe("tool_1");
    });
  });
});
