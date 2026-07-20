// 移植自 openclaw/src/infra/approval-native-delivery.ts
// 降级：channel adapter 类型简化

export type ChannelApprovalNativeTarget = {
  to: string;
  threadId?: string;
  [key: string]: unknown;
};

export type ChannelApprovalNativeSurface = "origin" | "approver-dm";

export type ChannelApprovalNativePlannedTarget = {
  surface: ChannelApprovalNativeSurface;
  target: ChannelApprovalNativeTarget;
  reason: "preferred" | "fallback";
};

export type ChannelApprovalNativeDeliveryPlan = {
  targets: ChannelApprovalNativePlannedTarget[];
  originTarget: ChannelApprovalNativeTarget | null;
  notifyOriginWhenDmOnly: boolean;
};

function dedupeTargets(
  targets: ChannelApprovalNativePlannedTarget[],
): ChannelApprovalNativePlannedTarget[] {
  const seen = new Set<string>();
  const deduped: ChannelApprovalNativePlannedTarget[] = [];
  for (const target of targets) {
    const key = `${target.target.to}::${target.target.threadId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(target);
  }
  return deduped;
}

/** Resolves the origin and approver-DM targets a channel should use for native approvals. */
export async function resolveChannelNativeApprovalDeliveryPlan(params: {
  adapter?: {
    describeDeliveryCapabilities(params: unknown): {
      enabled: boolean;
      preferredSurface?: string;
      supportsOriginSurface?: boolean;
      supportsApproverDmSurface?: boolean;
      notifyOriginWhenDmOnly?: boolean;
    } | null;
    resolveOriginTarget?(params: unknown): Promise<ChannelApprovalNativeTarget | null>;
    resolveApproverDmTargets?(params: unknown): Promise<ChannelApprovalNativeTarget[]>;
  } | null;
  [key: string]: unknown;
}): Promise<ChannelApprovalNativeDeliveryPlan> {
  const adapter = params.adapter;
  if (!adapter) {
    return { targets: [], originTarget: null, notifyOriginWhenDmOnly: false };
  }
  const capabilities = adapter.describeDeliveryCapabilities?.(params);
  if (!capabilities?.enabled) {
    return { targets: [], originTarget: null, notifyOriginWhenDmOnly: false };
  }

  const originTarget = capabilities.supportsOriginSurface && adapter.resolveOriginTarget
    ? (await adapter.resolveOriginTarget(params)) ?? null
    : null;
  const approverDmTargets = capabilities.supportsApproverDmSurface && adapter.resolveApproverDmTargets
    ? await adapter.resolveApproverDmTargets(params)
    : [];

  const plannedTargets: ChannelApprovalNativePlannedTarget[] = [];
  const preferOrigin = capabilities.preferredSurface === "origin" || capabilities.preferredSurface === "both";
  const preferApproverDm = capabilities.preferredSurface === "approver-dm" || capabilities.preferredSurface === "both";

  if (preferOrigin && originTarget) {
    plannedTargets.push({ surface: "origin", target: originTarget, reason: "preferred" });
  }
  if (preferApproverDm) {
    for (const target of approverDmTargets) {
      plannedTargets.push({ surface: "approver-dm", target, reason: "preferred" });
    }
  } else if (!originTarget) {
    for (const target of approverDmTargets) {
      plannedTargets.push({ surface: "approver-dm", target, reason: "fallback" });
    }
  }

  return {
    targets: dedupeTargets(plannedTargets),
    originTarget,
    notifyOriginWhenDmOnly:
      capabilities.preferredSurface === "approver-dm" &&
      capabilities.notifyOriginWhenDmOnly === true &&
      originTarget !== null,
  };
}
