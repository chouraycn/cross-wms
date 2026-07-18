import { logger } from "../../logger.js";
import type { ChannelId } from "../../channels/types.js";

export interface ModelOverrides {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
  provider?: string;
}

export interface ChannelModelOverride {
  channelId: ChannelId;
  overrides: ModelOverrides;
  enabled: boolean;
  conditions?: {
    command?: string;
    user?: string;
    group?: string;
    timeOfDay?: {
      startHour: number;
      endHour: number;
    };
  };
}

const modelOverrides = new Map<ChannelId, ChannelModelOverride>();

export function setChannelModelOverrides(override: ChannelModelOverride): void {
  modelOverrides.set(override.channelId, override);
  logger.debug(`[Channels:ModelOverrides] Set overrides for ${override.channelId}`);
}

export function getChannelModelOverrides(channelId: ChannelId): ChannelModelOverride | undefined {
  return modelOverrides.get(channelId);
}

export function getEffectiveModelParams(
  channelId: ChannelId,
  baseParams: ModelOverrides
): ModelOverrides {
  const channelOverride = modelOverrides.get(channelId);
  if (!channelOverride || !channelOverride.enabled) {
    return { ...baseParams };
  }

  return {
    ...baseParams,
    ...channelOverride.overrides,
  };
}

export function applyModelOverride(
  channelId: ChannelId,
  params: ModelOverrides
): ModelOverrides {
  return getEffectiveModelParams(channelId, params);
}

export function enableModelOverrides(channelId: ChannelId, enabled: boolean): void {
  const override = modelOverrides.get(channelId);
  if (override) {
    override.enabled = enabled;
  }
}

export function updateModelOverride(
  channelId: ChannelId,
  updates: Partial<ModelOverrides>
): boolean {
  const override = modelOverrides.get(channelId);
  if (!override) return false;

  override.overrides = { ...override.overrides, ...updates };
  return true;
}

export function removeModelOverrides(channelId: ChannelId): boolean {
  return modelOverrides.delete(channelId);
}

export function clearAllModelOverrides(): void {
  modelOverrides.clear();
}

export function mergeModelOverrides(
  base: ModelOverrides,
  ...overrides: ModelOverrides[]
): ModelOverrides {
  return overrides.reduce(
    (result, ovr) => ({ ...result, ...ovr }),
    { ...base }
  );
}
