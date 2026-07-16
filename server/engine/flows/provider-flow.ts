/**
 * Provider 配置流程 — 参考 openclaw/src/flows/provider-flow.ts
 *
 * 构建 provider 配置选项，并检查 provider 认证状态。
 * 不依赖 @openclaw/* 包，使用项目内部 modelProviderRegistry / modelCatalog。
 */

import type { FlowContribution, FlowOption } from './types.js';
import { sortFlowContributionsByLabel } from './types.js';
import { getAllProviders, getProviderById } from '../modelProviderRegistry.js';
import type { ProviderInfo } from '../modelCatalog.js';

// ===================== 类型定义 =====================

/** Provider 配置流程的作用域，区分文本推理/图像生成/音乐生成等场景。 */
export type ProviderFlowScope = 'text-inference' | 'image-generation' | 'music-generation';

const DEFAULT_PROVIDER_FLOW_SCOPE: ProviderFlowScope = 'text-inference';

/** Provider 配置流程选项，附带 onboarding 元数据。 */
export type ProviderFlowOption = FlowOption & {
  onboardingScopes?: ProviderFlowScope[];
  onboardingFeatured?: boolean;
};

/** Provider 配置流程贡献，对应 setup 表面。 */
export type ProviderFlowContribution = FlowContribution & {
  kind: 'provider';
  surface: 'setup';
  providerId: string;
  pluginId?: string;
  option: ProviderFlowOption;
  onboardingScopes?: ProviderFlowScope[];
  source: 'manifest' | 'provider-registry';
};

/** buildProviderFlowOptions 的可选参数。 */
export interface BuildProviderFlowOptionsParams {
  /** 限定作用域，默认 text-inference。 */
  scope?: ProviderFlowScope;
  /** 仅展示已认证的 provider。 */
  authenticatedOnly?: boolean;
  /** 环境变量来源，默认 process.env。 */
  env?: NodeJS.ProcessEnv;
}

/** Provider 认证状态。 */
export type ProviderAuthStatus = 'authenticated' | 'unauthenticated' | 'pending' | 'local';

// ===================== 作用域判定 =====================

/**
 * 判断 provider 是否覆盖指定作用域。
 *
 * 未声明 onboardingScopes 时仅匹配默认的 text-inference 表面。
 */
export function includesProviderFlowScope(
  scopes: readonly ProviderFlowScope[] | undefined,
  scope: ProviderFlowScope,
): boolean {
  return scopes ? scopes.includes(scope) : scope === DEFAULT_PROVIDER_FLOW_SCOPE;
}

/**
 * 根据 provider 注册表中的模型能力推断其覆盖的作用域。
 */
export function inferProviderScopes(provider: ProviderInfo): ProviderFlowScope[] {
  const scopes: ProviderFlowScope[] = [];
  const hasChatModel = (provider.models ?? []).some((model) => {
    const caps = model.capabilities ?? [];
    return caps.includes('tool_use') || caps.includes('function_calling') || caps.includes('json');
  });
  if (hasChatModel || (provider.models ?? []).length > 0) {
    scopes.push('text-inference');
  }
  return scopes;
}

// ===================== 认证状态解析 =====================

/**
 * 检查 provider 认证状态。
 *
 * 规则：
 *   - isLocal 的 provider（如 Ollama）视为 local，无需密钥；
 *   - 声明的 envVars 中任一已在环境中配置 → authenticated；
 *   - 否则 → unauthenticated。
 */
export function resolveProviderAuthStatus(
  provider: ProviderInfo,
  env: NodeJS.ProcessEnv = process.env,
): ProviderAuthStatus {
  if (provider.isLocal) {
    return 'local';
  }
  const envVars = provider.envVars ?? [];
  for (const envVar of envVars) {
    const value = env[envVar];
    if (value !== undefined && value !== '') {
      return 'authenticated';
    }
  }
  return 'unauthenticated';
}

/**
 * 根据 providerId 检查认证状态；provider 不存在时返回 unauthenticated。
 */
export function resolveProviderAuthStatusById(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): ProviderAuthStatus {
  const provider = getProviderById(providerId);
  if (!provider) {
    return 'unauthenticated';
  }
  return resolveProviderAuthStatus(provider, env);
}

// ===================== 选项构建 =====================

/**
 * 构建 provider 配置选项列表。
 *
 * 从 provider 注册表收集符合作用域的 provider，按 label 排序。
 * authenticatedOnly=true 时仅保留已认证或本地的 provider。
 */
export function buildProviderFlowOptions(
  params: BuildProviderFlowOptionsParams = {},
): ProviderFlowOption[] {
  const contributions = buildProviderFlowContributions(params);
  return contributions.map((contribution) => contribution.option);
}

/** 构建 provider 配置贡献列表（含来源标记）。 */
export function buildProviderFlowContributions(
  params: BuildProviderFlowOptionsParams = {},
): ProviderFlowContribution[] {
  const scope = params.scope ?? DEFAULT_PROVIDER_FLOW_SCOPE;
  const env = params.env ?? process.env;
  const contributions: ProviderFlowContribution[] = [];

  for (const provider of getAllProviders()) {
    const scopes = inferProviderScopes(provider);
    if (!includesProviderFlowScope(scopes, scope)) {
      continue;
    }
    const authStatus = resolveProviderAuthStatus(provider, env);
    if (
      params.authenticatedOnly &&
      authStatus !== 'authenticated' &&
      authStatus !== 'local'
    ) {
      continue;
    }
    contributions.push(providerToContribution(provider, scopes, authStatus));
  }

  return sortFlowContributionsByLabel(contributions);
}

/** 将 provider 转换为配置贡献。 */
function providerToContribution(
  provider: ProviderInfo,
  scopes: ProviderFlowScope[],
  authStatus: ProviderAuthStatus,
): ProviderFlowContribution {
  const label = provider.label ?? provider.name ?? provider.id;
  const hints: string[] = [];
  if (provider.categories?.length) {
    hints.push(provider.categories.join('/'));
  }
  if (authStatus === 'authenticated') {
    hints.push('已认证');
  } else if (authStatus === 'local') {
    hints.push('本地');
  } else {
    hints.push('未认证');
  }
  return {
    id: `provider:setup:${provider.id}`,
    kind: 'provider',
    surface: 'setup',
    providerId: provider.id,
    option: {
      value: provider.id,
      label,
      hint: hints.length > 0 ? hints.join(' · ') : undefined,
      ...(provider.docsPath ? { docs: { path: provider.docsPath } } : {}),
      onboardingScopes: scopes,
      ...(provider.models?.some((m) => m.isRecommended) ? { onboardingFeatured: true } : {}),
    },
    onboardingScopes: scopes,
    source: 'provider-registry',
  };
}
