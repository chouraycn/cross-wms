/**
 * @cdf-know/llm-core 包级别 E2E 测试
 *
 * 验证 llm-core 包作为独立发布的包能被正确导入和使用。
 * 与单元测试不同，这里关注的是包的对外接口契约。
 */

import { describe, it, expect } from 'vitest';

describe('@cdf-know/llm-core 包级别 E2E', () => {
  it('应能导入包的所有公开导出', async () => {
    const mod = await import('@cdf-know/llm-core');

    // 核心类
    expect(mod.ProviderRegistry).toBeDefined();
    expect(mod.UnifiedModelCatalog).toBeDefined();
    expect(mod.UsageTracker).toBeDefined();
    expect(mod.CostEstimator).toBeDefined();

    // 单例实例
    expect(mod.providerRegistry).toBeDefined();
    expect(mod.unifiedModelCatalog).toBeDefined();
    expect(mod.costEstimator).toBeDefined();

    // 工具函数
    expect(typeof mod.detectProvider).toBe('function');
    expect(typeof mod.detectProviderByModelId).toBe('function');
    expect(typeof mod.detectProviderByEndpoint).toBe('function');
    expect(typeof mod.collectStream).toBe('function');
    expect(typeof mod.streamToText).toBe('function');
    expect(typeof mod.streamToArray).toBe('function');
  });

  it('detectProviderByModelId 应支持 deepseek- 前缀', async () => {
    const { detectProviderByModelId } = await import('@cdf-know/llm-core');
    const result = detectProviderByModelId('deepseek-chat');
    expect(result).toBeTruthy();
    expect(result).toHaveProperty('id');
  });

  it('CHINESE_PROVIDERS 应包含国产 provider', async () => {
    const { CHINESE_PROVIDERS } = await import('@cdf-know/llm-core');
    expect(CHINESE_PROVIDERS).toBeDefined();
    expect(Array.isArray(CHINESE_PROVIDERS)).toBe(true);
    expect(CHINESE_PROVIDERS.length).toBeGreaterThan(0);
  });
});
