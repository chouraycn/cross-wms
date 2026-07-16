/**
 * 模型选择流程 — 参考 openclaw/src/flows/model-picker.ts
 *
 * 从已注册的 providers 与模型目录构建可选模型列表，并解析默认模型。
 * 不依赖 @openclaw/* 包，使用项目内部 modelCatalog / modelProviderRegistry。
 */

import type { FlowContribution, FlowOption } from './types.js';
import { sortFlowContributionsByLabel } from './types.js';
import { getAllProviders, getProviderById } from '../modelProviderRegistry.js';
import type { ProviderInfo } from '../modelCatalog.js';
import { listModelCatalog } from '../modelCatalog.js';
import type { ModelCatalogEntry } from '../modelCatalog.js';

// ===================== 类型定义 =====================

/** 模型选择选项，附带 provider 与模型元数据。 */
export type ModelPickerOption = FlowOption & {
  providerId: string;
  modelId: string;
  contextWindow?: number;
  reasoning?: boolean;
  authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
};

/** 模型选择贡献，对应 model-picker 表面。 */
export type ModelPickerContribution = FlowContribution & {
  kind: 'provider';
  surface: 'model-picker';
  providerId: string;
  modelId: string;
  option: ModelPickerOption;
  source: 'catalog' | 'provider-registry';
};

/** buildModelPickerOptions 的可选参数。 */
export interface BuildModelPickerOptionsParams {
  /** 仅展示已认证的模型（authStatus === 'authenticated'）。 */
  authenticatedOnly?: boolean;
  /** 仅展示指定 provider 的模型。 */
  preferredProvider?: string;
}

// ===================== 标签格式化 =====================

/**
 * 格式化模型标签：优先使用 provider/model 形式，附带展示名（若与 id 不同）。
 *
 * 例：provider=anthropic, model=claude-3-5-sonnet → "anthropic/claude-3-5-sonnet"
 *     若 name="Claude 3.5 Sonnet" 则作为 hint 返回。
 */
export function formatModelLabel(params: {
  provider: string;
  model: string;
  name?: string;
}): { label: string; hint?: string } {
  const key = `${params.provider}/${params.model}`;
  const hint = params.name && params.name !== params.model ? params.name : undefined;
  return { label: key, hint };
}

/** 将上下文窗口大小格式化为 k 单位字符串（如 200000 → "200k"）。 */
export function formatTokenK(contextWindow: number): string {
  if (contextWindow >= 1000) {
    return `${Math.round(contextWindow / 1000)}k`;
  }
  return String(contextWindow);
}

// ===================== 选项构建 =====================

/**
 * 从已注册 providers 与模型目录构建模型选择选项列表。
 *
 * 合并 provider registry 与模型目录两个来源，按 label 排序去重。
 */
export function buildModelPickerOptions(
  params: BuildModelPickerOptionsParams = {},
): ModelPickerOption[] {
  const contributions = buildModelPickerContributions(params);
  return contributions.map((contribution) => contribution.option);
}

/** 构建模型选择贡献列表（含来源标记），供需要区分来源的调用方使用。 */
export function buildModelPickerContributions(
  params: BuildModelPickerOptionsParams = {},
): ModelPickerContribution[] {
  const seen = new Set<string>();
  const contributions: ModelPickerContribution[] = [];
  const preferredProvider = params.preferredProvider?.trim().toLowerCase();

  // 来源 1：模型目录
  for (const entry of listModelCatalog()) {
    if (preferredProvider && entry.provider.toLowerCase() !== preferredProvider) {
      continue;
    }
    if (params.authenticatedOnly && entry.authStatus !== 'authenticated') {
      continue;
    }
    const key = `${entry.provider}/${entry.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    contributions.push(catalogEntryToContribution(entry));
  }

  // 来源 2：provider 注册表（补充目录中未收录的模型）
  for (const provider of getAllProviders()) {
    if (preferredProvider && provider.id.toLowerCase() !== preferredProvider) {
      continue;
    }
    for (const model of provider.models ?? []) {
      const modelId = model.modelId ?? model.id;
      const key = `${provider.id}/${modelId}`;
      if (seen.has(key)) {
        continue;
      }
      if (params.authenticatedOnly && model.authStatus !== 'authenticated') {
        continue;
      }
      seen.add(key);
      contributions.push(providerModelToContribution(provider, model, modelId));
    }
  }

  return sortFlowContributionsByLabel(contributions);
}

/** 将模型目录条目转换为贡献。 */
function catalogEntryToContribution(entry: ModelCatalogEntry): ModelPickerContribution {
  const { label, hint } = formatModelLabel({
    provider: entry.provider,
    model: entry.id,
    name: entry.name,
  });
  const hints: string[] = [];
  if (hint) {
    hints.push(hint);
  }
  if (entry.contextWindow) {
    hints.push(`ctx ${formatTokenK(entry.contextWindow)}`);
  }
  if (entry.capabilities?.includes('code')) {
    hints.push('code');
  }
  return {
    id: `model:picker:${entry.provider}/${entry.id}`,
    kind: 'provider',
    surface: 'model-picker',
    providerId: entry.provider,
    modelId: entry.id,
    source: 'catalog',
    option: {
      value: `${entry.provider}/${entry.id}`,
      label,
      hint: hints.length > 0 ? hints.join(' · ') : undefined,
      providerId: entry.provider,
      modelId: entry.id,
      ...(entry.contextWindow !== undefined ? { contextWindow: entry.contextWindow } : {}),
      ...(entry.authStatus ? { authStatus: entry.authStatus } : {}),
      assistantPriority: entry.available ? 0 : undefined,
    },
  };
}

/** 将 provider 注册表中的模型转换为贡献。 */
function providerModelToContribution(
  provider: ProviderInfo,
  model: {
    modelId?: string;
    id: string;
    name: string;
    contextWindow?: number;
    reasoning?: boolean;
    authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
  },
  modelId: string,
): ModelPickerContribution {
  const { label, hint } = formatModelLabel({
    provider: provider.id,
    model: modelId,
    name: model.name,
  });
  const hints: string[] = [];
  if (hint) {
    hints.push(hint);
  }
  if (model.contextWindow) {
    hints.push(`ctx ${formatTokenK(model.contextWindow)}`);
  }
  if (model.reasoning) {
    hints.push('reasoning');
  }
  return {
    id: `model:picker:${provider.id}/${modelId}`,
    kind: 'provider',
    surface: 'model-picker',
    providerId: provider.id,
    modelId,
    source: 'provider-registry',
    option: {
      value: `${provider.id}/${modelId}`,
      label,
      hint: hints.length > 0 ? hints.join(' · ') : undefined,
      providerId: provider.id,
      modelId,
      ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
      ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
      ...(model.authStatus ? { authStatus: model.authStatus } : {}),
    },
  };
}

// ===================== 默认模型解析 =====================

/**
 * 解析默认模型：优先取已认证的推荐模型，其次取首个已认证模型，最后回退到首个可用模型。
 *
 * 返回 provider/model 形式的引用；无可用模型时返回 undefined。
 */
export function resolveDefaultModel(params: {
  preferredProvider?: string;
  authenticatedOnly?: boolean;
}): string | undefined {
  const options = buildModelPickerOptions({
    preferredProvider: params.preferredProvider,
    authenticatedOnly: params.authenticatedOnly,
  });

  if (options.length === 0) {
    return undefined;
  }

  // 优先已认证的模型
  const authenticated = options.filter((opt) => opt.authStatus === 'authenticated');
  if (authenticated.length > 0) {
    return authenticated[0].value;
  }
  // 回退到第一个可用选项
  return options[0].value;
}

/**
 * 根据 provider/model 引用查找其所属 provider 信息。
 */
export function resolveProviderForModelRef(modelRef: string): ProviderInfo | undefined {
  const slashIndex = modelRef.indexOf('/');
  if (slashIndex <= 0) {
    return undefined;
  }
  const providerId = modelRef.slice(0, slashIndex);
  return getProviderById(providerId);
}
