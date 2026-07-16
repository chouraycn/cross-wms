// Feishu setup API for cross-wms installation configuration.
import type { FeishuAccountConfig, FeishuDomain } from "./index.js";

export interface FeishuSetupConfig {
  appId: string;
  appSecret: string;
  domain?: FeishuDomain;
  verificationToken?: string;
  encryptKey?: string;
}

export interface FeishuSetupResult {
  success: boolean;
  channelId: string;
  accountId?: string;
  error?: string;
}

/**
 * Validate a Feishu setup configuration.
 * Returns the validated config or throws on invalid input.
 */
export function validateFeishuSetupConfig(config: Partial<FeishuSetupConfig>): FeishuSetupConfig {
  if (!config.appId?.trim()) {
    throw new Error("appId is required");
  }
  if (!config.appSecret?.trim()) {
    throw new Error("appSecret is required");
  }
  return {
    appId: config.appId.trim(),
    appSecret: config.appSecret.trim(),
    domain: config.domain,
    verificationToken: config.verificationToken?.trim() || undefined,
    encryptKey: config.encryptKey?.trim() || undefined,
  };
}

/**
 * Build an FeishuAccountConfig from setup parameters.
 */
export function buildFeishuAccountConfig(setup: FeishuSetupConfig): FeishuAccountConfig {
  return {
    appId: setup.appId,
    appSecret: setup.appSecret,
    domain: setup.domain,
    verificationToken: setup.verificationToken,
    encryptKey: setup.encryptKey,
  };
}
