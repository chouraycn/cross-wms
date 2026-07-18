import { describe, it, expect } from "vitest";
import {
  END_TOOL_REQUEST,
  HARMONY_CALL_MARKER,
  HARMONY_CHANNEL_MARKER,
  HARMONY_MESSAGE_MARKER,
  consumeJsonToolClosingMarker,
  consumeLineBreak,
  findBracketedJsonPayloadStart,
  findHarmonyJsonPayloadStart,
  findJsonObjectEnd,
  findXmlishToolCallEnd,
  indexOfAsciiMarkerIgnoreCase,
  isPlainTextToolNameChar,
  isXmlishNameChar,
  matchesLiteralPrefix,
  skipHorizontalWhitespace,
  skipSerializedToolCallTrailingLineBreak,
  skipWhitespace,
  startsWithAsciiMarkerIgnoreCase,
} from "./grammar.js";

describe("grammar", () => {
  it("matches literal or prefix", () => {
    expect(matchesLiteralPrefix("abc", "abcdef")).toBe(true);
    expect(matchesLiteralPrefix("abcdef", "abc")).toBe(true);
    expect(matchesLiteralPrefix("xyz", "abc")).toBe(false);
  });

  it("identifies plain-text tool name chars", () => {
    expect(isPlainTextToolNameChar("a")).toBe(true);
    expect(isPlainTextToolNameChar("_")).toBe(true);
    expect(isPlainTextToolNameChar("-")).toBe(true);
    expect(isPlainTextToolNameChar("!")).toBe(false);
    expect(isPlainTextToolNameChar(undefined)).toBe(false);
  });

  it("identifies XML-ish name chars", () => {
    expect(isXmlishNameChar(".")).toBe(true);
    expect(isXmlishNameChar(":")).toBe(true);
    expect(isXmlishNameChar("!")).toBe(false);
  });

  it("skips horizontal whitespace only", () => {
    expect(skipHorizontalWhitespace("  \t\n", 0)).toBe(3);
    expect(skipHorizontalWhitespace("abc", 0)).toBe(0);
  });

  it("skips all whitespace", () => {
    expect(skipWhitespace("  \t\n\rabc", 0)).toBe(5);
  });

  it("consumes line breaks", () => {
    expect(consumeLineBreak("\n", 0)).toBe(1);
    expect(consumeLineBreak("\r\n", 0)).toBe(2);
    expect(consumeLineBreak("a", 0)).toBeNull();
  });

  it("finds JSON object end", () => {
    expect(findJsonObjectEnd('{"a":1}', 0)).toBe(7);
    expect(findJsonObjectEnd('{"a":"\\"}"}', 0)).toBe(11);
    expect(findJsonObjectEnd("{", 0)).toBeNull();
  });

  it("finds bracketed JSON payload start", () => {
    expect(findBracketedJsonPayloadStart("[tool:x]\n{\"a\":1}")).toBe(9);
    expect(findBracketedJsonPayloadStart("not a tool")).toBeNull();
  });

  it("finds harmony JSON payload start", () => {
    const text = `${HARMONY_CHANNEL_MARKER}commentary to=web_search code\n{\"q\":\"v\"}`;
    expect(findHarmonyJsonPayloadStart(text)).toBeGreaterThan(0);
    expect(findHarmonyJsonPayloadStart("invalid")).toBeNull();
  });

  it("checks ASCII markers case-insensitively", () => {
    expect(startsWithAsciiMarkerIgnoreCase("<FUNCTION=foo>", 0, "<function=")).toBe(true);
    expect(startsWithAsciiMarkerIgnoreCase("<other>", 0, "<function=")).toBe(false);
  });

  it("finds ASCII marker index case-insensitively", () => {
    expect(indexOfAsciiMarkerIgnoreCase("abc<FUNCTION=x>", "<functio", 0)).toBe(3);
    expect(indexOfAsciiMarkerIgnoreCase("abc<FUNCTION=x>", "<function=", 0)).toBe(3);
    expect(indexOfAsciiMarkerIgnoreCase("abc", "<function=", 0)).toBe(-1);
  });

  it("finds XML-ish tool call end", () => {
    const xml = "<function=foo><parameter=bar>value</parameter></function>";
    expect(findXmlishToolCallEnd(xml)).toBe(xml.length);
    expect(findXmlishToolCallEnd("[tool:x]\n{}")).toBeNull();
  });

  it("consumes JSON tool closing markers", () => {
    expect(consumeJsonToolClosingMarker(`{}${END_TOOL_REQUEST}`, 2)).toBeGreaterThan(2);
    expect(consumeJsonToolClosingMarker("{}", 2)).toBe(2);
  });

  it("skips serialized tool call trailing line break", () => {
    expect(skipSerializedToolCallTrailingLineBreak("x\n", 1)).toBe(2);
    expect(skipSerializedToolCallTrailingLineBreak("x", 1)).toBe(1);
  });
});
