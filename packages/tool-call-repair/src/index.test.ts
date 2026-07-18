import { describe, it, expect } from "vitest";
import {
  parseStandalonePlainTextToolCallBlocks,
  stripPlainTextToolCallBlocks,
  extractStandalonePlainTextToolCallText,
  promoteStandalonePlainTextToolCallMessage,
  normalizePlainTextToolCallStreamEvents,
  scrubOverCapPlainTextToolCallMessage,
} from "./index.js";

describe("tool-call-repair public API", () => {
  it("exports parseStandalonePlainTextToolCallBlocks", () => {
    const blocks = parseStandalonePlainTextToolCallBlocks("[tool:echo]\n{\"m\":\"hi\"}");
    expect(blocks).toHaveLength(1);
  });

  it("exports stripPlainTextToolCallBlocks", () => {
    expect(stripPlainTextToolCallBlocks("a [tool:x]{} b")).toBe("a [tool:x]{} b");
    expect(stripPlainTextToolCallBlocks("a\n[tool:x]{}\nb")).toBe("a\nb");
  });

  it("exports promoteStandalonePlainTextToolCallMessage", () => {
    const message = { role: "assistant" as const, content: "[tool:echo]\n{}" };
    const options = {
      allowedToolNames: new Set(["echo"]),
      createToolCallBlock: () => ({ id: "call_1", type: "function" as const, function: { name: "echo", arguments: "{}" } }),
      message,
    };
    const promoted = promoteStandalonePlainTextToolCallMessage(options);
    expect(promoted).toBeDefined();
  });

  it("exports normalizePlainTextToolCallStreamEvents", () => {
    const events = normalizePlainTextToolCallStreamEvents([], {
      matcher: { hasExactName: () => false, hasNamePrefix: () => false },
      createPromotedToolCallEvents: () => [],
      normalizeDoneMessage: () => undefined,
    });
    expect(Array.from(events)).toHaveLength(0);
  });

  it("exports scrubOverCapPlainTextToolCallMessage", () => {
    const matcher = { hasExactName: (name: string) => name === "echo", hasNamePrefix: (prefix: string) => "echo".startsWith(prefix) };
    const result = scrubOverCapPlainTextToolCallMessage({
      candidateText: "[tool:echo]\n{}",
      matcher,
      message: { role: "assistant", content: "[tool:echo]\n{}" },
    });
    expect(result).toBeUndefined();
  });

  it("exports extractStandalonePlainTextToolCallText", () => {
    expect(
      extractStandalonePlainTextToolCallText({ message: { role: "assistant", content: "[tool:x]\n{}" } }),
    ).toBe("[tool:x]\n{}");
  });
});
