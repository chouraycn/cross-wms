import { describe, it, expect } from "vitest";
import {
  normalizeToUtc,
  isValidIso8601,
  parseAbsoluteTime,
  parseAbsoluteTimeMs,
} from "../parse.js";

describe("normalizeToUtc", () => {
  it("已带 Z 后缀的字符串保持不变", () => {
    expect(normalizeToUtc("2024-01-15T10:30:00Z")).toBe("2024-01-15T10:30:00Z");
  });

  it("带 +HH:MM 时区后缀的字符串保持不变", () => {
    expect(normalizeToUtc("2024-01-15T10:30:00+08:00")).toBe("2024-01-15T10:30:00+08:00");
  });

  it("纯日期字符串补齐 T00:00:00Z", () => {
    expect(normalizeToUtc("2024-01-15")).toBe("2024-01-15T00:00:00Z");
  });

  it("日期时间字符串缺时区时补 Z", () => {
    expect(normalizeToUtc("2024-01-15T10:30:00")).toBe("2024-01-15T10:30:00Z");
  });

  it("带秒和毫秒的日期时间字符串补 Z", () => {
    expect(normalizeToUtc("2024-01-15T10:30:00.500")).toBe("2024-01-15T10:30:00.500Z");
  });
});

describe("isValidIso8601", () => {
  it("合法的 ISO 8601 日期时间返回 true", () => {
    expect(isValidIso8601("2024-01-15T10:30:00Z")).toBe(true);
  });

  it("合法的纯日期返回 true", () => {
    expect(isValidIso8601("2024-01-15")).toBe(true);
  });

  it("非法的日历日期（02-31）返回 false", () => {
    expect(isValidIso8601("2024-02-31")).toBe(false);
  });

  it("非字符串输入返回 false", () => {
    expect(isValidIso8601(12345)).toBe(false);
    expect(isValidIso8601(null)).toBe(false);
    expect(isValidIso8601(undefined)).toBe(false);
  });

  it("空字符串返回 false", () => {
    expect(isValidIso8601("")).toBe(false);
    expect(isValidIso8601("   ")).toBe(false);
  });

  it("纯数字字符串返回 false（归 epoch 处理）", () => {
    expect(isValidIso8601("12345")).toBe(false);
  });

  it("非法格式返回 false", () => {
    expect(isValidIso8601("not-a-date")).toBe(false);
    expect(isValidIso8601("2024/01/15")).toBe(false);
  });

  it("24:00:00 合法的一天结束表达返回 true", () => {
    expect(isValidIso8601("2024-01-15T24:00:00Z")).toBe(true);
  });

  it("合法的带时区偏移日期返回 true", () => {
    expect(isValidIso8601("2024-01-15T10:30:00+08:00")).toBe(true);
  });

  it("非法的小时值返回 false", () => {
    expect(isValidIso8601("2024-01-15T25:00:00Z")).toBe(false);
  });
});

describe("parseAbsoluteTime", () => {
  it("解析 ISO 8601 字符串返回毫秒时间戳", () => {
    const ms = parseAbsoluteTime("2024-01-15T10:30:00Z");
    expect(ms).toBe(Date.UTC(2024, 0, 15, 10, 30, 0));
  });

  it("解析纯日期字符串返回 UTC 零点时间戳", () => {
    const ms = parseAbsoluteTime("2024-01-15");
    expect(ms).toBe(Date.UTC(2024, 0, 15, 0, 0, 0));
  });

  it("解析数字 epoch 毫秒", () => {
    const ms = parseAbsoluteTime(1700000000000);
    expect(ms).toBe(1700000000000);
  });

  it("解析纯数字字符串为 epoch 毫秒", () => {
    const ms = parseAbsoluteTime("1700000000000");
    expect(ms).toBe(1700000000000);
  });

  it("NaN 返回 null", () => {
    expect(parseAbsoluteTime(NaN)).toBeNull();
  });

  it("Infinity 返回 null", () => {
    expect(parseAbsoluteTime(Infinity)).toBeNull();
  });

  it("空字符串返回 null", () => {
    expect(parseAbsoluteTime("")).toBeNull();
    expect(parseAbsoluteTime("   ")).toBeNull();
  });

  it("非法日历日期返回 null", () => {
    expect(parseAbsoluteTime("2024-02-31")).toBeNull();
  });

  it("非法格式返回 null", () => {
    expect(parseAbsoluteTime("not-a-date")).toBeNull();
  });

  it("带时区偏移的字符串正确解析", () => {
    const ms = parseAbsoluteTime("2024-01-15T18:00:00+08:00");
    expect(ms).toBe(Date.UTC(2024, 0, 15, 10, 0, 0));
  });

  it("浮点数字截断为整数毫秒", () => {
    const ms = parseAbsoluteTime(1700000000.9);
    expect(ms).toBe(1700000000);
  });
});

describe("parseAbsoluteTimeMs", () => {
  it("与 parseAbsoluteTime 行为一致", () => {
    expect(parseAbsoluteTimeMs("2024-01-15T10:30:00Z")).toBe(
      parseAbsoluteTime("2024-01-15T10:30:00Z"),
    );
    expect(parseAbsoluteTimeMs(1700000000000)).toBe(1700000000000);
    expect(parseAbsoluteTimeMs("invalid")).toBeNull();
  });
});
