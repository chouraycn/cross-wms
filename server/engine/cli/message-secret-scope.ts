// Scope resolver for message command secrets: infer channel/account from flags and targets.
// 移植自 openclaw/src/cli/message-secret-scope.ts。
//
// 降级策略：
//  - 原模块依赖 `@openclaw/normalization-core/string-coerce` 的
//    `normalizeOptionalString`、`../routing/session-key.js` 的 `normalizeAccountId`、
//    `../utils/message-channel.js` 的 `isDeliverableMessageChannel`/`normalizeMessageChannel`。
//    cross-wms 已移植 `../infra/string-coerce.js`（`normalizeOptionalString`）。
//    `routing/session-key.js` 与 `utils/message-channel.js` 未移植；
//    这里内联降级实现，保留函数签名以便未来替换为正式实现。

import { normalizeOptionalString } from "../infra/string-coerce.js";

// ===== 内联降级：normalizeMessageChannel / isDeliverableMessageChannel =====
function normalizeMessageChannel(value: unknown): string | undefined {
  return normalizeOptionalString(value);
}

function isDeliverableMessageChannel(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
// ===== normalizeMessageChannel 结束 =====

// ===== 内联降级：normalizeAccountId =====
function normalizeAccountId(value: unknown): string | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}
// ===== normalizeAccountId 结束 =====

function resolveScopedChannelCandidate(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = normalizeMessageChannel(value);
  if (!normalized || !isDeliverableMessageChannel(normalized)) {
    return undefined;
  }
  return normalized;
}

function resolveChannelFromTargetValue(target: unknown): string | undefined {
  const trimmed = normalizeOptionalString(target);
  if (!trimmed) {
    return undefined;
  }
  const separator = trimmed.indexOf(":");
  if (separator <= 0) {
    return undefined;
  }
  return resolveScopedChannelCandidate(trimmed.slice(0, separator));
}

function resolveChannelFromTargets(targets: unknown): string | undefined {
  if (!Array.isArray(targets)) {
    return undefined;
  }
  const seen = new Set<string>();
  for (const target of targets) {
    const channel = resolveChannelFromTargetValue(target);
    if (channel) {
      seen.add(channel);
    }
  }
  if (seen.size !== 1) {
    return undefined;
  }
  return [...seen][0];
}

function resolveScopedAccountId(value: unknown): string | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }
  return normalizeAccountId(trimmed);
}

/** Resolve the narrowest channel/account secret scope visible from message CLI inputs. */
export function resolveMessageSecretScope(params: {
  channel?: unknown;
  target?: unknown;
  targets?: unknown;
  fallbackChannel?: string | null;
  accountId?: unknown;
  fallbackAccountId?: string | null;
}): {
  channel?: string;
  accountId?: string;
} {
  const channel =
    resolveScopedChannelCandidate(params.channel) ??
    resolveChannelFromTargetValue(params.target) ??
    resolveChannelFromTargets(params.targets) ??
    resolveScopedChannelCandidate(params.fallbackChannel);

  const accountId =
    resolveScopedAccountId(params.accountId) ??
    resolveScopedAccountId(params.fallbackAccountId ?? undefined);

  return {
    ...(channel ? { channel } : {}),
    ...(accountId ? { accountId } : {}),
  };
}
