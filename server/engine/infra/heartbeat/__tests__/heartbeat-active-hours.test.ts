import { describe, expect, it } from "vitest";
import {
  resolveActiveHoursTimezone,
  isWithinActiveHours,
} from "../heartbeat-active-hours.js";
import type { HeartbeatActiveHoursConfig } from "../heartbeat-active-hours.js";

const utcNoon = new Date("2025-06-01T12:00:00Z").getTime();
const utcTen = new Date("2025-06-01T10:00:00Z").getTime();
const utcSeventeen = new Date("2025-06-01T17:00:00Z").getTime();
const utcTwentyThree = new Date("2025-06-01T23:00:00Z").getTime();
const utcFive = new Date("2025-06-01T05:00:00Z").getTime();

describe("resolveActiveHoursTimezone", () => {
  it("传入 'user' 或空值时应回退到用户时区", () => {
    const cfg = { agents: { defaults: { userTimezone: "Asia/Shanghai" } } };
    expect(resolveActiveHoursTimezone(cfg, "user")).toBe("Asia/Shanghai");
    expect(resolveActiveHoursTimezone(cfg, "  ")).toBe("Asia/Shanghai");
    expect(resolveActiveHoursTimezone(cfg, undefined)).toBe("Asia/Shanghai");
  });

  it("传入 'local' 时应返回宿主时区", () => {
    const host = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(resolveActiveHoursTimezone({}, "local")).toBe(host?.trim() || "UTC");
  });

  it("传入合法时区应原样返回", () => {
    expect(resolveActiveHoursTimezone({}, "America/New_York")).toBe("America/New_York");
    expect(resolveActiveHoursTimezone({}, "UTC")).toBe("UTC");
  });

  it("传入非法时区应回退到用户时区", () => {
    const cfg = { agents: { defaults: { userTimezone: "Europe/London" } } };
    expect(resolveActiveHoursTimezone(cfg, "Not/A_Real_Tz")).toBe("Europe/London");
  });

  it("无用户时区配置时应回退到宿主时区", () => {
    const host = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(resolveActiveHoursTimezone({}, "Not/A_Real_Tz")).toBe(host?.trim() || "UTC");
  });
});

describe("isWithinActiveHours", () => {
  it("未配置 activeHours 时应返回 true", () => {
    expect(isWithinActiveHours({}, undefined, utcNoon)).toBe(true);
    expect(isWithinActiveHours({}, {}, utcNoon)).toBe(true);
  });

  it("UTC 窗口内（09:00-17:00，10:00）应返回 true", () => {
    const hb: HeartbeatActiveHoursConfig = {
      activeHours: { start: "09:00", end: "17:00", timezone: "UTC" },
    };
    expect(isWithinActiveHours({}, hb, utcTen)).toBe(true);
  });

  it("UTC 窗口结束时刻（17:00）应为排他边界，返回 false", () => {
    const hb: HeartbeatActiveHoursConfig = {
      activeHours: { start: "09:00", end: "17:00", timezone: "UTC" },
    };
    expect(isWithinActiveHours({}, hb, utcSeventeen)).toBe(false);
  });

  it("UTC 窗口外（09:00-17:00，05:00）应返回 false", () => {
    const hb: HeartbeatActiveHoursConfig = {
      activeHours: { start: "09:00", end: "17:00", timezone: "UTC" },
    };
    expect(isWithinActiveHours({}, hb, utcFive)).toBe(false);
  });

  it("跨天窗口（22:00-06:00，23:00）应返回 true", () => {
    const hb: HeartbeatActiveHoursConfig = {
      activeHours: { start: "22:00", end: "06:00", timezone: "UTC" },
    };
    expect(isWithinActiveHours({}, hb, utcTwentyThree)).toBe(true);
  });

  it("跨天窗口（22:00-06:00，05:00）应返回 true", () => {
    const hb: HeartbeatActiveHoursConfig = {
      activeHours: { start: "22:00", end: "06:00", timezone: "UTC" },
    };
    expect(isWithinActiveHours({}, hb, utcFive)).toBe(true);
  });

  it("跨天窗口（22:00-06:00，12:00）应返回 false", () => {
    const hb: HeartbeatActiveHoursConfig = {
      activeHours: { start: "22:00", end: "06:00", timezone: "UTC" },
    };
    expect(isWithinActiveHours({}, hb, utcNoon)).toBe(false);
  });

  it("start === end 时应返回 false（空窗口）", () => {
    const hb: HeartbeatActiveHoursConfig = {
      activeHours: { start: "09:00", end: "09:00", timezone: "UTC" },
    };
    expect(isWithinActiveHours({}, hb, utcTen)).toBe(false);
  });

  it("非法时间格式应视为未配置，返回 true", () => {
    const hb: HeartbeatActiveHoursConfig = {
      activeHours: { start: "bad", end: "17:00", timezone: "UTC" },
    };
    expect(isWithinActiveHours({}, hb, utcNoon)).toBe(true);
  });

  it("end 为 24:00 应被接受（包含到当天结束）", () => {
    const hb: HeartbeatActiveHoursConfig = {
      activeHours: { start: "22:00", end: "24:00", timezone: "UTC" },
    };
    expect(isWithinActiveHours({}, hb, utcTwentyThree)).toBe(true);
  });
});
