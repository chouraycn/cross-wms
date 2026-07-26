// Access group helpers resolve plugin allowlists that reference named config groups.
//
// 移植自 openclaw/src/plugin-sdk/access-groups.ts
// 降级策略：
//  - cross-wms 的 channels/allow-from.ts 未导出 ACCESS_GROUP_ALLOW_FROM_PREFIX
//    与 parseAccessGroupAllowFromEntry，这里本地定义（与 openclaw 原始实现一致）。
//  - cross-wms 的 AccessGroupConfig 为 unknown 占位类型，这里本地定义
//    MessageSendersAccessGroup 结构类型并在运行时按 type 字段判别。
//  - uniqueStrings 改从 ../infra/string-normalization.js 导入。
//  - ChannelId 改从 ../channels/types.public.js 导入（openclaw 原始路径为
//    ../channels/plugins/types.public.js）。
//  - OpenClawConfig 改从 ../config/types.openclaw.js 导入。
import { uniqueStrings } from "../infra/string-normalization.js";
import type { ChannelId } from "../channels/types.public.js";
import type { AccessGroupConfig } from "../config/types.access-groups.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";

/**
 * Prefix that marks an allowFrom entry as an access-group reference instead of a sender id.
 * 本地定义：cross-wms 的 channels/allow-from.ts 未导出此常量。
 */
export const ACCESS_GROUP_ALLOW_FROM_PREFIX = "accessGroup:";

/**
 * Parses an access-group allowFrom entry and returns the referenced group name.
 * 本地定义：cross-wms 的 channels/allow-from.ts 未导出此函数。
 */
export function parseAccessGroupAllowFromEntry(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed.startsWith(ACCESS_GROUP_ALLOW_FROM_PREFIX)) {
    return null;
  }
  const name = trimmed.slice(ACCESS_GROUP_ALLOW_FROM_PREFIX.length).trim();
  return name.length > 0 ? name : null;
}

/**
 * 本地结构类型：message.senders 访问组（openclaw 中由 AccessGroupConfig 联合类型定义）。
 * cross-wms 的 AccessGroupConfig 为 unknown 占位，这里定义最小判别结构。
 */
type MessageSendersAccessGroupLike = {
  type: "message.senders";
  members: Record<string, string[]>;
};

/** Resolves membership for an access group using the full OpenClaw config. */
export type AccessGroupMembershipResolver = (params: {
  /** Full config, available when membership needs cross-channel or provider state. */
  cfg: OpenClawConfig;
  /** Access group name referenced by `accessGroup:<name>`. */
  name: string;
  /** Access group config selected by name. */
  group: AccessGroupConfig;
  /** Channel where the inbound sender is being checked. */
  channel: ChannelId;
  /** Channel account id for account-scoped membership checks. */
  accountId: string;
  /** Inbound sender id or handle being authorized. */
  senderId: string;
}) => boolean | Promise<boolean>;

/** Resolves membership for one access group when the caller already selected the config group. */
export type AccessGroupMembershipLookup = (params: {
  /** Access group name referenced by `accessGroup:<name>`. */
  name: string;
  /** Access group config selected by name. */
  group: AccessGroupConfig;
  /** Channel where the inbound sender is being checked. */
  channel: ChannelId;
  /** Channel account id for account-scoped membership checks. */
  accountId: string;
  /** Inbound sender id or handle being authorized. */
  senderId: string;
}) => boolean | Promise<boolean>;

/** Reports how access-group allowlist entries resolved for a channel sender. */
export type ResolvedAccessGroupAllowFromState = {
  /** Unique access group names referenced by the allowlist. */
  referenced: string[];
  /** Referenced groups that authorized the sender. */
  matched: string[];
  /** Referenced groups absent from config. */
  missing: string[];
  /** Referenced groups whose type cannot be evaluated without a resolver. */
  unsupported: string[];
  /** Referenced groups whose resolver threw. */
  failed: string[];
  /** Matched allowlist entries in `accessGroup:<name>` form. */
  matchedAllowFromEntries: string[];
  /** Whether the input allowlist referenced at least one access group. */
  hasReferences: boolean;
  /** Whether at least one referenced group authorized the sender. */
  hasMatch: boolean;
};

/** Resolve the concrete sender allowlist entries for static message-sender groups. */
function resolveMessageSenderGroupEntries(params: {
  group: AccessGroupConfig;
  channel: ChannelId;
}): string[] {
  // cross-wms 的 AccessGroupConfig 为 unknown 占位，这里按结构判别。
  const group = params.group as Partial<MessageSendersAccessGroupLike> | null;
  if (!group || group.type !== "message.senders") {
    return [];
  }
  const members = group.members ?? {};
  return [...(members["*"] ?? []), ...(members[params.channel] ?? [])];
}

/** Resolves `accessGroup:<name>` allowlist entries without changing the original allowlist. */
export async function resolveAccessGroupAllowFromState(params: {
  /** Configured access groups keyed by name. */
  accessGroups?: Record<string, AccessGroupConfig>;
  /** Raw allowlist entries that may include `accessGroup:<name>` references. */
  allowFrom: Array<string | number> | null | undefined;
  /** Channel where the inbound sender is being checked. */
  channel: ChannelId;
  /** Channel account id for account-scoped membership checks. */
  accountId: string;
  /** Inbound sender id or handle being authorized. */
  senderId: string;
  /** Static sender matcher used for `message.senders` groups. */
  isSenderAllowed?: (senderId: string, allowFrom: string[]) => boolean;
  /** Optional resolver for non-static or integration-backed group types. */
  resolveMembership?: AccessGroupMembershipLookup;
}): Promise<ResolvedAccessGroupAllowFromState> {
  const names = Array.from(
    new Set(
      (params.allowFrom ?? [])
        .map((entry) => parseAccessGroupAllowFromEntry(String(entry)))
        .filter((entry): entry is string => entry != null),
    ),
  );
  const state: ResolvedAccessGroupAllowFromState = {
    referenced: names,
    matched: [],
    missing: [],
    unsupported: [],
    failed: [],
    matchedAllowFromEntries: [],
    hasReferences: names.length > 0,
    hasMatch: false,
  };
  const groups = params.accessGroups;
  for (const name of names) {
    const group = groups?.[name];
    if (!group) {
      state.missing.push(name);
      continue;
    }

    const senderEntries = resolveMessageSenderGroupEntries({
      group,
      channel: params.channel,
    });
    if (
      senderEntries.length > 0 &&
      params.isSenderAllowed?.(params.senderId, senderEntries) === true
    ) {
      state.matched.push(name);
      continue;
    }

    // Static sender groups are fully decided above; resolver hooks cover future
    // group types or integration-backed membership without rechecking static entries.
    if (!params.resolveMembership) {
      const groupLike = group as Partial<MessageSendersAccessGroupLike> | null;
      if (groupLike?.type !== "message.senders") {
        state.unsupported.push(name);
      }
      continue;
    }

    let allowed;
    try {
      allowed = await params.resolveMembership({
        name,
        group,
        channel: params.channel,
        accountId: params.accountId,
        senderId: params.senderId,
      });
    } catch {
      state.failed.push(name);
      continue;
    }
    if (allowed) {
      state.matched.push(name);
    }
  }
  state.matchedAllowFromEntries = state.matched.map(
    (name) => `${ACCESS_GROUP_ALLOW_FROM_PREFIX}${name}`,
  );
  state.hasMatch = state.matchedAllowFromEntries.length > 0;
  return state;
}

/** Returns the matched `accessGroup:<name>` allowlist entries for a sender. */
export async function resolveAccessGroupAllowFromMatches(params: {
  /** Full config containing `accessGroups`. */
  cfg?: OpenClawConfig;
  /** Raw allowlist entries that may include `accessGroup:<name>` references. */
  allowFrom: Array<string | number> | null | undefined;
  /** Channel where the inbound sender is being checked. */
  channel: ChannelId;
  /** Channel account id for account-scoped membership checks. */
  accountId: string;
  /** Inbound sender id or handle being authorized. */
  senderId: string;
  /** Static sender matcher used for `message.senders` groups. */
  isSenderAllowed?: (senderId: string, allowFrom: string[]) => boolean;
  /** Optional resolver for non-static or integration-backed group types. */
  resolveMembership?: AccessGroupMembershipResolver;
}): Promise<string[]> {
  const cfg = params.cfg;
  const resolveMembership = params.resolveMembership;
  const state = await resolveAccessGroupAllowFromState({
    // cross-wms 的 AccessGroupsConfig 为 unknown 占位，按目标类型断言。
    accessGroups: cfg?.accessGroups as Record<string, AccessGroupConfig> | undefined,
    allowFrom: params.allowFrom,
    channel: params.channel,
    accountId: params.accountId,
    senderId: params.senderId,
    isSenderAllowed: params.isSenderAllowed,
    resolveMembership:
      resolveMembership && cfg
        ? async (lookupParams) =>
            await resolveMembership({
              cfg,
              ...lookupParams,
            })
        : undefined,
  });
  return state.matchedAllowFromEntries;
}

/** Expands a matching access-group allowlist with the concrete sender entry. */
export async function expandAllowFromWithAccessGroups(params: {
  /** Full config containing `accessGroups`. */
  cfg?: OpenClawConfig;
  /** Raw allowlist entries that may include `accessGroup:<name>` references. */
  allowFrom: Array<string | number> | null | undefined;
  /** Channel where the inbound sender is being checked. */
  channel: ChannelId;
  /** Channel account id for account-scoped membership checks. */
  accountId: string;
  /** Inbound sender id or handle being authorized. */
  senderId: string;
  /** Concrete allowlist entry appended after a group match; defaults to `senderId`. */
  senderAllowEntry?: string;
  /** Static sender matcher used for `message.senders` groups. */
  isSenderAllowed?: (senderId: string, allowFrom: string[]) => boolean;
  /** Optional resolver for non-static or integration-backed group types. */
  resolveMembership?: AccessGroupMembershipResolver;
}): Promise<string[]> {
  const allowFrom = (params.allowFrom ?? []).map(String);
  const matched = await resolveAccessGroupAllowFromMatches({
    cfg: params.cfg,
    allowFrom,
    channel: params.channel,
    accountId: params.accountId,
    senderId: params.senderId,
    isSenderAllowed: params.isSenderAllowed,
    resolveMembership: params.resolveMembership,
  });
  if (matched.length === 0) {
    return allowFrom;
  }
  const senderEntry = params.senderAllowEntry ?? params.senderId;
  // Downstream legacy sender checks still expect a concrete allowlist entry after a group match.
  return uniqueStrings([...allowFrom, senderEntry]);
}
