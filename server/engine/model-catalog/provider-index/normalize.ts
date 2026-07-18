import type {
  ModelCatalogProvider,
  ModelCatalogModel,
  ModelCapability,
} from '../types';
import type {
  ProviderIndex,
  ProviderIndexProvider,
  ProviderIndexPlugin,
  ProviderIndexPluginInstall,
  ProviderIndexAuthChoice,
} from './types';
import { logger } from '../../../logger.js';

const PROVIDER_INDEX_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSafeKey(value: unknown): string {
  const key = normalizeOptionalString(value) ?? '';
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
    return '';
  }
  return key;
}

function normalizeUniqueTrimmedStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const str = normalizeOptionalString(item);
    if (str && !seen.has(str)) {
      seen.add(str);
      result.push(str);
    }
  }
  return result;
}

function normalizeInstall(value: unknown): ProviderIndexPluginInstall | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const npmSpec = normalizeOptionalString(value.npmSpec);
  if (!npmSpec) {
    return undefined;
  }
  const defaultChoice = value.defaultChoice === 'npm' ? 'npm' : undefined;
  const minHostVersion = normalizeOptionalString(value.minHostVersion);
  const expectedIntegrity = normalizeOptionalString(value.expectedIntegrity);
  return {
    npmSpec,
    ...(defaultChoice ? { defaultChoice } : {}),
    ...(minHostVersion ? { minHostVersion } : {}),
    ...(expectedIntegrity ? { expectedIntegrity } : {}),
  };
}

function normalizePlugin(value: unknown): ProviderIndexPlugin | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = normalizeSafeKey(value.id);
  if (!id) {
    return undefined;
  }
  const packageName = normalizeOptionalString(value.package) ?? '';
  const source = normalizeOptionalString(value.source) ?? '';
  const install = normalizeInstall(value.install);
  return {
    id,
    ...(packageName ? { package: packageName } : {}),
    ...(source ? { source } : {}),
    ...(install ? { install } : {}),
  };
}

function normalizeCategories(value: unknown): readonly string[] {
  return normalizeUniqueTrimmedStringList(value);
}

function normalizeModelCatalogModel(value: unknown): ModelCatalogModel | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = normalizeSafeKey(value.id);
  if (!id) {
    return undefined;
  }
  const name = normalizeOptionalString(value.name) ?? id;
  const description = normalizeOptionalString(value.description);
  const contextWindow =
    typeof value.contextWindow === 'number' && Number.isFinite(value.contextWindow)
      ? Math.max(0, value.contextWindow)
      : undefined;
  const maxOutputTokens =
    typeof value.maxOutputTokens === 'number' && Number.isFinite(value.maxOutputTokens)
      ? Math.max(0, value.maxOutputTokens)
      : undefined;
  const input = [...normalizeUniqueTrimmedStringList(value.input)];
  const reasoning = typeof value.reasoning === 'boolean' ? value.reasoning : false;
  const status =
    value.status === 'available' ||
    value.status === 'preview' ||
    value.status === 'deprecated' ||
    value.status === 'experimental' ||
    value.status === 'unavailable'
      ? value.status
      : 'preview';
  const capabilities = normalizeUniqueTrimmedStringList(value.capabilities) as ModelCapability[];
  const aliases = [...normalizeUniqueTrimmedStringList(value.aliases)];
  const tags = [...normalizeUniqueTrimmedStringList(value.tags)];
  const isRecommended = typeof value.isRecommended === 'boolean' ? value.isRecommended : false;
  return {
    id,
    name,
    ...(description ? { description } : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(input.length > 0 ? { input } : {}),
    reasoning,
    status,
    ...(capabilities.length > 0 ? { capabilities } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    isRecommended,
  };
}

function normalizePreviewCatalog(params: {
  providerId: string;
  value: unknown;
}): ModelCatalogProvider | undefined {
  if (!isRecord(params.value)) {
    return undefined;
  }
  const models: ModelCatalogModel[] = [];
  if (Array.isArray(params.value.models)) {
    for (const modelValue of params.value.models) {
      const model = normalizeModelCatalogModel(modelValue);
      if (model) {
        model.status = model.status ?? 'preview';
        models.push(model);
      }
    }
  }
  if (models.length === 0) {
    return undefined;
  }
  const name = normalizeOptionalString(params.value.name) ?? params.providerId;
  const description = normalizeOptionalString(params.value.description);
  const api = normalizeOptionalString(params.value.api);
  const baseUrl = normalizeOptionalString(params.value.baseUrl);
  return {
    id: params.providerId,
    name,
    ...(description ? { description } : {}),
    ...(api ? { api } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    models,
  };
}

function normalizeOnboardingScopes(
  value: unknown,
): ProviderIndexAuthChoice['onboardingScopes'] | undefined {
  const scopes = normalizeUniqueTrimmedStringList(value).filter(
    (scope): scope is 'text-inference' | 'image-generation' | 'music-generation' =>
      scope === 'text-inference' || scope === 'image-generation' || scope === 'music-generation',
  );
  return scopes.length > 0 ? scopes : undefined;
}

function normalizeAuthChoice(params: {
  providerId: string;
  providerName: string;
  value: unknown;
}): ProviderIndexAuthChoice | undefined {
  if (!isRecord(params.value)) {
    return undefined;
  }
  const method = normalizeSafeKey(params.value.method);
  const choiceId = normalizeSafeKey(params.value.choiceId);
  const choiceLabel = normalizeOptionalString(params.value.choiceLabel) ?? '';
  if (!method || !choiceId || !choiceLabel) {
    return undefined;
  }
  const choiceHint = normalizeOptionalString(params.value.choiceHint);
  const groupId = normalizeSafeKey(params.value.groupId) || params.providerId;
  const groupLabel = normalizeOptionalString(params.value.groupLabel) ?? params.providerName;
  const groupHint = normalizeOptionalString(params.value.groupHint);
  const optionKey = normalizeSafeKey(params.value.optionKey);
  const cliFlag = normalizeOptionalString(params.value.cliFlag);
  const cliOption = normalizeOptionalString(params.value.cliOption);
  const cliDescription = normalizeOptionalString(params.value.cliDescription);
  const onboardingScopes = normalizeOnboardingScopes(params.value.onboardingScopes);
  return {
    method,
    choiceId,
    choiceLabel,
    ...(choiceHint ? { choiceHint } : {}),
    ...(groupId ? { groupId } : {}),
    ...(groupLabel ? { groupLabel } : {}),
    ...(groupHint ? { groupHint } : {}),
    ...(optionKey ? { optionKey } : {}),
    ...(cliFlag ? { cliFlag } : {}),
    ...(cliOption ? { cliOption } : {}),
    ...(cliDescription ? { cliDescription } : {}),
    ...(onboardingScopes ? { onboardingScopes } : {}),
  };
}

function normalizeAuthChoices(params: {
  providerId: string;
  providerName: string;
  value: unknown;
}): readonly ProviderIndexAuthChoice[] | undefined {
  if (!Array.isArray(params.value)) {
    return undefined;
  }
  const choices = params.value
    .map((value) => normalizeAuthChoice({ ...params, value }))
    .filter((choice): choice is ProviderIndexAuthChoice => Boolean(choice));
  return choices.length > 0 ? choices : undefined;
}

function normalizeProvider(
  rawProviderId: string,
  value: unknown,
): ProviderIndexProvider | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const providerId = normalizeSafeKey(rawProviderId);
  if (!providerId) {
    return undefined;
  }
  const id = normalizeSafeKey(value.id);
  if (id && id !== providerId) {
    return undefined;
  }
  const name = normalizeOptionalString(value.name) ?? '';
  const plugin = normalizePlugin(value.plugin);
  if (!name || !plugin) {
    return undefined;
  }
  const docs = normalizeOptionalString(value.docs) ?? '';
  const categories = normalizeCategories(value.categories);
  const authChoices = normalizeAuthChoices({
    providerId,
    providerName: name,
    value: (value as Record<string, unknown>).authChoices,
  });
  const previewCatalog = normalizePreviewCatalog({
    providerId,
    value: (value as Record<string, unknown>).previewCatalog,
  });
  return {
    id: providerId,
    name,
    plugin,
    ...(docs ? { docs } : {}),
    ...(categories.length > 0 ? { categories } : {}),
    ...(authChoices ? { authChoices } : {}),
    ...(previewCatalog ? { previewCatalog } : {}),
  };
}

export function normalizeProviderIndex(value: unknown): ProviderIndex | undefined {
  if (!isRecord(value) || value.version !== PROVIDER_INDEX_VERSION) {
    logger.debug('[ProviderIndex] 版本不匹配或不是记录对象');
    return undefined;
  }
  if (!isRecord(value.providers)) {
    logger.debug('[ProviderIndex] providers 不是记录对象');
    return undefined;
  }
  const providers: Record<string, ProviderIndexProvider> = {};
  for (const [rawProviderId, rawProvider] of Object.entries(value.providers)) {
    const providerId = normalizeSafeKey(rawProviderId);
    if (!providerId) {
      continue;
    }
    const provider = normalizeProvider(providerId, rawProvider);
    if (provider) {
      providers[providerId] = provider;
    }
  }
  const sortedProviders = Object.fromEntries(
    Object.entries(providers).toSorted(([left], [right]) => left.localeCompare(right)),
  );
  return {
    version: PROVIDER_INDEX_VERSION,
    providers: sortedProviders,
  };
}
