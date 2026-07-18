import { describe, it, expect } from "vitest";
import {
  parseStandalonePlainTextToolCallBlocks,
  stripPlainTextToolCallBlocks,
  type PlainTextToolCallParseOptions,
} from "./payload.js";

describe("payload", () => {
  it("parses a bracketed tool call with a JSON payload", () => {
    const text = "[tool:web_search]\n{\"query\": \"vitest\"}";
    const blocks = parseStandalonePlainTextToolCallBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks![0].name).toBe("web_search");
    expect(blocks![0].arguments).toEqual({ query: "vitest" });
    expect(blocks![0].raw).toBe(text);
  });

  it("parses [tool:name] syntax", () => {
    const text = "[tool:calculator]{\"expression\": \"1 + 1\"}";
    const blocks = parseStandalonePlainTextToolCallBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks![0].name).toBe("calculator");
    expect(blocks![0].arguments).toEqual({ expression: "1 + 1" });
  });

  it("ignores non-tool brackets", () => {
    const text = "This is a [link](url) and normal text.";
    const blocks = parseStandalonePlainTextToolCallBlocks(text);
    expect(blocks).toBeNull();
  });

  it("respects allowedToolNames allowlist", () => {
    const text = "[tool:allowed_tool]\n{}";
    const options: PlainTextToolCallParseOptions = {
      allowedToolNames: ["allowed_tool"],
    };
    const blocks = parseStandalonePlainTextToolCallBlocks(text, options);
    expect(blocks).toHaveLength(1);
  });

  it("returns undefined when tool name is not in allowlist", () => {
    const text = "[blocked_tool]\n{}";
    const options: PlainTextToolCallParseOptions = {
      allowedToolNames: ["allowed_tool"],
    };
    const blocks = parseStandalonePlainTextToolCallBlocks(text, options);
    expect(blocks).toBeNull();
  });

  it("strips full-line tool-call blocks from surrounding text", () => {
    const text = "Before\n[tool:x]{\"a\":1}\nafter";
    const stripped = stripPlainTextToolCallBlocks(text);
    expect(stripped).toBe("Before\nafter");
  });

  it("returns original text when no blocks are found", () => {
    const text = "Just plain text.";
    const stripped = stripPlainTextToolCallBlocks(text);
    expect(stripped).toBe(text);
  });

  it("enforces maxPayloadBytes", () => {
    const text = "[tool:x]{\"payload\": \"very long\"}";
    const options: PlainTextToolCallParseOptions = { maxPayloadBytes: 1 };
    const blocks = parseStandalonePlainTextToolCallBlocks(text, options);
    expect(blocks).toBeNull();
  });
});
