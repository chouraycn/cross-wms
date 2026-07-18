import { z } from "zod";
import { logger } from "../../logger.js";
import type { ChannelId, AccountId, AppConfig } from "../../channels/types.js";

export const ChannelConfigSchema = z.object({
  enabled: z.boolean().optional(),
  accounts: z.record(z.string(), z.unknown()).optional(),
  defaultAccount: z.string().optional(),
  rateLimit: z
    .object({
      windowMs: z.number().optional(),
      maxRequests: z.number().optional(),
    })
    .optional(),
  webhook: z
    .object({
      path: z.string().optional(),
      secret: z.string().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

const configCache = new Map<string, ChannelConfig>();

export function getChannelConfig(
  config: AppConfig,
  channelId: ChannelId
): ChannelConfig {
  const raw = config[channelId] as Record<string, unknown> | undefined;
  const parsed = ChannelConfigSchema.safeParse(raw ?? {});

  if (!parsed.success) {
    logger.warn(`[Channels:ChannelConfig] Invalid config for ${channelId}`, {
      errors: parsed.error.issues,
    });
    return {};
  }

  return parsed.data;
}

export function isChannelEnabled(config: AppConfig, channelId: ChannelId): boolean {
  const channelConfig = getChannelConfig(config, channelId);
  return channelConfig.enabled !== false;
}

export function getChannelAccountIds(
  config: AppConfig,
  channelId: ChannelId
): AccountId[] {
  const channelConfig = getChannelConfig(config, channelId);
  if (!channelConfig.accounts) return [];
  return Object.keys(channelConfig.accounts);
}

export function getChannelAccountConfig(
  config: AppConfig,
  channelId: ChannelId,
  accountId: AccountId
): Record<string, unknown> | undefined {
  const channelConfig = getChannelConfig(config, channelId);
  return channelConfig.accounts?.[accountId] as Record<string, unknown> | undefined;
}

export function getDefaultAccountId(
  config: AppConfig,
  channelId: ChannelId
): AccountId | undefined {
  const channelConfig = getChannelConfig(config, channelId);
  if (channelConfig.defaultAccount) {
    return channelConfig.defaultAccount;
  }
  const accounts = getChannelAccountIds(config, channelId);
  return accounts[0];
}

export function validateChannelConfig(
  config: unknown,
  channelId: ChannelId
): { valid: boolean; errors: string[] } {
  const result = ChannelConfigSchema.safeParse(config);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

export function setChannelConfig(
  config: AppConfig,
  channelId: ChannelId,
  channelConfig: ChannelConfig
): AppConfig {
  configCache.delete(channelId);
  return {
    ...config,
    [channelId]: channelConfig,
  };
}

export function mergeChannelConfig(
  base: AppConfig,
  channelId: ChannelId,
  overrides: Partial<ChannelConfig>
): AppConfig {
  const current = getChannelConfig(base, channelId);
  return setChannelConfig(base, channelId, {
    ...current,
    ...overrides,
  });
}

export function clearConfigCache(): void {
  configCache.clear();
}
