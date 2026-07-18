import type {
  ModelCatalog,
  ModelCatalogAlias,
  ModelCatalogDiscovery,
  NormalizedModelCatalogRow,
  ModelCatalogModel,
  ModelCatalogProvider,
  ModelCapability,
} from './types';
import { logger } from '../../logger.js';

type ManifestPlugin = {
  id: string;
  providers?: readonly string[];
  modelCatalog?: Pick<
    ModelCatalog,
    'providers' | 'aliases' | 'suppressions' | 'discovery' | 'runtimeAugment'
  >;
};

type ManifestRegistry = {
  plugins: readonly ManifestPlugin[];
};

type ManifestPlanEntry = {
  pluginId: string;
  provider: string;
  discovery?: ModelCatalogDiscovery;
  rows: readonly NormalizedModelCatalogRow[];
};

type ManifestConflict = {
  mergeKey: string;
  ref: string;
  provider: string;
  modelId: string;
  firstPluginId: string;
  secondPluginId: string;
};

type ManifestPlan = {
  rows: readonly NormalizedModelCatalogRow[];
  entries: readonly ManifestPlanEntry[];
  conflicts: readonly ManifestConflict[];
};

export type ManifestSuppressionEntry = {
  pluginId: string;
  provider: string;
  model: string;
  mergeKey: string;
  reason?: string;
  when?: NonNullable<ModelCatalog['suppressions']>[number]['when'];
};

type ManifestSuppressionPlan = {
  suppressions: readonly ManifestSuppressionEntry[];
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

function normalizeModelModel(model: ModelCatalogModel): ModelCatalogModel {
  const id = normalizeModelId(model.id);
  return {
    ...model,
    id,
    name: model.name ?? id,
    input: model.input ?? ['text'],
    reasoning: model.reasoning ?? false,
    status: model.status ?? 'available',
    isRecommended: model.isRecommended ?? false,
  };
}

function normalizeModelProviderRows(params: {
  provider: string;
  providerCatalog: ModelCatalogProvider;
  source: 'manifest' | 'config' | 'registry';
}): NormalizedModelCatalogRow[] {
  const normalizedProvider = normalizeProviderId(params.provider);
  const rows: NormalizedModelCatalogRow[] = [];

  for (const model of params.providerCatalog.models) {
    const normalizedModel = normalizeModelModel(model);
    const modelId = normalizedModel.id;
    rows.push({
      provider: normalizedProvider,
      id: modelId,
      ref: buildRef(normalizedProvider, modelId),
      mergeKey: buildMergeKey(normalizedProvider, modelId),
      name: normalizedModel.name ?? modelId,
      source: params.source,
      input: normalizedModel.input ?? ['text'],
      reasoning: normalizedModel.reasoning ?? false,
      status: normalizedModel.status ?? 'available',
      ...(params.providerCatalog.api ? { api: params.providerCatalog.api } : {}),
      ...(params.providerCatalog.baseUrl ? { baseUrl: params.providerCatalog.baseUrl } : {}),
      ...(normalizedModel.contextWindow !== undefined
        ? { contextWindow: normalizedModel.contextWindow }
        : {}),
      ...(normalizedModel.maxOutputTokens !== undefined
        ? { maxOutputTokens: normalizedModel.maxOutputTokens }
        : {}),
      ...(normalizedModel.capabilities && normalizedModel.capabilities.length > 0
        ? { capabilities: normalizedModel.capabilities as ModelCapability[] }
        : {}),
      ...(normalizedModel.description ? { description: normalizedModel.description } : {}),
      ...(normalizedModel.isRecommended !== undefined
        ? { isRecommended: normalizedModel.isRecommended }
        : {}),
      ...(normalizedModel.tags && normalizedModel.tags.length > 0
        ? { tags: normalizedModel.tags }
        : {}),
      ...(normalizedModel.metadata ? { metadata: normalizedModel.metadata } : {}),
    });
  }

  return rows;
}

function applyAliasOverrides(params: {
  rows: readonly NormalizedModelCatalogRow[];
  alias?: ModelCatalogAlias;
}): readonly NormalizedModelCatalogRow[] {
  const alias = params.alias;
  if (!alias) {
    return params.rows;
  }
  return params.rows.map((row) => ({
    ...row,
    ...(alias.api ? { api: alias.api } : {}),
    ...(alias.baseUrl ? { baseUrl: alias.baseUrl } : {}),
  }));
}

function buildOwnedProviderSet(plugin: ManifestPlugin): ReadonlySet<string> {
  const providers = plugin.providers ?? [];
  return new Set(providers.map(normalizeProviderId).filter(Boolean));
}

function buildAliasTargets(
  plugin: ManifestPlugin,
): ReadonlyMap<string, readonly string[]> {
  const ownedProviders = buildOwnedProviderSet(plugin);
  const aliasesByTarget = new Map<string, string[]>();

  for (const [rawAlias, alias] of Object.entries(plugin.modelCatalog?.aliases ?? {})) {
    const aliasProvider = normalizeProviderId(rawAlias);
    const targetProvider = normalizeProviderId(alias.provider);
    if (!aliasProvider || !targetProvider || !ownedProviders.has(targetProvider)) {
      continue;
    }
    const aliases = aliasesByTarget.get(targetProvider) ?? [];
    aliases.push(aliasProvider);
    aliasesByTarget.set(targetProvider, aliases);
  }

  return aliasesByTarget;
}

function buildProviderRefs(plugin: ManifestPlugin): ReadonlySet<string> {
  const ownedProviders = buildOwnedProviderSet(plugin);
  const refs = new Set(ownedProviders);

  for (const [rawAlias, alias] of Object.entries(plugin.modelCatalog?.aliases ?? {})) {
    const aliasProvider = normalizeProviderId(rawAlias);
    const targetProvider = normalizeProviderId(alias.provider);
    if (aliasProvider && targetProvider && ownedProviders.has(targetProvider)) {
      refs.add(aliasProvider);
    }
  }

  return refs;
}

function planPluginEntries(params: {
  plugin: ManifestPlugin;
  providerFilter: string | undefined;
}): ManifestPlanEntry[] {
  const providers = params.plugin.modelCatalog?.providers;
  if (!providers) {
    return [];
  }

  const aliasesByTarget = buildAliasTargets(params.plugin);

  return Object.entries(providers).flatMap(([provider, providerCatalog]) => {
    const normalizedProvider = normalizeProviderId(provider);
    if (!normalizedProvider) {
      return [];
    }
    const providerAliases = aliasesByTarget.get(normalizedProvider) ?? [];
    const plannedProviders = params.providerFilter
      ? providerAliases.includes(params.providerFilter) ||
        normalizedProvider === params.providerFilter
        ? [params.providerFilter]
        : []
      : [normalizedProvider];
    if (plannedProviders.length === 0) {
      return [];
    }
    return plannedProviders.flatMap((plannedProvider) => {
      const rows = normalizeModelProviderRows({
        provider: plannedProvider,
        providerCatalog,
        source: 'manifest',
      });
      if (rows.length === 0) {
        return [];
      }
      return [
        {
          pluginId: params.plugin.id,
          provider: plannedProvider,
          discovery: params.plugin.modelCatalog?.discovery?.[normalizedProvider],
          rows: applyAliasOverrides({
            rows,
            alias: params.plugin.modelCatalog?.aliases?.[plannedProvider],
          }),
        },
      ];
    });
  });
}

export function planManifestModelCatalogRows(params: {
  registry: ManifestRegistry;
  providerFilter?: string;
}): ManifestPlan {
  const providerFilter = params.providerFilter
    ? normalizeProviderId(params.providerFilter)
    : undefined;
  const entries: ManifestPlanEntry[] = [];

  for (const plugin of params.registry.plugins) {
    for (const entry of planPluginEntries({ plugin, providerFilter })) {
      entries.push(entry);
    }
  }

  const rowCandidates: NormalizedModelCatalogRow[] = [];
  const seenRows = new Map<string, { pluginId: string; row: NormalizedModelCatalogRow }>();
  const conflicts = new Map<string, ManifestConflict>();

  for (const entry of entries) {
    for (const row of entry.rows) {
      const seen = seenRows.get(row.mergeKey);
      if (seen) {
        if (!conflicts.has(row.mergeKey)) {
          conflicts.set(row.mergeKey, {
            mergeKey: row.mergeKey,
            ref: seen.row.ref,
            provider: seen.row.provider,
            modelId: seen.row.id,
            firstPluginId: seen.pluginId,
            secondPluginId: entry.pluginId,
          });
          logger.warn(
            `[ManifestPlanner] 发现冲突: ${row.mergeKey} (${seen.pluginId} vs ${entry.pluginId})`,
          );
        }
        continue;
      }
      seenRows.set(row.mergeKey, { pluginId: entry.pluginId, row });
      rowCandidates.push(row);
    }
  }

  const conflictedKeys = new Set(conflicts.keys());
  const rows = rowCandidates.filter((row) => !conflictedKeys.has(row.mergeKey));

  return {
    entries,
    conflicts: [...conflicts.values()],
    rows: rows.toSorted(
      (left, right) =>
        left.provider.localeCompare(right.provider) || left.id.localeCompare(right.id),
    ),
  };
}

export function planManifestModelCatalogSuppressions(params: {
  registry: ManifestRegistry;
  providerFilter?: string;
  modelFilter?: string;
}): ManifestSuppressionPlan {
  const providerFilter = params.providerFilter
    ? normalizeProviderId(params.providerFilter)
    : undefined;
  const modelFilter = params.modelFilter ? normalizeModelId(params.modelFilter) : undefined;
  const suppressions: ManifestSuppressionEntry[] = [];

  for (const plugin of params.registry.plugins) {
    const providerRefs = buildProviderRefs(plugin);
    for (const suppression of plugin.modelCatalog?.suppressions ?? []) {
      const provider = normalizeProviderId(suppression.provider);
      const model = normalizeModelId(suppression.model);
      if (!provider || !model) {
        continue;
      }
      if (providerFilter && provider !== providerFilter) {
        continue;
      }
      if (modelFilter && model !== modelFilter) {
        continue;
      }
      if (!providerRefs.has(provider)) {
        continue;
      }
      suppressions.push({
        pluginId: plugin.id,
        provider,
        model,
        mergeKey: buildMergeKey(provider, model),
        ...(suppression.reason ? { reason: suppression.reason } : {}),
        ...(suppression.when ? { when: suppression.when } : {}),
      });
    }
  }

  return {
    suppressions: suppressions.toSorted(
      (left, right) =>
        left.provider.localeCompare(right.provider) ||
        left.model.localeCompare(right.model) ||
        left.pluginId.localeCompare(right.pluginId),
    ),
  };
}
