/**
 * Channel account summary helpers. — 移植自 openclaw/src/channels/account-summary.ts
 *
 * 降级策略：
 *  - @openclaw/normalization-core/string-normalization (normalizeStringEntries) →
 *    cross-wms ../infra/string-normalization.js
 *  - ../config/types.openclaw.js (OpenClawConfig) → cross-wms ../config/types/openclaw.js
 *  - ../utils.js (isRecord) → ./_openclaw-stubs.js
 *  - ./account-snapshot-fields.js → 本目录已移植
 *  - ./plugins/types.{core,plugin}.js (ChannelAccountSnapshot, ChannelPlugin) →
 *    ./_openclaw-stubs.js
 */
import { normalizeStringEntries } from "../infra/string-normalization.js";
import type { OpenClawConfig } from "../config/types/openclaw.js";
import { isRecord, type ChannelAccountSnapshot, type ChannelPlugin } from "./_openclaw-stubs.js";
import { projectSafeChannelAccountSnapshotFields } from "./account-snapshot-fields.js";

/**
 * Builds the safe account snapshot shown by CLI, gateway, and status summaries.
 */
export function buildChannelAccountSnapshot(params: {
  plugin: ChannelPlugin;
  account: unknown;
  cfg: OpenClawConfig;
  accountId: string;
  enabled: boolean;
  configured: boolean;
}): ChannelAccountSnapshot {
  const described = params.plugin.config.describeAccount?.(params.account, params.cfg);
  return {
    enabled: params.enabled,
    configured: params.configured,
    ...projectSafeChannelAccountSnapshotFields(params.account),
    ...described,
    accountId: params.accountId,
  };
}

/**
 * Formats allowFrom entries with a plugin formatter when one exists.
 */
export function formatChannelAllowFrom(params: {
  plugin: ChannelPlugin;
  cfg: OpenClawConfig;
  accountId?: string | null;
  allowFrom: Array<string | number>;
}): string[] {
  if (params.plugin.config.formatAllowFrom) {
    return params.plugin.config.formatAllowFrom({
      cfg: params.cfg,
      accountId: params.accountId,
      allowFrom: params.allowFrom,
    });
  }
  return normalizeStringEntries(params.allowFrom);
}

/**
 * Resolves whether a channel account should be treated as enabled.
 */
export function resolveChannelAccountEnabled(params: {
  plugin: ChannelPlugin;
  account: unknown;
  cfg: OpenClawConfig;
}): boolean {
  if (params.plugin.config.isEnabled) {
    return params.plugin.config.isEnabled(params.account, params.cfg);
  }
  const enabled = isRecord(params.account) ? params.account.enabled : undefined;
  return enabled !== false;
}

/**
 * Resolves whether a channel account has enough configuration to run.
 */
export async function resolveChannelAccountConfigured(params: {
  plugin: ChannelPlugin;
  account: unknown;
  cfg: OpenClawConfig;
  readAccountConfiguredField?: boolean;
}): Promise<boolean> {
  if (params.plugin.config.isConfigured) {
    return await params.plugin.config.isConfigured(params.account, params.cfg);
  }
  if (params.readAccountConfiguredField) {
    // Status inspection can project an explicit configured=false marker. Normal runtime
    // account objects default to configured unless the plugin owns a stricter check.
    const configured = isRecord(params.account) ? params.account.configured : undefined;
    return configured !== false;
  }
  return true;
}
