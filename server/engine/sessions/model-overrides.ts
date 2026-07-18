/**
 * 模型覆盖配置
 *
 * 提供每会话的模型/提供者覆盖选择和应用功能
 */

import type { ModelOverrideSelection, SessionRecord } from './types.js';
import { logger } from '../../logger.js';

export type { ModelOverrideSelection } from './types.js';

function normalizeOptionalString(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export interface ApplyModelOverrideOptions {
  entry: SessionRecord;
  selection: ModelOverrideSelection;
  profileOverride?: string;
  profileOverrideSource?: 'auto' | 'user';
  preserveAuthProfileOverride?: boolean;
  selectionSource?: 'auto' | 'user';
  markLiveSwitchPending?: boolean;
}

export interface ApplyModelOverrideResult {
  updated: boolean;
}

export function applyModelOverrideToSessionEntry(
  params: ApplyModelOverrideOptions,
): ApplyModelOverrideResult {
  const { entry, selection, profileOverride } = params;
  const profileOverrideSource = params.profileOverrideSource ?? 'user';
  const selectionSource = params.selectionSource ?? 'user';
  let updated = false;
  let selectionUpdated = false;
  let profileUpdated = false;

  if (selection.isDefault) {
    if (entry.metadata.provider) {
      entry.metadata.provider = undefined;
      updated = true;
      selectionUpdated = true;
    }
    if (entry.metadata.modelId) {
      entry.metadata.modelId = undefined;
      updated = true;
      selectionUpdated = true;
    }
  } else {
    if (entry.metadata.provider !== selection.provider) {
      entry.metadata.provider = selection.provider;
      updated = true;
      selectionUpdated = true;
    }
    if (entry.metadata.modelId !== selection.model) {
      entry.metadata.modelId = selection.model;
      updated = true;
      selectionUpdated = true;
    }
  }

  const runtimeModel = normalizeOptionalString(entry.metadata.modelId) ?? '';
  const runtimeProvider = normalizeOptionalString(entry.metadata.provider) ?? '';
  const runtimePresent = runtimeModel.length > 0 || runtimeProvider.length > 0;
  const runtimeAligned =
    runtimeModel === selection.model &&
    (runtimeProvider.length === 0 || runtimeProvider === selection.provider);

  if (runtimePresent && (selectionUpdated || !runtimeAligned)) {
    if (entry.metadata.modelId !== undefined) {
      entry.metadata.modelId = selection.isDefault ? undefined : selection.model;
      updated = true;
    }
    if (entry.metadata.provider !== undefined) {
      entry.metadata.provider = selection.isDefault ? undefined : selection.provider;
      updated = true;
    }
  }

  if (profileOverride) {
    if (entry.metadata.tags?.authProfile !== profileOverride) {
      if (!entry.metadata.tags) {
        entry.metadata.tags = {};
      }
      entry.metadata.tags.authProfile = profileOverride;
      updated = true;
      profileUpdated = true;
    }
    if (entry.metadata.tags?.authProfileSource !== profileOverrideSource) {
      if (!entry.metadata.tags) {
        entry.metadata.tags = {};
      }
      entry.metadata.tags.authProfileSource = profileOverrideSource;
      updated = true;
      profileUpdated = true;
    }
  } else if (!params.preserveAuthProfileOverride) {
    if (entry.metadata.tags?.authProfile) {
      delete entry.metadata.tags.authProfile;
      updated = true;
      profileUpdated = true;
    }
    if (entry.metadata.tags?.authProfileSource) {
      delete entry.metadata.tags.authProfileSource;
      updated = true;
      profileUpdated = true;
    }
  }

  if (updated) {
    entry.stats.lastActivityAt = Date.now();
    logger.debug(
      `[ModelOverrides] 会话 ${entry.id} 模型覆盖已更新`,
      { provider: selection.provider, model: selection.model, source: selectionSource },
    );
  }

  return { updated };
}

export function parseModelOverrideString(
  value: string,
  defaultProvider?: string,
): ModelOverrideSelection | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parts = trimmed.split('/');
  if (parts.length === 2) {
    const [provider, model] = parts;
    if (provider && model) {
      return { provider: provider.trim(), model: model.trim() };
    }
  }

  if (parts.length === 1 && defaultProvider) {
    return { provider: defaultProvider, model: trimmed };
  }

  return undefined;
}

export function formatModelOverride(selection: ModelOverrideSelection): string {
  return `${selection.provider}/${selection.model}`;
}

export function isDefaultModelOverride(
  selection: ModelOverrideSelection | undefined,
  defaultProvider: string,
  defaultModel: string,
): boolean {
  if (!selection) return true;
  return selection.provider === defaultProvider && selection.model === defaultModel;
}
