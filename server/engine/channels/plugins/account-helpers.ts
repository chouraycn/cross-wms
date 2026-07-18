import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, AppConfig } from "../../../channels/types.js";

export interface ChannelAccount {
  id: AccountId;
  channelId: ChannelId;
  name: string;
  type: string;
  enabled: boolean;
  configured: boolean;
  metadata: Record<string, unknown>;
}

export interface AccountResolutionResult {
  found: boolean;
  account?: ChannelAccount;
  reason?: string;
}

const accountCache = new Map<string, ChannelAccount>();

export function listAccounts(
  channelId: ChannelId,
  config: AppConfig,
  resolver?: (config: AppConfig, accountId: AccountId) => unknown
): ChannelAccount[] {
  const channelConfig = config[channelId] as Record<string, unknown> | undefined;
  const accounts = channelConfig?.accounts as Record<string, unknown> | undefined;

  if (!accounts) return [];

  const result: ChannelAccount[] = [];

  for (const [accountId, rawAccount] of Object.entries(accounts)) {
    const raw = rawAccount as Record<string, unknown>;
    const account: ChannelAccount = {
      id: accountId,
      channelId,
      name: String(raw.name ?? accountId),
      type: String(raw.type ?? "default"),
      enabled: raw.enabled !== false,
      configured: isConfigured(raw),
      metadata: { ...raw },
    };
    result.push(account);
  }

  return result;
}

export function resolveAccount(
  channelId: ChannelId,
  accountId: AccountId,
  config: AppConfig
): AccountResolutionResult {
  const cacheKey = `${channelId}:${accountId}`;
  const cached = accountCache.get(cacheKey);

  if (cached) {
    return { found: true, account: cached };
  }

  const channelConfig = config[channelId] as Record<string, unknown> | undefined;
  const accounts = channelConfig?.accounts as Record<string, unknown> | undefined;
  const raw = accounts?.[accountId] as Record<string, unknown> | undefined;

  if (!raw) {
    return { found: false, reason: `Account ${accountId} not found in channel ${channelId}` };
  }

  const account: ChannelAccount = {
    id: accountId,
    channelId,
    name: String(raw.name ?? accountId),
    type: String(raw.type ?? "default"),
    enabled: raw.enabled !== false,
    configured: isConfigured(raw),
    metadata: { ...raw },
  };

  accountCache.set(cacheKey, account);
  return { found: true, account };
}

export function getDefaultAccount(
  channelId: ChannelId,
  config: AppConfig
): ChannelAccount | null {
  const accounts = listAccounts(channelId, config);
  const enabled = accounts.filter((a) => a.enabled && a.configured);

  if (enabled.length === 0) return null;

  const defaultAccount = enabled.find((a) => a.metadata.default === true);
  return defaultAccount ?? enabled[0];
}

export function isAccountEnabled(
  channelId: ChannelId,
  accountId: AccountId,
  config: AppConfig
): boolean {
  const result = resolveAccount(channelId, accountId, config);
  return result.found && result.account!.enabled;
}

export function isAccountConfigured(
  channelId: ChannelId,
  accountId: AccountId,
  config: AppConfig
): boolean {
  const result = resolveAccount(channelId, accountId, config);
  return result.found && result.account!.configured;
}

function isConfigured(raw: Record<string, unknown>): boolean {
  if (raw.configured !== undefined) {
    return Boolean(raw.configured);
  }

  const requiredKeys = ["token", "secret", "key", "password", "webhook"];
  for (const key of requiredKeys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
      return true;
    }
  }

  return false;
}

export function getAccountName(
  channelId: ChannelId,
  accountId: AccountId,
  config: AppConfig
): string {
  const result = resolveAccount(channelId, accountId, config);
  return result.found ? result.account!.name : accountId;
}

export function clearAccountCache(): void {
  accountCache.clear();
  logger.debug(`[Plugins:AccountHelpers] Account cache cleared`);
}
