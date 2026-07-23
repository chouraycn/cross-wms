// 事件指标辅助函数测试，覆盖 record 规范化与有限非负数字提取。
import { describe, expect, it } from "vitest";
import {
  asOptionalRecord,
  firstFiniteTalkEventNumber,
} from "../event-metrics.js";

describe("asOptionalRecord", () => {
  it("returns the record for plain objects", () => {
    const obj = { a: 1 };
    expect(asOptionalRecord(obj)).toBe(obj);
  });

  it("returns undefined for null, primitives, and arrays", () => {
    expect(asOptionalRecord(null)).toBeUndefined();
    expect(asOptionalRecord(undefined)).toBeUndefined();
    expect(asOptionalRecord("str")).toBeUndefined();
    expect(asOptionalRecord(42)).toBeUndefined();
    expect(asOptionalRecord([1, 2])).toBeUndefined();
  });

  it("returns the record for object instances like Date", () => {
    const date = new Date();
    expect(asOptionalRecord(date)).toBe(date);
  });
});

describe("firstFiniteTalkEventNumber", () => {
  it("returns undefined when record is undefined", () => {
    expect(firstFiniteTalkEventNumber(undefined, ["durationMs"])).toBeUndefined();
  });

  it("returns the first matching finite non-negative number", () => {
    expect(
      firstFiniteTalkEventNumber({ latencyMs: 12 }, ["durationMs", "latencyMs", "elapsedMs"]),
    ).toBe(12);
  });

  it("skips non-number, negative, NaN, and Infinity values", () => {
    expect(
      firstFiniteTalkEventNumber(
        { a: "nope", b: -1, c: Number.NaN, d: Number.POSITIVE_INFINITY, e: 7 },
        ["a", "b", "c", "d", "e"],
      ),
    ).toBe(7);
  });

  it("returns undefined when no key matches", () => {
    expect(firstFiniteTalkEventNumber({ foo: 1 }, ["bar"])).toBeUndefined();
    expect(firstFiniteTalkEventNumber({ bar: "nope" }, ["bar"])).toBeUndefined();
  });

  it("returns 0 as a valid value", () => {
    expect(firstFiniteTalkEventNumber({ durationMs: 0 }, ["durationMs"])).toBe(0);
  });
});
