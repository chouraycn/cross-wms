/**
 * 频道入站白名单诊断。
 *
 * 合并白名单、应用可变标识符策略、脱敏访问图事实。
 *
 * 移植自 openclaw/src/channels/message-access/allowlist.ts。
 * 依赖降级：uniqueStrings 改为引用本地 infra/string-normalization。
 */
import { uniqueStrings } from "../../infra/string-normalization.js";
import type {
  ChannelIngressPolicyInput,
  ChannelIngressState,
  IngressReasonCode,
  RedactedIngressAllowlistFacts,
  RedactedIngressEntryDiagnostic,
  ResolvedIngressAllowlist,
} from "./types.js";

/**
 * 返回白名单首个访问组相关失败原因。
 */
export function allowlistFailureReason(
  allowlist: ResolvedIngressAllowlist,
): IngressReasonCode | null {
  if (allowlist.accessGroups.failed.length > 0) {
    return "access_group_failed";
  }
  if (allowlist.accessGroups.unsupported.length > 0) {
    return "access_group_unsupported";
  }
  if (allowlist.accessGroups.missing.length > 0) {
    return "access_group_missing";
  }
  return null;
}

/**
 * 将白名单投射为可安全暴露在入站访问图中的脱敏诊断。
 */
export function redactedAllowlistDiagnostics(
  allowlist: ResolvedIngressAllowlist,
  reasonCode: IngressReasonCode,
): RedactedIngressAllowlistFacts {
  return {
    configured: allowlist.hasConfiguredEntries,
    matched: allowlist.match.matched,
    reasonCode,
    matchedEntryIds: allowlist.matchedEntryIds,
    invalidEntryCount: allowlist.invalidEntries.length,
    disabledEntryCount: allowlist.disabledEntries.length,
    accessGroups: allowlist.accessGroups,
  };
}

function mergeResolvedAllowlists(
  allowlists: readonly ResolvedIngressAllowlist[],
): ResolvedIngressAllowlist {
  const matches = allowlists.map((allowlist) => allowlist.match);
  const matchedEntryIds = uniqueStrings(
    allowlists.flatMap((allowlist) => allowlist.matchedEntryIds),
  );
  return {
    rawEntryCount: allowlists.reduce((sum, allowlist) => sum + allowlist.rawEntryCount, 0),
    normalizedEntries: allowlists.flatMap((allowlist) => allowlist.normalizedEntries),
    invalidEntries: allowlists.flatMap((allowlist) => allowlist.invalidEntries),
    disabledEntries: allowlists.flatMap((allowlist) => allowlist.disabledEntries),
    matchedEntryIds,
    hasConfiguredEntries: allowlists.some((allowlist) => allowlist.hasConfiguredEntries),
    hasMatchableEntries: allowlists.some((allowlist) => allowlist.hasMatchableEntries),
    hasWildcard: allowlists.some((allowlist) => allowlist.hasWildcard),
    accessGroups: {
      referenced: uniqueStrings(
        allowlists.flatMap((allowlist) => allowlist.accessGroups.referenced),
      ),
      matched: uniqueStrings(allowlists.flatMap((allowlist) => allowlist.accessGroups.matched)),
      missing: uniqueStrings(allowlists.flatMap((allowlist) => allowlist.accessGroups.missing)),
      unsupported: uniqueStrings(
        allowlists.flatMap((allowlist) => allowlist.accessGroups.unsupported),
      ),
      failed: uniqueStrings(allowlists.flatMap((allowlist) => allowlist.accessGroups.failed)),
    },
    match: {
      matched: matches.some((match) => match.matched) || matchedEntryIds.length > 0,
      matchedEntryIds,
    },
  };
}

/**
 * 将可变标识符匹配策略应用到已解析的白名单。
 */
export function applyMutableIdentifierPolicy(
  allowlist: ResolvedIngressAllowlist,
  policy: ChannelIngressPolicyInput,
): ResolvedIngressAllowlist {
  if (policy.mutableIdentifierMatching === "enabled") {
    return allowlist;
  }
  const dangerousEntryIds = new Set(
    allowlist.normalizedEntries
      .filter((entry) => entry.dangerous)
      .map((entry) => entry.opaqueEntryId),
  );
  if (dangerousEntryIds.size === 0) {
    return allowlist;
  }
  // 类用户名的可变标识符可保留用于诊断，但当策略禁用它们时不得授权发送者。
  const matchedEntryIds = allowlist.matchedEntryIds.filter((id) => !dangerousEntryIds.has(id));
  const disabledEntries: RedactedIngressEntryDiagnostic[] = [
    ...allowlist.disabledEntries,
    ...allowlist.normalizedEntries
      .filter((entry) => entry.dangerous)
      .map((entry) => ({
        opaqueEntryId: entry.opaqueEntryId,
        reasonCode: "mutable_identifier_disabled" as const,
      })),
  ];
  return {
    ...allowlist,
    disabledEntries,
    matchedEntryIds,
    hasMatchableEntries: allowlist.normalizedEntries.some((entry) => !entry.dangerous),
    match: {
      matched: matchedEntryIds.length > 0,
      matchedEntryIds,
    },
  };
}

/**
 * 在路由覆盖之后解析用于群组/频道入站的发送者白名单。
 */
export function effectiveGroupSenderAllowlist(params: {
  state: ChannelIngressState;
  policy: ChannelIngressPolicyInput;
}): ResolvedIngressAllowlist {
  let effective =
    params.policy.groupAllowFromFallbackToAllowFrom &&
    !params.state.allowlists.group.hasConfiguredEntries
      ? params.state.allowlists.dm
      : params.state.allowlists.group;
  for (const route of params.state.routeFacts) {
    if (route.gate !== "matched" || !route.senderAllowlist) {
      continue;
    }
    if (route.senderPolicy === "inherit") {
      effective = mergeResolvedAllowlists([effective, route.senderAllowlist]);
      continue;
    }
    // inherit 之外的路由发送者策略替换频道级发送者白名单。
    effective = route.senderAllowlist;
  }
  return applyMutableIdentifierPolicy(effective, params.policy);
}
