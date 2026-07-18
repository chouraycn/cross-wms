import type {
  NormalizedModelCatalogRow,
  ModelCatalogProvider,
  ModelCatalogModel,
  ModelCapability,
} from './types';
import type { ProviderIndex } from './provider-index/types';
import { logger } from '../../logger.js';

type ProviderIndexPlanEntry = {
  provider: string;
  pluginId: string;
  rows: readonly NormalizedModelCatalogRow[];
};

type ProviderIndexPlan = {
  rows: readonly NormalizedModelCatalogRow[];
  entries: readonly ProviderIndexPlanEntry[];
};

function normalizeProviderId(id: string): string {
  return id.trim().toLowerCase();
}

function normalizeModelId(id: string): string {
  return id.trim().toLowerCase();
}

function buildMergeKey(provider: string, modelId: string): string {
  return `${normalizeProviderId(provider)}::${normalizeModelId(modelId)}`;
}

function buildRef(provider: string, modelId: string): string {
  return `${normalizeProviderId(provider)}/${normalizeModelId(modelId)}`;
}

function withPreviewStatusDefaults(providerCatalog: ModelCatalogProvider): ModelCatalogProvider {
  return {
    ...providerCatalog,
    models: providerCatalog.models.map((model: ModelCatalogModel) => ({
      ...model,
      status: model.status ?? 'preview',
    })),
  };
}

function normalizeProviderRows(params: {
  provider: string;
  providerCatalog: ModelCatalogProvider;
  source: 'provider-index';
}): NormalizedModelCatalogRow[] {
  const normalizedProvider = normalizeProviderId(params.provider);
  const rows: NormalizedModelCatalogRow[] = [];

  for (const model of params.providerCatalog.models) {
    const modelId = normalizeModelId(model.id);
    if (!modelId) {
      continue;
    }
    rows.push({
      provider: normalizedProvider,
      id: modelId,
      ref: buildRef(normalizedProvider, modelId),
      mergeKey: buildMergeKey(normalizedProvider, modelId),
      name: model.name ?? modelId,
      source: params.source,
      input: model.input ?? ['text'],
      reasoning: model.reasoning ?? false,
      status: model.status ?? 'preview',
      ...(params.providerCatalog.api ? { api: params.providerCatalog.api } : {}),
      ...(params.providerCatalog.baseUrl ? { baseUrl: params.providerCatalog.baseUrl } : {}),
      ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
      ...(model.maxOutputTokens !== undefined ? { maxOutputTokens: model.maxOutputTokens } : {}),
      ...(model.capabilities && model.capabilities.length > 0
        ? { capabilities: model.capabilities as ModelCapability[] }
        : {}),
      ...(model.description ? { description: model.description } : {}),
      ...(model.isRecommended !== undefined ? { isRecommended: model.isRecommended } : {}),
      ...(model.tags && model.tags.length > 0 ? { tags: model.tags } : {}),
      ...(model.metadata ? { metadata: model.metadata } : {}),
    });
  }

  return rows;
}

export function planProviderIndexModelCatalogRows(params: {
  index: ProviderIndex;
  providerFilter?: string;
}): ProviderIndexPlan {
  const providerFilter = params.providerFilter
    ? normalizeProviderId(params.providerFilter)
    : undefined;
  const entries: ProviderIndexPlanEntry[] = [];

  for (const [providerId, provider] of Object.entries(params.index.providers)) {
    const normalizedProvider = normalizeProviderId(providerId);
    if (
      !normalizedProvider ||
      (providerFilter && normalizedProvider !== providerFilter) ||
      !provider.previewCatalog
    ) {
      continue;
    }
    const rows = normalizeProviderRows({
      provider: normalizedProvider,
      providerCatalog: withPreviewStatusDefaults(provider.previewCatalog),
      source: 'provider-index',
    });
    if (rows.length === 0) {
      continue;
    }
    entries.push({
      provider: normalizedProvider,
      pluginId: provider.plugin.id,
      rows,
    });
  }

  const result = {
    entries,
    rows: entries
      .flatMap((entry) => entry.rows)
      .toSorted(
        (left, right) =>
          left.provider.localeCompare(right.provider) || left.id.localeCompare(right.id),
      ),
  };

  logger.debug(
    `[ProviderIndexPlanner] 规划完成，${entries.length} 个 provider，${result.rows.length} 个模型`,
  );

  return result;
}
