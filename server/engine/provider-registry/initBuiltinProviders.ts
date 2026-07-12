/**
 * 初始化内置 Provider 到统一 Provider 注册中心（P0-C）
 *
 * 背景：unifiedProviderRegistry 的设计意图是「一处声明 apiType + 激活 adapter，
 * 替代 inferApiType 的脆弱字符串匹配」。但此前它只在 /api/models 路由里被动接收
 * 用户自定义 provider，内置 provider（deepseek / minimax / moonshot / ...）从未被
 * 显式注册进去——是又一个「已存在但未接线」的资产（同 P0-A 的 skillRegistry、
 * P0-B 的 dingtalk channel）。
 *
 * 本函数在启动时把 modelProviderRegistry 的全部内置 provider 显式注册进
 * unifiedProviderRegistry，使其真正掌握完整的内置 provider 列表，并让 aiClient
 * 能通过 resolveApiTypeExplicitly() 拿到显式 apiType（消除 moonshot/kimi 的
 * openai-chat vs moonshot-chat 潜在不一致）。
 *
 * 幂等：已注册则跳过，避免与 /api/models 路由的 syncProvidersToRegistry 冲突。
 */

import { logger } from '../../logger.js';
import { getAllProviders } from '../modelProviderRegistry.js';
import { getUnifiedProviderRegistry } from './unifiedProviderRegistry.js';
import { inferApiType } from '../../adapters/registry.js';

/**
 * 把全部内置 Provider 注册进统一 Provider 注册中心（启动期调用一次）
 */
export function initBuiltinProviders(): void {
  const registry = getUnifiedProviderRegistry();
  let registered = 0;
  let skipped = 0;

  for (const provider of getAllProviders()) {
    if (registry.has(provider.id)) {
      skipped++;
      continue;
    }

    // apiType 用 inferApiType(provider.id) 推导，与 /api/models 路由保持一致：
    // 对 deepseek/minimax/智谱/混元/豆包 → openai-chat；对 kimi/moonshot → moonshot-chat；
    // 对 qwen → qwen-chat。全部命中已注册的适配器。
    const apiType = inferApiType(provider.id);
    const envVar = provider.auth?.[0]?.envVar;

    registry.register({
      id: provider.id,
      displayName: provider.name,
      description: provider.description,
      categories: (provider.categories as string[] | undefined) ?? ['cloud'],
      apiType: apiType as never,
      defaultEndpoint: provider.baseUrl,
      apiKeyEnvVar: envVar,
      authMode: provider.authType === 'none' ? 'none' : 'api-key',
      isLocal: provider.isLocal,
      website: provider.website,
      builtin: true,
    });
    registered++;
  }

  const stats = registry.getStats();
  logger.info(
    `[Provider Registry] 内置 Provider 已注册到统一注册中心: registered=${registered}, skipped=${skipped}, total=${stats.total}, activated=${stats.activated}`,
  );
}
