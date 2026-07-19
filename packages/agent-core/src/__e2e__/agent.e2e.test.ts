/**
 * @cdf-know/agent-core 包级别 E2E 测试
 *
 * 验证 agent-core 包作为独立发布的包能被正确导入和使用。
 */

import { describe, it, expect } from 'vitest';

describe('@cdf-know/agent-core 包级别 E2E', () => {
  it('应能导入包的所有公开导出', async () => {
    const mod = await import('@cdf-know/agent-core');

    // 核心类
    expect(mod.Agent).toBeDefined();
    expect(mod.AgentLoop).toBeDefined();
    expect(mod.ReasoningEngine).toBeDefined();
    expect(mod.Tracer).toBeDefined();

    // 单例
    expect(mod.globalTracer).toBeDefined();

    // 工具函数
    expect(typeof mod.uuidv7).toBe('function');
    expect(typeof mod.trace).toBe('function');
    expect(typeof mod.createStubRuntime).toBe('function');
    expect(typeof mod.validateRuntimeDeps).toBe('function');
  });

  it('uuidv7 应能生成合法的 UUID v7', async () => {
    const { uuidv7 } = await import('@cdf-know/agent-core');
    const id = uuidv7();

    // UUID v7 格式：xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    // 唯一性检查（生成 100 个应互不相同）
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(uuidv7());
    }
    expect(ids.size).toBe(100);
  });

  it('globalTracer 应为 Tracer 实例', async () => {
    const { globalTracer, Tracer } = await import('@cdf-know/agent-core');
    expect(globalTracer).toBeInstanceOf(Tracer);
  });
});
