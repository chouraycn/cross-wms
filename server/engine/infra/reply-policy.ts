// 移植自 openclaw/src/infra/reply-policy.ts
// 降级：channel plugin 依赖简化

export type ReplyToOverride = {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string;
};

export type ReplyToResolution = {
  targets: ReplyToOverride[];
  mode: "fanout" | "single";
};

/** Creates a fanout reply policy that delivers to all configured targets. */
export function createReplyToFanout(targets: ReplyToOverride[]): ReplyToResolution {
  return { targets, mode: "fanout" };
}

/** Creates a delivery policy that selects the best reply target. */
export function createReplyToDeliveryPolicy(params: {
  overrides?: ReplyToOverride[];
  defaultTarget?: ReplyToOverride;
}): ReplyToResolution {
  const targets = params.overrides?.length ? params.overrides : params.defaultTarget ? [params.defaultTarget] : [];
  return { targets, mode: targets.length > 1 ? "fanout" : "single" };
}
