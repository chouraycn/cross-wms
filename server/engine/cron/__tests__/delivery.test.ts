import { describe, it, expect, vi } from "vitest";
import {
  resolveFailureDestination,
  sendCronAnnouncePayloadStrict,
  sendFailureNotificationAnnounce,
} from "../delivery.js";
import type { CronDeliveryAdapter, CronAnnounceTarget } from "../delivery.js";

vi.mock("../../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMockAdapter(
  overrides: Partial<CronDeliveryAdapter> = {},
): CronDeliveryAdapter {
  return {
    resolveTarget: vi.fn(async (target: CronAnnounceTarget) => ({
      channel: target.channel,
      to: target.to,
      accountId: target.accountId,
    })),
    send: vi.fn(async () => ({ status: "ok" as const })),
    ...overrides,
  };
}

describe("resolveFailureDestination", () => {
  it("优先使用 failureDestination 显式配置", () => {
    const result = resolveFailureDestination(
      {
        failureDestination: {
          channel: "slack",
          to: "#alerts",
          accountId: "acc-1",
        },
      },
      { channel: "telegram", to: "12345" },
    );
    expect(result).toEqual({
      channel: "slack",
      to: "#alerts",
      accountId: "acc-1",
    });
  });

  it("failureDestination 字段为空白时不使用", () => {
    const result = resolveFailureDestination(
      {
        failureDestination: {
          channel: "  ",
          to: "",
        },
      },
      { channel: "fallback-channel" },
    );
    expect(result?.channel).toBe("fallback-channel");
  });

  it("无 failureDestination 时回退到 delivery 本身", () => {
    const result = resolveFailureDestination(
      {
        channel: "email",
        to: "ops@example.com",
      },
      { channel: "telegram" },
    );
    expect(result).toEqual({
      channel: "email",
      to: "ops@example.com",
    });
  });

  it("无 delivery 字段时回退到 announceTarget", () => {
    const result = resolveFailureDestination(
      {},
      { channel: "telegram", to: "12345" },
    );
    expect(result).toEqual({
      channel: "telegram",
      to: "12345",
    });
  });

  it("所有目标都为空时返回 null", () => {
    const result = resolveFailureDestination({}, {});
    expect(result).toBeNull();
  });

  it("jobDelivery 为非对象时回退到 announceTarget", () => {
    const result = resolveFailureDestination(null, { channel: "slack" });
    expect(result).toEqual({ channel: "slack" });
  });

  it("failureDestination 字段被 trim", () => {
    const result = resolveFailureDestination(
      {
        failureDestination: {
          channel: "  slack  ",
          to: "  #alerts  ",
        },
      },
      {},
    );
    expect(result?.channel).toBe("slack");
    expect(result?.to).toBe("#alerts");
  });

  it("delivery 字段被 trim", () => {
    const result = resolveFailureDestination(
      {
        channel: "  email  ",
      },
      {},
    );
    expect(result?.channel).toBe("email");
  });
});

describe("sendCronAnnouncePayloadStrict", () => {
  it("成功投递时不抛错", async () => {
    const adapter = createMockAdapter();
    await expect(
      sendCronAnnouncePayloadStrict({
        adapter,
        target: { channel: "slack", to: "#general" },
        message: "hello",
        abortSignal: new AbortController().signal,
      }),
    ).resolves.not.toThrow();
    expect(adapter.resolveTarget).toHaveBeenCalledOnce();
    expect(adapter.send).toHaveBeenCalledOnce();
  });

  it("目标解析失败时抛出错误", async () => {
    const adapter = createMockAdapter({
      resolveTarget: vi.fn(async () => {
        throw new Error("target resolution failed");
      }),
    });
    await expect(
      sendCronAnnouncePayloadStrict({
        adapter,
        target: { channel: "slack" },
        message: "hello",
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow("target resolution failed");
  });

  it("投递失败时抛出投递错误", async () => {
    const adapter = createMockAdapter({
      send: vi.fn(async () => ({
        status: "failed" as const,
        error: new Error("delivery failed"),
      })),
    });
    await expect(
      sendCronAnnouncePayloadStrict({
        adapter,
        target: { channel: "slack" },
        message: "hello",
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow("delivery failed");
  });

  it("部分失败时抛出投递错误", async () => {
    const adapter = createMockAdapter({
      send: vi.fn(async () => ({
        status: "partial_failed" as const,
        error: new Error("partial failure"),
      })),
    });
    await expect(
      sendCronAnnouncePayloadStrict({
        adapter,
        target: { channel: "slack" },
        message: "hello",
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow("partial failure");
  });

  it("bestEffort 参数为 false（durable 投递）", async () => {
    const adapter = createMockAdapter();
    await sendCronAnnouncePayloadStrict({
      adapter,
      target: { channel: "slack" },
      message: "hello",
      abortSignal: new AbortController().signal,
    });
    const sendCall = (adapter.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sendCall.bestEffort).toBe(false);
  });
});

describe("sendFailureNotificationAnnounce", () => {
  it("成功投递不抛错", async () => {
    const adapter = createMockAdapter();
    await expect(
      sendFailureNotificationAnnounce({
        adapter,
        target: { channel: "slack", to: "#alerts" },
        message: "cron failed",
      }),
    ).resolves.not.toThrow();
    expect(adapter.send).toHaveBeenCalledOnce();
  });

  it("目标解析失败时不抛错（best-effort）", async () => {
    const adapter = createMockAdapter({
      resolveTarget: vi.fn(async () => {
        throw new Error("resolution failed");
      }),
    });
    await expect(
      sendFailureNotificationAnnounce({
        adapter,
        target: { channel: "slack" },
        message: "cron failed",
      }),
    ).resolves.not.toThrow();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("投递失败时不抛错（best-effort）", async () => {
    const adapter = createMockAdapter({
      send: vi.fn(async () => ({
        status: "failed" as const,
        error: new Error("send failed"),
      })),
    });
    await expect(
      sendFailureNotificationAnnounce({
        adapter,
        target: { channel: "slack" },
        message: "cron failed",
      }),
    ).resolves.not.toThrow();
  });

  it("投递抛异常时不抛错（best-effort）", async () => {
    const adapter = createMockAdapter({
      send: vi.fn(async () => {
        throw new Error("network error");
      }),
    });
    await expect(
      sendFailureNotificationAnnounce({
        adapter,
        target: { channel: "slack" },
        message: "cron failed",
      }),
    ).resolves.not.toThrow();
  });

  it("bestEffort 参数为 true", async () => {
    const adapter = createMockAdapter();
    await sendFailureNotificationAnnounce({
      adapter,
      target: { channel: "slack" },
      message: "cron failed",
    });
    const sendCall = (adapter.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sendCall.bestEffort).toBe(true);
  });

  it("部分失败时不抛错（best-effort）", async () => {
    const adapter = createMockAdapter({
      send: vi.fn(async () => ({
        status: "partial_failed" as const,
        error: new Error("partial failure"),
      })),
    });
    await expect(
      sendFailureNotificationAnnounce({
        adapter,
        target: { channel: "slack" },
        message: "cron failed",
      }),
    ).resolves.not.toThrow();
  });
});
