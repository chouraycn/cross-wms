import { logger } from "../../../logger.js";
import type { ChannelId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../../channels/types.js";
import type { ChannelPlugin } from "../../../channels/plugin.js";

export interface ChannelSetupContext {
  channelId: ChannelId;
  config: AppConfig;
  metadata?: Record<string, any>;
}

export interface ChannelSetupResult {
  success: boolean;
  accountId?: string;
  error?: string;
  warnings?: string[];
  nextStep?: string;
}

export interface SetupStep {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
  order: number;
  execute: (ctx: ChannelSetupContext) => Promise<ChannelSetupResult>;
}

const setupSteps = new Map<ChannelId, SetupStep[]>();
const setupState = new Map<string, ChannelSetupResult>();

export function registerSetupSteps(channelId: ChannelId, steps: SetupStep[]): void {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  setupSteps.set(channelId, sorted);
  logger.debug(`[Plugins:SetupHelpers] Registered ${sorted.length} setup steps for ${channelId}`);
}

export function getSetupSteps(channelId: ChannelId): SetupStep[] {
  return setupSteps.get(channelId) ?? [];
}

export async function runSetup(
  channelId: ChannelId,
  ctx: ChannelSetupContext
): Promise<ChannelSetupResult> {
  const steps = getSetupSteps(channelId);
  const warnings: string[] = [];

  if (steps.length === 0) {
    return { success: true, warnings: ["No setup steps defined"] };
  }

  for (const step of steps) {
    logger.debug(`[Plugins:SetupHelpers] Running step ${step.id} for ${channelId}`);

    try {
      const result = await step.execute(ctx);

      if (!result.success) {
        if (step.required) {
          return {
            success: false,
            error: result.error ?? `Setup step "${step.label}" failed`,
            warnings,
            nextStep: step.id,
          };
        } else {
          warnings.push(result.error ?? `Step "${step.label}" skipped`);
        }
      }

      if (result.warnings) {
        warnings.push(...result.warnings);
      }

      const stateKey = `${channelId}:${step.id}`;
      setupState.set(stateKey, result);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (step.required) {
        return { success: false, error, warnings, nextStep: step.id };
      } else {
        warnings.push(`Step "${step.label}" error: ${error}`);
      }
    }
  }

  return { success: true, warnings };
}

export function getSetupStepState(channelId: ChannelId, stepId: string): ChannelSetupResult | undefined {
  return setupState.get(`${channelId}:${stepId}`);
}

export function resetSetup(channelId: ChannelId): void {
  for (const key of setupState.keys()) {
    if (key.startsWith(`${channelId}:`)) {
      setupState.delete(key);
    }
  }
  logger.debug(`[Plugins:SetupHelpers] Reset setup state for ${channelId}`);
}

export function isSetupComplete(
  plugin: ChannelPlugin,
  config: AppConfig,
  accountId: string
): boolean {
  const account = plugin.config.resolveAccount(config, accountId);
  if (!account) return false;
  return plugin.config.isConfigured(account, config);
}

export function createSetupMeta(params: {
  id: ChannelId;
  label: string;
  blurb?: string;
  docsPath?: string;
}): ChannelMeta {
  return {
    id: params.id,
    label: params.label,
    selectionLabel: params.label,
    blurb: params.blurb,
    docsPath: params.docsPath,
    aliases: [],
    markdownCapable: false,
  };
}

export function defaultCapabilities(): ChannelCapabilities {
  return {
    chatTypes: ["direct", "group"],
    media: false,
    reactions: false,
    threads: false,
    polls: false,
    mentions: false,
    voice: false,
    video: false,
    typing: false,
  };
}

// openclaw compat: account section helpers used by plugin-sdk/core.ts
import type { OpenClawConfig } from "../../config/types.openclaw.js";

/** Applies an account display name to a channel config section. */
export function applyAccountNameToChannelSection(params: {
  cfg: OpenClawConfig;
  channelKey: string;
  accountId: string;
  name?: string;
  alwaysUseAccounts?: boolean;
}): OpenClawConfig {
  const trimmed = params.name?.trim();
  if (!trimmed) {
    return params.cfg;
  }
  const channels = (params.cfg as { channels?: Record<string, any> }).channels;
  if (!channels) {
    return params.cfg;
  }
  const section = channels[params.channelKey] as { accounts?: Record<string, any> } | undefined;
  if (!section?.accounts) {
    return params.cfg;
  }
  const nextAccounts = { ...section.accounts };
  const account = nextAccounts[params.accountId] as { name?: string } | undefined;
  if (account) {
    nextAccounts[params.accountId] = { ...account, name: trimmed };
  } else {
    nextAccounts[params.accountId] = { name: trimmed };
  }
  return {
    ...params.cfg,
    channels: {
      ...channels,
      [params.channelKey]: { ...section, accounts: nextAccounts },
    },
  } as OpenClawConfig;
}

/** Moves a root-level channel name into `accounts.default` before adding named accounts. */
export function migrateBaseNameToDefaultAccount(params: {
  cfg: OpenClawConfig;
  channelKey: string;
  alwaysUseAccounts?: boolean;
}): OpenClawConfig {
  if (params.alwaysUseAccounts) {
    return params.cfg;
  }
  const channels = (params.cfg as { channels?: Record<string, any> }).channels;
  const base = channels?.[params.channelKey] as { name?: string; accounts?: Record<string, any> } | undefined;
  const baseName = base?.name?.trim();
  if (!baseName || base?.accounts) {
    return params.cfg;
  }
  return {
    ...params.cfg,
    channels: {
      ...channels,
      [params.channelKey]: {
        ...base,
        name: undefined,
        accounts: { default: { name: baseName } },
      },
    },
  } as OpenClawConfig;
}
