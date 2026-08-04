import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { ChannelTarget } from "../targets.js";
import type { ChannelResolveResult } from "./types.adapters.js";

export type TargetType = "user" | "channel" | "group" | "thread" | "dm";

export interface ResolvedTarget {
  type: TargetType;
  id: string;
  name?: string;
  channelId: ChannelId;
  accountId?: AccountId;
  metadata?: Record<string, unknown>;
}

export interface TargetResolutionOptions {
  createIfMissing?: boolean;
  validateExistence?: boolean;
}

type Resolver = (
  target: ChannelTarget,
  channelId: ChannelId,
  accountId?: AccountId
) => Promise<ResolvedTarget | null>;

const targetResolvers = new Map<ChannelId, Resolver>();

export function registerTargetResolver(channelId: ChannelId, resolver: Resolver): void {
  targetResolvers.set(channelId, resolver);
  logger.debug(`[Plugins:TargetResolvers] Registered resolver for ${channelId}`);
}

export function unregisterTargetResolver(channelId: ChannelId): void {
  targetResolvers.delete(channelId);
}

export async function resolveTarget(
  target: ChannelTarget,
  channelId: ChannelId,
  accountId?: AccountId
): Promise<ResolvedTarget | null> {
  const resolver = targetResolvers.get(channelId);

  if (resolver) {
    return resolver(target, channelId, accountId);
  }

  return defaultResolve(target, channelId, accountId);
}

function defaultResolve(
  target: ChannelTarget,
  channelId: ChannelId,
  accountId?: AccountId
): ResolvedTarget {
  let resolvedType: TargetType;
  if (target.type === "direct") {
    resolvedType = "dm";
  } else {
    resolvedType = target.type;
  }
  return {
    type: resolvedType,
    id: target.id,
    channelId,
    accountId,
  };
}

export function createTarget(
  type: TargetType,
  id: string,
  channelId: ChannelId,
  accountId?: AccountId
): ChannelTarget {
  let targetType: ChannelTarget["type"];
  if (type === "dm" || type === "user") {
    targetType = "direct";
  } else {
    targetType = type;
  }
  return {
    type: targetType,
    id,
  };
}

export function parseTargetString(
  targetStr: string,
  channelId: ChannelId
): ChannelTarget | null {
  const parts = targetStr.split("/");
  if (parts.length < 2) return null;

  const type = parts[0];
  const id = parts[1];

  if (type === "dm" || type === "direct") {
    return { type: "direct", id };
  }

  if (type === "channel" || type === "group" || type === "thread") {
    return { type: type as ChannelTarget["type"], id, subId: parts[2] };
  }

  return { type: "direct", id };
}

export function formatTargetString(target: ChannelTarget): string {
  if (target.type === "direct") {
    return `dm/${target.id}`;
  }
  if (target.subId) {
    return `${target.type}/${target.id}/${target.subId}`;
  }
  return `${target.type}/${target.id}`;
}

export function isDirectTarget(target: ChannelTarget): boolean {
  return target.type === "direct";
}

export function isGroupTarget(target: ChannelTarget): boolean {
  return target.type === "group" || target.type === "channel";
}

export function isThreadTarget(target: ChannelTarget): boolean {
  return target.type === "thread";
}

export function hasTargetResolver(channelId: ChannelId): boolean {
  return targetResolvers.has(channelId);
}

// ============================================================================
// Setup/allowlist target helpers (merged from openclaw/src/channels/plugins/target-resolvers.ts)
// ============================================================================

/**
 * Builds unresolved target results with one common note.
 * 每个输入对应一行 unresolved 结果，便于 setup UI 展示哪些条目未能解析。
 */
export function buildUnresolvedTargetResults(
  inputs: string[],
  note: string,
): ChannelResolveResult[] {
  return inputs.map((input) => ({
    input,
    resolved: false as const,
    note,
  }));
}

/**
 * Resolves targets only when a required token is available.
 * 缺少 token 时，每个输入都对应一行 unresolved 结果；有 token 时委托给 channel-owned resolver。
 */
export async function resolveTargetsWithOptionalToken<TResult>(params: {
  token?: string | null;
  inputs: string[];
  missingTokenNote: string;
  resolveWithToken: (params: { token: string; inputs: string[] }) => Promise<TResult[]>;
  mapResolved: (entry: TResult) => ChannelResolveResult;
}): Promise<ChannelResolveResult[]> {
  const token = params.token?.trim();
  if (!token) {
    return buildUnresolvedTargetResults(params.inputs, params.missingTokenNote);
  }
  const resolved = await params.resolveWithToken({
    token,
    inputs: params.inputs,
  });
  return resolved.map(params.mapResolved);
}
