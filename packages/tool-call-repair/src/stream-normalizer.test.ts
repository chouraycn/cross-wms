import { describe, it, expect } from "vitest";
import {
  normalizePlainTextToolCallStreamEvents,
  scrubOverCapPlainTextToolCallMessage,
  type PlainTextToolCallNameMatcher,
  type PlainTextToolCallStreamNormalizerOptions,
} from "./stream-normalizer.js";

describe("stream-normalizer", () => {
  const matcher: PlainTextToolCallNameMatcher = {
    hasExactName: (name) => name === "echo",
    hasNamePrefix: (prefix) => "echo".startsWith(prefix),
  };

  it("returns empty iterable when no text is buffered", () => {
    const options: PlainTextToolCallStreamNormalizerOptions = {
      matcher,
      createPromotedToolCallEvents: () => [],
      normalizeDoneMessage: () => undefined,
    };
    const events = normalizePlainTextToolCallStreamEvents([], options);
    expect(Array.from(events)).toHaveLength(0);
  });

  it("returns undefined when tool-call text is within the buffer cap", () => {
    const message = { role: "assistant", content: "[tool:echo]\n{\"x\":\"y\"}" };
    const result = scrubOverCapPlainTextToolCallMessage({
      candidateText: "[tool:echo]\n{\"x\":\"y\"}",
      matcher,
      message,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined for messages without repairable text", () => {
    const message = { role: "assistant", content: "Hello world" };
    const result = scrubOverCapPlainTextToolCallMessage({
      candidateText: "Hello world",
      matcher,
      message,
    });
    expect(result).toBeUndefined();
  });
});
