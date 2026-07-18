/**
 * 交付目标解析
 *
 * 参考 openclaw/src/cron/isolated-agent/delivery-target.ts 的精简实现。
 * 将 cron 任务的投递配置解析为具体的出站通道目标。
 */

/** 交付目标解析输入 */
export type DeliveryTargetInput = {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  sessionKey?: string;
};

/** 交付目标解析结果 */
export type DeliveryTarget =
  | {
      ok: true;
      channel: string;
      to: string;
      accountId?: string;
      threadId?: string | number;
      mode: "explicit" | "implicit";
    }
  | {
      ok: false;
      channel?: string;
      to?: string;
      accountId?: string;
      threadId?: string | number;
      mode: "explicit" | "implicit";
      error: Error;
    };

/**
 * 解析交付目标。
 *
 * 精简版实现：根据输入的通道、目标、账号和线程信息，
 * 解析出具体的出站通道目标。当缺少必要字段（channel 或 to）时返回失败结果。
 */
export function resolveDeliveryTarget(target: DeliveryTargetInput): DeliveryTarget {
  const channel = target.channel?.trim();
  const to = target.to?.trim();
  const accountId = target.accountId?.trim();
  const threadId =
    target.threadId == null || target.threadId === "" ? undefined : target.threadId;

  // 显式投递需要同时提供 channel 和 to
  if (channel && to) {
    const success: Extract<DeliveryTarget, { ok: true }> = {
      ok: true,
      channel,
      to,
      mode: "explicit",
    };
    if (accountId) {
      success.accountId = accountId;
    }
    if (threadId != null) {
      success.threadId = threadId;
    }
    return success;
  }

  // 缺少必要字段时返回失败
  const missing: string[] = [];
  if (!channel) {
    missing.push("channel");
  }
  if (!to) {
    missing.push("to");
  }

  const failure: Extract<DeliveryTarget, { ok: false }> = {
    ok: false,
    mode: channel || to ? "explicit" : "implicit",
    error: new Error(`交付目标解析失败：缺少 ${missing.join("、")}`),
  };
  if (channel) {
    failure.channel = channel;
  }
  if (to) {
    failure.to = to;
  }
  if (accountId) {
    failure.accountId = accountId;
  }
  if (threadId != null) {
    failure.threadId = threadId;
  }
  return failure;
}
