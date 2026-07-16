/**
 * 搜索引擎设置流程 — 参考 openclaw/src/flows/search-setup.ts
 *
 * 从可用的 Web 搜索 providers 构建设置选项，并解析 provider 优先级。
 * 不依赖 @openclaw/* 包，使用项目内部 plugins/web-search-providers.js。
 */

import type { FlowContribution, FlowOption } from './types.js';
import { sortFlowContributionsByLabel } from './types.js';
import {
  getWebSearchProviders,
  sortWebSearchProvidersForAutoDetect,
  resolveWebSearchCredential,
  autoDetectWebSearchProvider,
} from '../../plugins/web-search-providers.js';
import type {
  PluginWebSearchProviderEntry,
  WebSearchCredentialResolutionSource,
} from '../../plugins/web-provider-types.js';

// ===================== 类型定义 =====================

/** 搜索 provider 设置选项，附带原始 provider 条目。 */
export type SearchSetupOption = FlowOption & {
  providerId: string;
  requiresCredential?: boolean;
  credentialReady: boolean;
};

/** 搜索 provider 设置贡献，对应 setup 表面。 */
export type SearchSetupContribution = FlowContribution & {
  kind: 'search';
  surface: 'setup';
  providerId: string;
  provider: PluginWebSearchProviderEntry;
  option: SearchSetupOption;
  source: 'runtime';
};

/** buildSearchSetupOptions 的可选参数。 */
export interface BuildSearchSetupOptionsParams {
  /** 应用配置（用于凭证解析）。 */
  config?: Record<string, unknown>;
  /** 搜索工具配置（如 tools.web.search）。 */
  searchConfig?: Record<string, unknown>;
  /** 环境变量来源，默认 process.env。 */
  env?: NodeJS.ProcessEnv;
  /** 仅展示凭证已就绪的 provider。 */
  readyOnly?: boolean;
}

// ===================== 凭证就绪判定 =====================

/**
 * 判断搜索 provider 的凭证是否就绪（config/secretRef/env 任一来源有值）。
 */
export function isSearchProviderCredentialReady(
  provider: PluginWebSearchProviderEntry,
  params: BuildSearchSetupOptionsParams = {},
): boolean {
  if (provider.requiresCredential === false) {
    return true;
  }
  const credential = resolveWebSearchCredential({
    provider,
    searchConfig: params.searchConfig,
    config: params.config,
    env: (params.env ?? process.env) as Record<string, string>,
  });
  return credential.source !== 'missing';
}

// ===================== 选项构建 =====================

/**
 * 从可用的 Web 搜索 providers 构建设置选项列表。
 *
 * 按 label 排序；readyOnly=true 时仅保留凭证就绪的 provider。
 */
export function buildSearchSetupOptions(
  params: BuildSearchSetupOptionsParams = {},
): SearchSetupOption[] {
  const contributions = buildSearchSetupContributions(params);
  return contributions.map((contribution) => contribution.option);
}

/** 构建搜索设置贡献列表（含 provider 原始条目）。 */
export function buildSearchSetupContributions(
  params: BuildSearchSetupOptionsParams = {},
): SearchSetupContribution[] {
  const providers = getWebSearchProviders();
  const contributions = providers
    .filter((provider) => {
      if (!params.readyOnly) {
        return true;
      }
      return isSearchProviderCredentialReady(provider, params);
    })
    .map((provider) => buildSearchSetupContribution(provider, params));
  return sortFlowContributionsByLabel(contributions);
}

/** 将单个 provider 条目转换为设置贡献。 */
function buildSearchSetupContribution(
  provider: PluginWebSearchProviderEntry,
  params: BuildSearchSetupOptionsParams,
): SearchSetupContribution {
  const credentialReady = isSearchProviderCredentialReady(provider, params);
  const hints: string[] = [];
  if (provider.hint) {
    hints.push(provider.hint);
  }
  if (provider.requiresCredential === false) {
    hints.push('无需密钥');
  } else if (credentialReady) {
    hints.push('已配置');
  } else {
    hints.push('需配置密钥');
  }
  return {
    id: `search:setup:${provider.id}`,
    kind: 'search',
    surface: 'setup',
    providerId: provider.id,
    provider,
    source: 'runtime',
    option: {
      value: provider.id,
      label: provider.label,
      hint: hints.join(' · '),
      providerId: provider.id,
      requiresCredential: provider.requiresCredential,
      credentialReady,
      ...(provider.docsUrl ? { docs: { path: provider.docsUrl } } : {}),
    },
  };
}

// ===================== 优先级解析 =====================

/**
 * 解析搜索 provider 优先级顺序，用于自动检测与回退。
 *
 * 规则：
 *   1. 凭证就绪的 provider 按 autoDetectOrder 升序排列在前；
 *   2. 凭证未就绪的 provider 按 autoDetectOrder 升序排列在后；
 *   3. 无 autoDetectOrder 的 provider 排在最后，按 id 字母序。
 *
 * 返回 providerId 列表。
 */
export function resolveSearchProviderOrder(
  params: BuildSearchSetupOptionsParams = {},
): string[] {
  const providers = getWebSearchProviders();
  const ready = new Set(
    providers
      .filter((provider) => isSearchProviderCredentialReady(provider, params))
      .map((provider) => provider.id),
  );
  const sorted = sortWebSearchProvidersForAutoDetect(providers);
  const readyFirst = sorted.filter((provider) => ready.has(provider.id));
  const rest = sorted.filter((provider) => !ready.has(provider.id));
  return [...readyFirst, ...rest].map((provider) => provider.id);
}

/**
 * 自动检测当前最合适的搜索 provider，返回其 id 与凭证来源。
 *
 * 无可用 provider 或凭证均缺失时返回 null。
 */
export function resolveDefaultSearchProvider(
  params: BuildSearchSetupOptionsParams = {},
): { providerId: string; credentialSource: WebSearchCredentialResolutionSource } | null {
  const result = autoDetectWebSearchProvider({
    searchConfig: params.searchConfig,
    config: params.config,
    env: (params.env ?? process.env) as Record<string, string>,
  });
  if (!result.provider) {
    return null;
  }
  return {
    providerId: result.provider.id,
    credentialSource: result.credential.source,
  };
}
