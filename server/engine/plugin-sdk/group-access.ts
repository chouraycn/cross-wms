/**
 * @deprecated Public SDK subpath has no bundled extension production imports.
 * Use resolveChannelMessageIngress from channel-ingress-runtime instead.
 *
 * 移植自 openclaw/src/plugin-sdk/group-access.ts
 * 依赖 ../config/runtime-group-policy.js 与 ../config/types.base.js 均已在 cross-wms 中存在。
 */

import { resolveOpenProviderRuntimeGroupPolicy } from "../config/runtime-group-policy.js";
import type { GroupPolicy } from "../config/types.base.js";

export { resolveOpenProviderRuntimeGroupPolicy };
export type { GroupPolicy };

/** Reason code returned when evaluating a sender against group policy. */
export type SenderGroupAccessReason =
  | "allowed"
  | "disabled"
  | "empty_allowlist"
  | "sender_not_allowlisted";
/** Sender-level group access decision plus the effective group policy. */
export type SenderGroupAccessDecision = {
  allowed: boolean;
  groupPolicy: GroupPolicy;
  providerMissingFallbackApplied: boolean;
  reason: SenderGroupAccessReason;
};
/** Reason code returned when evaluating a configured group route. */
export type GroupRouteAccessReason =
  | "allowed"
  | "disabled"
  | "empty_allowlist"
  | "route_not_allowlisted"
  | "route_disabled";
/** Route-level group access decision plus the effective group policy. */
export type GroupRouteAccessDecision = {
  allowed: boolean;
  groupPolicy: GroupPolicy;
  reason: GroupRouteAccessReason;
};
/** Reason code returned when evaluating a precomputed allowlist match. */
export type MatchedGroupAccessReason =
  | "allowed"
  | "disabled"
  | "missing_match_input"
  | "empty_allowlist"
  | "not_allowlisted";
/** Matched-input group access decision plus the effective group policy. */
export type MatchedGroupAccessDecision = {
  allowed: boolean;
  groupPolicy: GroupPolicy;
  reason: MatchedGroupAccessReason;
};

/** @deprecated Use `resolveChannelMessageIngress` from `openclaw/plugin-sdk/channel-ingress-runtime`. */
export function resolveSenderScopedGroupPolicy(params: {
  groupPolicy: GroupPolicy;
  groupAllowFrom: string[];
}): GroupPolicy {
  if (params.groupPolicy === "disabled") {
    return "disabled";
  }
  return params.groupAllowFrom.length > 0 ? "allowlist" : "open";
}

/** @deprecated Use route descriptors with `resolveChannelMessageIngress` from `openclaw/plugin-sdk/channel-ingress-runtime`. */
export function evaluateGroupRouteAccessForPolicy(params: {
  groupPolicy: GroupPolicy;
  routeAllowlistConfigured: boolean;
  routeMatched: boolean;
  routeEnabled?: boolean;
}): GroupRouteAccessDecision {
  if (params.groupPolicy === "disabled") {
    return { allowed: false, groupPolicy: params.groupPolicy, reason: "disabled" };
  }
  if (params.routeMatched && params.routeEnabled === false) {
    return { allowed: false, groupPolicy: params.groupPolicy, reason: "route_disabled" };
  }
  if (params.groupPolicy === "allowlist") {
    if (!params.routeAllowlistConfigured) {
      return { allowed: false, groupPolicy: params.groupPolicy, reason: "empty_allowlist" };
    }
    if (!params.routeMatched) {
      return { allowed: false, groupPolicy: params.groupPolicy, reason: "route_not_allowlisted" };
    }
  }
  return { allowed: true, groupPolicy: params.groupPolicy, reason: "allowed" };
}

/** @deprecated Use `resolveChannelMessageIngress` from `openclaw/plugin-sdk/channel-ingress-runtime`. */
export function evaluateMatchedGroupAccessForPolicy(params: {
  groupPolicy: GroupPolicy;
  allowlistConfigured: boolean;
  allowlistMatched: boolean;
  requireMatchInput?: boolean;
  hasMatchInput?: boolean;
}): MatchedGroupAccessDecision {
  if (params.groupPolicy === "disabled") {
    return { allowed: false, groupPolicy: params.groupPolicy, reason: "disabled" };
  }
  if (params.groupPolicy === "allowlist") {
    if (params.requireMatchInput && !params.hasMatchInput) {
      return { allowed: false, groupPolicy: params.groupPolicy, reason: "missing_match_input" };
    }
    if (!params.allowlistConfigured) {
      return { allowed: false, groupPolicy: params.groupPolicy, reason: "empty_allowlist" };
    }
    if (!params.allowlistMatched) {
      return { allowed: false, groupPolicy: params.groupPolicy, reason: "not_allowlisted" };
    }
  }
  return { allowed: true, groupPolicy: params.groupPolicy, reason: "allowed" };
}

/** @deprecated Use `resolveChannelMessageIngress` from `openclaw/plugin-sdk/channel-ingress-runtime`. */
export function evaluateSenderGroupAccessForPolicy(params: {
  groupPolicy: GroupPolicy;
  providerMissingFallbackApplied?: boolean;
  groupAllowFrom: string[];
  senderId: string;
  isSenderAllowed: (senderId: string, allowFrom: string[]) => boolean;
}): SenderGroupAccessDecision {
  const providerMissingFallbackApplied = Boolean(params.providerMissingFallbackApplied);
  if (params.groupPolicy === "disabled") {
    return {
      allowed: false,
      groupPolicy: params.groupPolicy,
      providerMissingFallbackApplied,
      reason: "disabled",
    };
  }
  if (params.groupPolicy === "allowlist") {
    if (params.groupAllowFrom.length === 0) {
      return {
        allowed: false,
        groupPolicy: params.groupPolicy,
        providerMissingFallbackApplied,
        reason: "empty_allowlist",
      };
    }
    if (!params.isSenderAllowed(params.senderId, params.groupAllowFrom)) {
      return {
        allowed: false,
        groupPolicy: params.groupPolicy,
        providerMissingFallbackApplied,
        reason: "sender_not_allowlisted",
      };
    }
  }
  return {
    allowed: true,
    groupPolicy: params.groupPolicy,
    providerMissingFallbackApplied,
    reason: "allowed",
  };
}

/** @deprecated Use `resolveOpenProviderRuntimeGroupPolicy` plus `resolveChannelMessageIngress` from `openclaw/plugin-sdk/channel-ingress-runtime`. */
export function evaluateSenderGroupAccess(params: {
  providerConfigPresent: boolean;
  configuredGroupPolicy?: GroupPolicy;
  defaultGroupPolicy?: GroupPolicy;
  groupAllowFrom: string[];
  senderId: string;
  isSenderAllowed: (senderId: string, allowFrom: string[]) => boolean;
}): SenderGroupAccessDecision {
  // cross-wms 的 resolveOpenProviderRuntimeGroupPolicy 是降级 stub（返回 unknown），
  // 这里按 openclaw 原始返回类型断言以保持类型安全。
  const { groupPolicy, providerMissingFallbackApplied } = resolveOpenProviderRuntimeGroupPolicy({
    providerConfigPresent: params.providerConfigPresent,
    groupPolicy: params.configuredGroupPolicy,
    defaultGroupPolicy: params.defaultGroupPolicy,
  }) as { groupPolicy: GroupPolicy; providerMissingFallbackApplied: boolean };

  return evaluateSenderGroupAccessForPolicy({
    groupPolicy,
    providerMissingFallbackApplied,
    groupAllowFrom: params.groupAllowFrom,
    senderId: params.senderId,
    isSenderAllowed: params.isSenderAllowed,
  });
}
