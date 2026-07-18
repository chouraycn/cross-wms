/**
 * 模型选择主入口 — 模型选择的统一入口
 *
 * 聚合模型选择的所有功能，提供统一的 API。
 * 包括选择解析、显示、可见性管理等。
 */

import { logger } from '../../logger.js';
import {
  resolveModelSelection,
  type ModelSelectionContext,
  type ResolvedModelSelection,
  type ModelResolveOptions,
} from './model-selection-resolve.js';
import {
  buildDisplayGroups,
  searchDisplayModels,
  formatContextWindow,
  getProviderDisplayName,
  getProviderCategory,
  type ModelDisplayInfo,
  type DisplayGroup,
} from './model-selection-display.js';
import {
  formatModelListForCli,
  createModelPickerPrompt,
  groupModelsForCliDisplay,
  isCliProvider,
  type CliModelPickerOptions,
  type CliModelListOptions,
} from './model-selection-cli.js';
import {
  getModelPickerVisibilityManager,
  type PickerVisibilityState,
} from './model-picker-visibility.js';
import {
  isModelVisible,
  filterVisibleModels,
  createVisibilityPolicy,
  type VisibilityPolicyConfig,
  type VisibilityContext,
  type VisibilityPolicy,
} from './model-visibility-policy.js';
import {
  parseModelRef,
  normalizeProviderId,
  normalizeModelId,
  modelKey,
  normalizeModelRef,
  isSameModelRef,
  type ModelRef,
  type ModelManifestNormalizationContext,
} from './model-selection-normalize.js';
import {
  buildModelAliasIndex,
  buildAllowedModelSetWithFallbacks,
  isModelAllowed,
  buildConfiguredAllowlistKeys,
  buildConfiguredModelCatalog,
  resolveAllowedModelRefFromAliasIndex,
  resolveModelRefFromString,
  normalizeModelSelection,
  resolveBareModelDefaultProvider,
  inferUniqueProviderFromCatalog,
  inferUniqueProviderFromConfiguredModels,
  getModelRefStatusWithFallbackModels,
  resolveConfiguredModelRef,
  type ModelAliasIndex,
  type ModelRefStatus,
  type AllowedModelSet,
} from './model-selection-shared.js';

export type {
  ModelRef,
  ModelManifestNormalizationContext,
  ModelAliasIndex,
  ModelRefStatus,
  AllowedModelSet,
  ModelSelectionContext,
  ResolvedModelSelection,
  ModelResolveOptions,
  ModelDisplayInfo,
  DisplayGroup,
  CliModelPickerOptions,
  CliModelListOptions,
  PickerVisibilityState,
  VisibilityPolicyConfig,
  VisibilityContext,
  VisibilityPolicy,
};

export {
  parseModelRef,
  normalizeProviderId,
  normalizeModelId,
  modelKey,
  normalizeModelRef,
  isSameModelRef,
  buildModelAliasIndex,
  buildAllowedModelSetWithFallbacks,
  isModelAllowed,
  buildConfiguredAllowlistKeys,
  buildConfiguredModelCatalog,
  resolveAllowedModelRefFromAliasIndex,
  resolveModelRefFromString,
  normalizeModelSelection,
  resolveBareModelDefaultProvider,
  inferUniqueProviderFromCatalog,
  inferUniqueProviderFromConfiguredModels,
  getModelRefStatusWithFallbackModels,
  resolveConfiguredModelRef,
  resolveModelSelection,
  buildDisplayGroups,
  searchDisplayModels,
  formatContextWindow,
  getProviderDisplayName,
  getProviderCategory,
  formatModelListForCli,
  createModelPickerPrompt,
  groupModelsForCliDisplay,
  isCliProvider,
  isModelVisible,
  filterVisibleModels,
  createVisibilityPolicy,
  getModelPickerVisibilityManager,
};

export type ThinkLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'adaptive'
  | 'max';

export function selectModel(
  modelRef: string | undefined,
  context: ModelSelectionContext,
  options: ModelResolveOptions = {},
): ResolvedModelSelection {
  logger.debug(`[ModelSelection] 选择模型: ${modelRef ?? '(none)'}`);

  const result = resolveModelSelection(modelRef, context, options);

  logger.debug(
    `[ModelSelection] 选择结果: ${result.modelId} (${result.providerId}) ` +
    `来源: ${result.source}`,
  );

  return result;
}

export function getModelSelectionSummary(
  selection: ResolvedModelSelection,
): string {
  return [
    `model=${selection.modelId}`,
    `provider=${selection.providerId}`,
    `source=${selection.source}`,
  ].join(', ');
}
