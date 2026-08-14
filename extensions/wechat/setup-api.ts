// WeChat setup API for cross-wms installation configuration.
import type { WeChatAccountConfig } from "./index.js";

export interface WeChatSetupConfig {
  appId: string;
  appSecret: string;
  token?: string;
  encodingAesKey?: string;
}

export interface WeChatSetupResult {
  success: boolean;
  channelId: string;
  accountId?: string;
  error?: string;
}

/**
 * Validate a WeChat setup configuration.
 * Returns the validated config or throws on invalid input.
 */
export function validateWeChatSetupConfig(config: Partial<WeChatSetupConfig>): WeChatSetupConfig {
  if (!config.appId?.trim()) {
    throw new Error("appId（公众号 AppID）是必填项");
  }
  if (!config.appSecret?.trim()) {
    throw new Error("appSecret（公众号 AppSecret）是必填项");
  }
  const out: WeChatSetupConfig = {
    appId: config.appId.trim(),
    appSecret: config.appSecret.trim(),
    token: config.token?.trim() || undefined,
    encodingAesKey: config.encodingAesKey?.trim() || undefined,
  };
  if (out.encodingAesKey && out.encodingAesKey.length !== 43) {
    throw new Error("encodingAesKey 长度必须为 43 位（公众号后台-服务器配置生成）");
  }
  return out;
}

/**
 * Build a WeChatAccountConfig from setup parameters.
 */
export function buildWeChatAccountConfig(setup: WeChatSetupConfig): WeChatAccountConfig {
  return {
    appId: setup.appId,
    appSecret: setup.appSecret,
    token: setup.token,
    encodingAesKey: setup.encodingAesKey,
  };
}
