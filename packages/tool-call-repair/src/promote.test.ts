import { describe, it, expect } from "vitest";
import {
  extractStandalonePlainTextToolCallText,
  promoteStandalonePlainTextToolCallMessage,
  type PlainTextToolCallPromotionOptions,
} from "./promote.js";

describe("promote", () => {
  it("extracts tool-call text from a simple message", () => {
    const message = { role: "assistant", content: "[tool:echo]\n{\"message\":\"hi\"}" };
    expect(extractStandalonePlainTextToolCallText({ message })).toBe(
      "[tool:echo]\n{\"message\":\"hi\"}",
    );
  });

  it("promotes a tool-call message", () => {
    const message = { role: "assistant", content: "[tool:echo]\n{\"message\":\"hi\"}" };
    const options: PlainTextToolCallPromotionOptions = {
      allowedToolNames: new Set(["echo"]),
      createToolCallBlock: (block, resolvedName) => ({
        id: "call_1",
        type: "function",
        function: { name: resolvedName, arguments: JSON.stringify(block.arguments) },
      }),
      message,
    };

    const promoted = promoteStandalonePlainTextToolCallMessage(options);
    expect(promoted).toBeDefined();
    expect(promoted!.content).toHaveLength(1);
    expect((promoted!.content as Record<string, unknown>[])[0].function.name).toBe("echo");
  });

  it("returns undefined when no tool call text is present", () => {
    const message = { role: "assistant", content: "Hello!" };
    const options: PlainTextToolCallPromotionOptions = {
      allowedToolNames: new Set(["echo"]),
      createToolCallBlock: () => ({}),
      message,
    };
    expect(promoteStandalonePlainTextToolCallMessage(options)).toBeUndefined();
  });

  it("respects requireAssistantRole", () => {
    const message = { role: "user", content: "[tool:echo]\n{}" };
    const options: PlainTextToolCallPromotionOptions = {
      allowedToolNames: new Set(["echo"]),
      createToolCallBlock: () => ({}),
      message,
      requireAssistantRole: true,
    };
    expect(promoteStandalonePlainTextToolCallMessage(options)).toBeUndefined();
  });
});
