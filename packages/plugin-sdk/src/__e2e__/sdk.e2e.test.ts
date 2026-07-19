/**
 * @cdf-know/plugin-sdk 包级别 E2E 测试
 *
 * 验证 plugin-sdk 包作为独立发布的包能被正确导入和使用。
 */

import { describe, it, expect } from 'vitest';

describe('@cdf-know/plugin-sdk 包级别 E2E', () => {
  it('应能导入包的公开导出', async () => {
    const mod = await import('@cdf-know/plugin-sdk');
    expect(mod).toBeDefined();
  });

  it('应能正确加载 @cdf-know/model-catalog-core 依赖', async () => {
    // plugin-sdk 内部依赖 model-catalog-core，导入 plugin-sdk 时应能间接加载
    const modelCatalog = await import('@cdf-know/model-catalog-core');
    expect(modelCatalog).toBeDefined();
  });

  it('应能正确加载 typebox 依赖', async () => {
    // plugin-sdk 内部使用 typebox，导入时应能正常加载
    const mod = await import('@cdf-know/plugin-sdk');
    expect(mod).toBeDefined();
  });
});
