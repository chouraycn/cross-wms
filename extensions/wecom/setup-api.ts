// WeCom setup API for cross-wms installation configuration.
import type { WeComAccountConfig } from "./index.js";

export interface WeComSetupConfig {
  corpId: string;
  corpSecret: string;
  agentId?: string;
  token?: string;
  encodingAesKey?: string;
  webhookUrl?: string;
}

export interface WeComSetupResult {
  success: boolean;
  channelId: string;
  accountId?: string;
  error?: string;
}

/**
 * Validate a WeCom setup configuration.
 * Returns the validated config or throws on invalid input.
 */
export function validateWeComSetupConfig(config: Partial<WeComSetupConfig>): WeComSetupConfig {
  if (!config.corpId?.trim()) {
    throw new Error("corpId（企业 ID）是必填项");
  }
  if (!config.corpSecret?.trim()) {
    throw new Error("corpSecret（应用 Secret）是必填项");
  }
  const out: WeComSetupConfig = {
    corpId: config.corpId.trim(),
    corpSecret: config.corpSecret.trim(),
    agentId: config.agentId?.trim() || undefined,
    token: config.token?.trim() || undefined,
    encodingAesKey: config.encodingAesKey?.trim() || undefined,
    webhookUrl: config.webhookUrl?.trim() || undefined,
  };
  if (out.encodingAesKey && out.encodingAesKey.length !== 43) {
    throw new Error("encodingAesKey 长度必须为 43 位（企业微信后台-接收消息服务器配置生成）");
  }
  return out;
}

/**
 * Build a WeComAccountConfig from setup parameters.
 */
export function buildWeComAccountConfig(setup: WeComSetupConfig): WeComAccountConfig {
  return {
    corpId: setup.corpId,
    corpSecret: setup.corpSecret,
    agentId: setup.agentId,
    token: setup.token,
    encodingAesKey: setup.encodingAesKey,
    webhookUrl: setup.webhookUrl,
  };
}
