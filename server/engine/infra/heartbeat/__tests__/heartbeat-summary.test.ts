import { describe, expect, it } from "vitest";
import {
  isHeartbeatEnabledForAgent,
  resolveHeartbeatIntervalMs,
  resolveHeartbeatSummaryForAgent,
} from "../heartbeat-summary.js";
import type { OpenClawConfig } from "../_runtime-stubs.js";

describe("resolveHeartbeatIntervalMs", () => {
  it("应该解析 overrideEvery 字符串为毫秒", () => {
    expect(resolveHeartbeatIntervalMs({}, "30m")).toBe(30 * 60_000);
  });

  it("应该支持不同单位", () => {
    expect(resolveHeartbeatIntervalMs({}, "1h")).toBe(3_600_000);
    expect(resolveHeartbeatIntervalMs({}, "90s")).toBe(90_000);
    expect(resolveHeartbeatIntervalMs({}, "5000ms")).toBe(5_000);
  });

  it("无单位时应默认按分钟解析", () => {
    expect(resolveHeartbeatIntervalMs({}, "5")).toBe(5 * 60_000);
  });

  it("应该回退到 heartbeat.every", () => {
    expect(resolveHeartbeatIntervalMs({}, undefined, { every: "10m" })).toBe(600_000);
  });

  it("应该回退到 defaults.heartbeat.every", () => {
    const cfg: OpenClawConfig = { agents: { defaults: { heartbeat: { every: "15m" } } } };
    expect(resolveHeartbeatIntervalMs(cfg)).toBe(900_000);
  });

  it("无任何配置时应使用默认 30m", () => {
    expect(resolveHeartbeatIntervalMs({})).toBe(1_800_000);
  });

  it("非法时长应返回 null", () => {
    expect(resolveHeartbeatIntervalMs({}, "not-a-duration")).toBeNull();
  });

  it("空字符串应返回 null", () => {
    expect(resolveHeartbeatIntervalMs({}, "")).toBeNull();
    expect(resolveHeartbeatIntervalMs({}, "   ")).toBeNull();
  });

  it("零或负时长应返回 null", () => {
    expect(resolveHeartbeatIntervalMs({}, "0m")).toBeNull();
    expect(resolveHeartbeatIntervalMs({}, "-5m")).toBeNull();
  });
});

describe("isHeartbeatEnabledForAgent", () => {
  it("显式配置了 heartbeat 的 agent 应返回 true", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "agent-1", heartbeat: { every: "5m" } }] },
    };
    expect(isHeartbeatEnabledForAgent(cfg, "agent-1")).toBe(true);
  });

  it("未配置 heartbeat 的 agent 在存在显式 heartbeat agent 时应返回 false", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "agent-1", heartbeat: { every: "5m" } }, { id: "agent-2" }] },
    };
    expect(isHeartbeatEnabledForAgent(cfg, "agent-2")).toBe(false);
  });

  it("无显式 heartbeat agent 但有 defaults.heartbeat 时应返回 true", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { heartbeat: { every: "5m" } }, list: [{ id: "agent-1" }] },
    };
    expect(isHeartbeatEnabledForAgent(cfg, "agent-1")).toBe(true);
  });

  it("无任何 heartbeat 配置时，默认 agent 应返回 true", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "agent-1" }] },
    };
    expect(isHeartbeatEnabledForAgent(cfg, "agent-1")).toBe(true);
  });

  it("无任何 heartbeat 配置时，非默认 agent 应返回 false", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "agent-1" }] },
    };
    expect(isHeartbeatEnabledForAgent(cfg, "agent-2")).toBe(false);
  });
});

describe("resolveHeartbeatSummaryForAgent", () => {
  it("禁用的 agent 应返回 enabled=false 且 every='disabled'", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "agent-1", heartbeat: { every: "5m" } }, { id: "agent-2" }] },
    };
    const summary = resolveHeartbeatSummaryForAgent(cfg, "agent-2");
    expect(summary.enabled).toBe(false);
    expect(summary.every).toBe("disabled");
    expect(summary.everyMs).toBeNull();
  });

  it("启用的 agent 应返回解析后的配置", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "agent-1", heartbeat: { every: "10m", target: "telegram" } }] },
    };
    const summary = resolveHeartbeatSummaryForAgent(cfg, "agent-1");
    expect(summary.enabled).toBe(true);
    expect(summary.every).toBe("10m");
    expect(summary.everyMs).toBe(600_000);
    expect(summary.target).toBe("telegram");
  });

  it("应该使用默认 ackMaxChars=280", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "agent-1", heartbeat: { every: "5m" } }] },
    };
    const summary = resolveHeartbeatSummaryForAgent(cfg, "agent-1");
    expect(summary.ackMaxChars).toBe(280);
  });

  it("defaults.heartbeat 应与 per-agent overrides 合并", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: { heartbeat: { prompt: "default-prompt", ackMaxChars: 100 } },
        list: [{ id: "agent-1", heartbeat: { every: "5m", target: "slack" } }],
      },
    };
    const summary = resolveHeartbeatSummaryForAgent(cfg, "agent-1");
    expect(summary.enabled).toBe(true);
    expect(summary.prompt).toBe("default-prompt");
    expect(summary.target).toBe("slack");
    expect(summary.ackMaxChars).toBe(100);
  });

  it("负的 ackMaxChars 应被规范化为 0", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { heartbeat: { ackMaxChars: -5 } }, list: [{ id: "agent-1" }] },
    };
    const summary = resolveHeartbeatSummaryForAgent(cfg, "agent-1");
    expect(summary.ackMaxChars).toBe(0);
  });
});
