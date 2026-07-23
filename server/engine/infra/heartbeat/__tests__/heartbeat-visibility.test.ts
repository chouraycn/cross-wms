import { describe, expect, it } from "vitest";
import { resolveHeartbeatVisibility } from "../heartbeat-visibility.js";
import type { OpenClawConfig } from "../_runtime-stubs.js";

describe("resolveHeartbeatVisibility", () => {
  it("无任何配置时应返回默认值（showOk=false, showAlerts=true, useIndicator=true）", () => {
    const result = resolveHeartbeatVisibility({ cfg: {}, channel: "telegram" });
    expect(result).toEqual({
      showOk: false,
      showAlerts: true,
      useIndicator: true,
    });
  });

  it("channel defaults 配置应覆盖默认值", () => {
    const cfg: OpenClawConfig = {
      channels: {
        defaults: { heartbeat: { showOk: true, showAlerts: false, useIndicator: false } },
      },
    };
    const result = resolveHeartbeatVisibility({ cfg, channel: "telegram" });
    expect(result).toEqual({ showOk: true, showAlerts: false, useIndicator: false });
  });

  it("webchat 仅使用 channel defaults，不读取 per-channel/account", () => {
    const cfg: OpenClawConfig = {
      channels: {
        defaults: { heartbeat: { showOk: true } },
        webchat: {
          heartbeat: { showOk: false },
          accounts: { acc1: { heartbeat: { showOk: true } } },
        },
      },
    };
    const result = resolveHeartbeatVisibility({ cfg, channel: "webchat", accountId: "acc1" });
    expect(result.showOk).toBe(true);
  });

  it("per-channel 配置应覆盖 channel defaults", () => {
    const cfg: OpenClawConfig = {
      channels: {
        defaults: { heartbeat: { showOk: true } },
        telegram: { heartbeat: { showOk: false } },
      },
    };
    const result = resolveHeartbeatVisibility({ cfg, channel: "telegram" });
    expect(result.showOk).toBe(false);
  });

  it("per-account 配置应具有最高优先级", () => {
    const cfg: OpenClawConfig = {
      channels: {
        defaults: { heartbeat: { showOk: false } },
        telegram: {
          heartbeat: { showOk: true },
          accounts: {
            acc1: { heartbeat: { showOk: false } },
          },
        },
      },
    };
    const result = resolveHeartbeatVisibility({ cfg, channel: "telegram", accountId: "acc1" });
    expect(result.showOk).toBe(false);
  });

  it("未提供 accountId 时应回退到 per-channel 再到 defaults", () => {
    const cfg: OpenClawConfig = {
      channels: {
        defaults: { heartbeat: { showAlerts: false } },
        telegram: { heartbeat: { showAlerts: true } },
      },
    };
    const result = resolveHeartbeatVisibility({ cfg, channel: "telegram" });
    expect(result.showAlerts).toBe(true);
  });

  it("每个字段应独立回退（部分字段在 account 层未配置时回退到 channel）", () => {
    const cfg: OpenClawConfig = {
      channels: {
        defaults: { heartbeat: { showOk: false, showAlerts: false, useIndicator: false } },
        telegram: {
          accounts: {
            acc1: { heartbeat: { showOk: true } },
          },
        },
      },
    };
    const result = resolveHeartbeatVisibility({ cfg, channel: "telegram", accountId: "acc1" });
    expect(result.showOk).toBe(true);
    expect(result.showAlerts).toBe(false);
    expect(result.useIndicator).toBe(false);
  });
});
