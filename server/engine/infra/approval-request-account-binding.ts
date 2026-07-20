// 移植自 openclaw/src/infra/approval-request-account-binding.ts

export type ApprovalRequestSessionEntry = {
  sessionKey: string;
  accountId?: string;
  channelProvider?: string;
  channelAccountId?: string;
  requesterAccountId?: string;
  [key: string]: unknown;
};

/** Resolves the persisted approval request session entry. */
export function resolvePersistedApprovalRequestSessionEntry(params: {
  sessionKey?: string;
  accountId?: string;
  channelProvider?: string;
  channelAccountId?: string;
  requesterAccountId?: string;
}): ApprovalRequestSessionEntry | null {
  if (!params.sessionKey?.trim()) return null;
  return {
    sessionKey: params.sessionKey.trim(),
    accountId: params.accountId?.trim() || undefined,
    channelProvider: params.channelProvider?.trim() || undefined,
    channelAccountId: params.channelAccountId?.trim() || undefined,
    requesterAccountId: params.requesterAccountId?.trim() || undefined,
  };
}

/** Resolves the approval request account id. */
export function resolveApprovalRequestAccountId(params: {
  sessionEntry?: ApprovalRequestSessionEntry | null;
  fallbackAccountId?: string;
}): string | undefined {
  return params.sessionEntry?.accountId?.trim() || params.fallbackAccountId?.trim() || undefined;
}

/** Resolves the approval request channel account id. */
export function resolveApprovalRequestChannelAccountId(params: {
  sessionEntry?: ApprovalRequestSessionEntry | null;
  channelProvider?: string;
}): string | undefined {
  if (!params.sessionEntry) return undefined;
  return params.sessionEntry.channelAccountId?.trim() || params.sessionEntry.accountId?.trim() || undefined;
}

/** Checks if an approval request matches a channel account. */
export function doesApprovalRequestMatchChannelAccount(params: {
  sessionEntry?: ApprovalRequestSessionEntry | null;
  channelProvider?: string;
  accountId?: string;
}): boolean {
  if (!params.sessionEntry || !params.accountId) return false;
  const entryProvider = params.sessionEntry.channelProvider?.trim().toLowerCase();
  const targetProvider = params.channelProvider?.trim().toLowerCase();
  if (entryProvider && targetProvider && entryProvider !== targetProvider) return false;
  const entryAccountId = params.sessionEntry.channelAccountId?.trim() || params.sessionEntry.accountId?.trim();
  return entryAccountId === params.accountId.trim();
}
