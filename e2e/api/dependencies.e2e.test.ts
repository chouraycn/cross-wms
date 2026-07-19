/**
 * 依赖项运行时验证测试
 *
 * 验证本次为移植包补齐的依赖在运行时可正常加载：
 *   - typebox  → llm-core / plugin-sdk / gateway-protocol
 *   - zod      → plugin-sdk
 *   - yaml     → markdown-core
 *   - chalk    → terminal-core
 *
 * 通过直接动态 import 触发依赖加载路径，断言关键导出符号可用。
 */

import { describe, it, expect } from 'vitest';

describe('依赖项运行时验证', () => {
  it('typebox 应在 @cdf-know/gateway-protocol 中可正常加载', async () => {
    const mod = await import('@cdf-know/gateway-protocol');
    expect(mod.ProtocolSchemas).toBeDefined();
    expect(typeof mod.validateConnectParams).toBe('function');
  });

  it('typebox 应在 @cdf-know/llm-core 中可正常加载（通过 validation 模块）', async () => {
    const mod = await import('@cdf-know/llm-core');
    expect(mod).toBeDefined();
  });

  it('zod 应在 @cdf-know/plugin-sdk 中可正常加载（通过 secret-input 模块）', async () => {
    const mod = await import('@cdf-know/plugin-sdk');
    expect(mod).toBeDefined();
  });

  it('yaml 应在 @cdf-know/markdown-core 中可正常加载', async () => {
    const mod = await import('@cdf-know/markdown-core');
    expect(mod).toBeDefined();
  });

  it('chalk 应在 @cdf-know/terminal-core 中可正常加载', async () => {
    const mod = await import('@cdf-know/terminal-core');
    expect(mod).toBeDefined();
  });

  it('@cdf-know/normalization-core 应可被 @cdf-know/acp-core 正确加载', async () => {
    const mod = await import('@cdf-know/acp-core');
    expect(mod).toBeDefined();
  });

  it('@cdf-know/normalization-core 应可被 @cdf-know/media-core 正确加载', async () => {
    const mod = await import('@cdf-know/media-core');
    expect(mod).toBeDefined();
  });

  it('@cdf-know/model-catalog-core 应可被 @cdf-know/plugin-sdk 正确加载', async () => {
    const mod = await import('@cdf-know/model-catalog-core');
    expect(mod).toBeDefined();
  });
});
