/**
 * 模型故障转移单元测试
 *
 * 覆盖：
 * - ModelFailoverManager：健康状态管理、冷却/恢复、priority 与 capability-match 策略
 * - callAIModelWithFailover：首个模型成功、故障切换、全部失败、onModelSwitch 回调
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ===================== Mock 依赖模块 =====================
vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// aiClient.ts 的运行时依赖
vi.mock('../modelsStore.js', () => ({ isLocalModel: vi.fn().mockReturnValue(false) }));
vi.mock('../engine/contextTruncate.js', () => ({
  sanitizeToolMessages: vi.fn(<T>(m: T): T => m),
}));
vi.mock('../localServiceManager.js', () => ({
  startLocalService: vi.fn().mockResolvedValue(true),
  touchService: vi.fn(),
}));

// 部分模拟 modelFailover：保留真实 ModelFailoverManager 类，仅 mock 单例工厂
vi.mock('../engine/modelFailover.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/modelFailover.js')>();
  return {
    ...actual,
    getModelFailoverManager: vi.fn(),
  };
});

// ===================== 被测模块导入 =====================
import { ModelFailoverManager, getModelFailoverManager } from '../engine/modelFailover.js';
import { callAIModelWithFailover } from '../aiClient.js';
import type { ModelConfig, ModelCapability } from '../shared/types/models.js';
import type { ModelCallConfig, AIResponse } from '../aiClient.js';

// ===================== 测试辅助函数 =====================

/** 创建模拟的 ReadableStream reader */
function createMockReader(chunks: string[]): ReadableStreamDefaultReader {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    read: async () => {
      if (index < chunks.length) {
        const value = encoder.encode(chunks[index++]);
        return { done: false, value };
      }
      return { done: true, value: undefined } as ReadableStreamReadResult<Uint8Array>;
    },
    releaseLock: () => {},
    cancel: async () => {},
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader;
}

/** 创建 SSE 流式 Response */
function createSSEResponse(sseChunks: string[]): Response {
  const reader = createMockReader(sseChunks);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: { getReader: () => reader },
    text: async () => sseChunks.join(''),
    json: async () => ({}),
    clone: () => createSSEResponse(sseChunks),
  } as unknown as Response;
}

/** 创建 HTTP 错误 Response */
function createErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: null,
    text: async () => body,
    json: async () => JSON.parse(body),
    clone: () => createErrorResponse(status, body),
  } as unknown as Response;
}

/** 构建测试用 ModelConfig */
function createModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'model-1',
    name: 'Model 1',
    provider: 'openai',
    apiEndpoint: 'https://api.example.com/v1',
    apiKey: 'key-1',
    enabled: true,
    ...overrides,
  };
}

/** 构建测试用 ModelCallConfig */
function createCallConfig(overrides: Partial<ModelCallConfig> = {}): ModelCallConfig {
  return {
    id: 'model-1',
    provider: 'openai',
    apiEndpoint: 'https://api.example.com/v1',
    apiKey: 'key-1',
    ...overrides,
  };
}

/** 构建成功 SSE 响应（指定内容） */
function successResponse(content: string): Response {
  return createSSEResponse([
    `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`,
    'data: [DONE]\n\n',
  ]);
}

// ===================== ModelFailoverManager 测试 =====================

describe('ModelFailoverManager', () => {
  let manager: ModelFailoverManager;

  beforeEach(() => {
    manager = new ModelFailoverManager({
      maxFailuresBeforeCooldown: 3,
      cooldownMs: 1000,
      policy: 'priority',
    });
  });

  describe('setModels', () => {
    it('应初始化所有已启用模型的健康状态', () => {
      const models = [
        createModel({ id: 'a' }),
        createModel({ id: 'b' }),
        createModel({ id: 'c' }),
      ];
      manager.setModels(models);

      const status = manager.getAllHealthStatus();
      expect(status).toHaveLength(3);
      expect(status.map(s => s.modelId)).toEqual(['a', 'b', 'c']);
    });

    it('应过滤掉 enabled=false 的模型', () => {
      const models = [
        createModel({ id: 'a', enabled: true }),
        createModel({ id: 'b', enabled: false }),
      ];
      manager.setModels(models);

      const status = manager.getAllHealthStatus();
      expect(status).toHaveLength(1);
      expect(status[0].modelId).toBe('a');
    });

    it('初始状态应全部健康', () => {
      manager.setModels([createModel({ id: 'a' })]);

      const health = manager.getModelHealth('a');
      expect(health).not.toBeNull();
      expect(health?.isInCooldown).toBe(false);
      expect(health?.consecutiveFailures).toBe(0);
      expect(health?.successCount).toBe(0);
      expect(health?.failureCount).toBe(0);
    });

    it('重复调用 setModels 不应重置已有健康状态', () => {
      manager.setModels([createModel({ id: 'a' })]);
      manager.recordFailure('a', 'err', 'server');

      manager.setModels([createModel({ id: 'a' })]);
      const health = manager.getModelHealth('a');
      expect(health?.failureCount).toBe(1);
    });
  });

  describe('recordSuccess', () => {
    beforeEach(() => {
      manager.setModels([createModel({ id: 'a' })]);
    });

    it('应增加成功计数', () => {
      manager.recordSuccess('a');
      manager.recordSuccess('a');
      const health = manager.getModelHealth('a');
      expect(health?.successCount).toBe(2);
    });

    it('应重置连续失败计数', () => {
      manager.recordFailure('a', 'err', 'server');
      manager.recordFailure('a', 'err', 'server');
      expect(manager.getModelHealth('a')?.consecutiveFailures).toBe(2);

      manager.recordSuccess('a');
      expect(manager.getModelHealth('a')?.consecutiveFailures).toBe(0);
    });

    it('应清除冷却状态', () => {
      // 触发冷却
      for (let i = 0; i < 3; i++) {
        manager.recordFailure('a', 'err', 'server');
      }
      expect(manager.getModelHealth('a')?.isInCooldown).toBe(true);

      manager.recordSuccess('a');
      expect(manager.getModelHealth('a')?.isInCooldown).toBe(false);
      expect(manager.getModelHealth('a')?.cooldownRemainingMs).toBe(0);
    });

    it('应清除最后错误信息', () => {
      manager.recordFailure('a', new Error('boom'), 'server');
      expect(manager.getModelHealth('a')?.lastError).toBe('boom');

      manager.recordSuccess('a');
      expect(manager.getModelHealth('a')?.lastError).toBeUndefined();
    });
  });

  describe('recordFailure', () => {
    beforeEach(() => {
      manager.setModels([createModel({ id: 'a' })]);
    });

    it('应累加失败计数', () => {
      manager.recordFailure('a', 'err1', 'server');
      manager.recordFailure('a', 'err2', 'network');
      const health = manager.getModelHealth('a');
      expect(health?.failureCount).toBe(2);
      expect(health?.consecutiveFailures).toBe(2);
    });

    it('应记录最后错误信息', () => {
      manager.recordFailure('a', new Error('boom'), 'server');
      const health = manager.getModelHealth('a');
      expect(health?.lastError).toBe('boom');
      expect(health?.lastErrorCategory).toBe('server');
    });

    it('达到阈值应进入冷却', () => {
      manager.recordFailure('a', 'err', 'server');
      manager.recordFailure('a', 'err', 'server');
      expect(manager.getModelHealth('a')?.isInCooldown).toBe(false);

      manager.recordFailure('a', 'err', 'server');
      expect(manager.getModelHealth('a')?.isInCooldown).toBe(true);
      expect(manager.getModelHealth('a')?.cooldownRemainingMs).toBeGreaterThan(0);
    });

    it('未达阈值不应进入冷却', () => {
      manager.recordFailure('a', 'err', 'server');
      manager.recordFailure('a', 'err', 'server');
      expect(manager.getModelHealth('a')?.isInCooldown).toBe(false);
    });

    it('字符串错误应被记录', () => {
      manager.recordFailure('a', 'string error', 'network');
      const health = manager.getModelHealth('a');
      expect(health?.lastError).toBe('string error');
    });

    it('未设置 category 时默认为 unknown', () => {
      manager.recordFailure('a', 'err');
      const health = manager.getModelHealth('a');
      expect(health?.lastErrorCategory).toBe('unknown');
    });
  });

  describe('getNextModel', () => {
    beforeEach(() => {
      manager.setModels([
        createModel({ id: 'a' }),
        createModel({ id: 'b' }),
        createModel({ id: 'c' }),
      ]);
    });

    it('应返回排除当前模型的下一个可用模型', () => {
      const next = manager.getNextModel('a');
      expect(next).not.toBeNull();
      expect(next?.id).not.toBe('a');
    });

    it('当前模型为最后一个时应返回第一个', () => {
      const next = manager.getNextModel('c');
      expect(next).not.toBeNull();
      // 应回到 a 或 b（fallbackChain 为空时按 models 数组顺序）
      expect(['a', 'b']).toContain(next?.id);
    });

    it('无候选模型时返回 null', () => {
      manager.setModels([createModel({ id: 'a' })]);
      const next = manager.getNextModel('a');
      expect(next).toBeNull();
    });

    it('应跳过冷却中的模型', () => {
      // 让 b 进入冷却
      for (let i = 0; i < 3; i++) {
        manager.recordFailure('b', 'err', 'server');
      }
      expect(manager.getModelHealth('b')?.isInCooldown).toBe(true);

      // 从 a 出发，next 应跳过 b 返回 c
      const next = manager.getNextModel('a');
      expect(next?.id).toBe('c');
    });

    it('所有模型冷却中且非致命错误时应强制恢复一个模型', () => {
      // 让所有模型进入冷却
      for (const id of ['a', 'b', 'c']) {
        for (let i = 0; i < 3; i++) {
          manager.recordFailure(id, 'err', 'server');
        }
      }

      // server 错误应触发强制恢复
      const next = manager.getNextModel('a', 'server');
      expect(next).not.toBeNull();
    });

    it('所有模型冷却中且 auth 错误时不应强制恢复', () => {
      for (const id of ['a', 'b', 'c']) {
        for (let i = 0; i < 3; i++) {
          manager.recordFailure(id, 'err', 'server');
        }
      }

      // auth 错误不应强制恢复，但仍返回 candidateModels[0] 作为 fallback
      const next = manager.getNextModel('a', 'auth');
      // shouldForceRecover('auth') 为 false，返回 candidateModels[0]
      expect(next).not.toBeNull();
    });
  });

  describe('priority 策略', () => {
    beforeEach(() => {
      manager.setModels([
        createModel({ id: 'primary' }),
        createModel({ id: 'secondary' }),
        createModel({ id: 'tertiary' }),
      ]);
      manager.setFallbackChain(['primary', 'secondary', 'tertiary']);
    });

    it('应按 fallbackChain 顺序返回下一个模型', () => {
      const next = manager.getNextModel('primary');
      expect(next?.id).toBe('secondary');
    });

    it('当前模型不在链中时应从链头开始', () => {
      const next = manager.getNextModel('unknown-model');
      expect(next?.id).toBe('primary');
    });

    it('链末尾模型失败后应回绕到链头', () => {
      const next = manager.getNextModel('tertiary');
      expect(next?.id).toBe('primary');
    });

    it('应跳过冷却中的链模型', () => {
      for (let i = 0; i < 3; i++) {
        manager.recordFailure('secondary', 'err', 'server');
      }
      const next = manager.getNextModel('primary');
      expect(next?.id).toBe('tertiary');
    });
  });

  describe('capability-match 策略', () => {
    beforeEach(() => {
      manager.setPolicy('capability-match');
      manager.setModels([
        createModel({ id: 'reasoning-model', capabilities: ['reasoning', 'code'] }),
        createModel({ id: 'fast-model', capabilities: ['fast', 'costEffective'] }),
        createModel({ id: 'multi-model', capabilities: ['reasoning', 'multimodal', 'code'] }),
      ]);
    });

    it('应按能力过滤候选模型', () => {
      const next = manager.getNextModel('reasoning-model', 'server', ['multimodal'] as ModelCapability[]);
      expect(next).not.toBeNull();
      expect(next?.id).toBe('multi-model');
    });

    it('无匹配能力的模型时返回 null', () => {
      const next = manager.getNextModel('reasoning-model', 'server', ['audio'] as ModelCapability[]);
      expect(next).toBeNull();
    });

    it('多个匹配时应优先选择健康的模型', () => {
      // 让 multi-model 失败一次（未冷却）
      manager.recordFailure('multi-model', 'err', 'server');

      const next = manager.getNextModel('fast-model', 'server', ['reasoning'] as ModelCapability[]);
      // reasoning-model 0 次失败，multi-model 1 次失败
      expect(next?.id).toBe('reasoning-model');
    });

    it('未设置 requiredCapabilities 时回退到 priority 策略', () => {
      const next = manager.getNextModel('reasoning-model', 'server');
      expect(next).not.toBeNull();
      // 回退到 priority，返回 models 数组中排除当前模型的下一个
      expect(next?.id).not.toBe('reasoning-model');
    });
  });

  describe('冷却到期自动恢复', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager.setModels([createModel({ id: 'a' }), createModel({ id: 'b' })]);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('冷却到期后模型应自动恢复为健康', () => {
      // 让 a 进入冷却
      for (let i = 0; i < 3; i++) {
        manager.recordFailure('a', 'err', 'server');
      }
      expect(manager.getModelHealth('a')?.isInCooldown).toBe(true);

      // 推进时间超过冷却期
      vi.advanceTimersByTime(1001);

      // 调用 getModelHealth 会触发 refreshCooldownStates
      const health = manager.getModelHealth('a');
      expect(health?.isInCooldown).toBe(false);
      expect(health?.consecutiveFailures).toBe(0);
    });

    it('冷却未到期时模型仍处于冷却状态', () => {
      for (let i = 0; i < 3; i++) {
        manager.recordFailure('a', 'err', 'server');
      }

      vi.advanceTimersByTime(500);

      const health = manager.getModelHealth('a');
      expect(health?.isInCooldown).toBe(true);
      expect(health?.cooldownRemainingMs).toBeGreaterThan(0);
    });
  });

  describe('resetModelHealth', () => {
    beforeEach(() => {
      manager.setModels([createModel({ id: 'a' })]);
    });

    it('应重置指定模型的状态', () => {
      for (let i = 0; i < 3; i++) {
        manager.recordFailure('a', 'err', 'server');
      }
      expect(manager.getModelHealth('a')?.isInCooldown).toBe(true);

      manager.resetModelHealth('a');
      const health = manager.getModelHealth('a');
      expect(health?.isInCooldown).toBe(false);
      expect(health?.consecutiveFailures).toBe(0);
      expect(health?.lastError).toBeUndefined();
    });
  });

  describe('resetAllHealth', () => {
    it('应重置所有模型状态', () => {
      manager.setModels([createModel({ id: 'a' }), createModel({ id: 'b' })]);
      manager.recordFailure('a', 'err', 'server');
      manager.recordFailure('b', 'err', 'server');

      manager.resetAllHealth();

      expect(manager.getModelHealth('a')?.consecutiveFailures).toBe(0);
      expect(manager.getModelHealth('b')?.consecutiveFailures).toBe(0);
    });
  });

  describe('markModelForCooldown', () => {
    beforeEach(() => {
      manager.setModels([createModel({ id: 'a' })]);
    });

    it('应手动将模型标记为冷却', () => {
      manager.markModelForCooldown('a', 5000);
      const health = manager.getModelHealth('a');
      expect(health?.isInCooldown).toBe(true);
      expect(health?.cooldownRemainingMs).toBeGreaterThan(0);
      expect(health?.cooldownRemainingMs).toBeLessThanOrEqual(5000);
    });

    it('不传时长时使用默认 cooldownMs', () => {
      manager.markModelForCooldown('a');
      const health = manager.getModelHealth('a');
      expect(health?.isInCooldown).toBe(true);
      expect(health?.cooldownRemainingMs).toBeGreaterThan(0);
    });
  });

  describe('getModelById', () => {
    it('应返回对应模型配置', () => {
      manager.setModels([createModel({ id: 'a', name: 'Model A' })]);
      const model = manager.getModelById('a');
      expect(model).toBeDefined();
      expect(model?.name).toBe('Model A');
    });

    it('不存在时返回 undefined', () => {
      manager.setModels([createModel({ id: 'a' })]);
      expect(manager.getModelById('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllHealthStatus', () => {
    it('应返回所有模型的健康摘要', () => {
      manager.setModels([
        createModel({ id: 'a', name: 'A' }),
        createModel({ id: 'b', name: 'B' }),
      ]);
      manager.recordFailure('a', 'err', 'server');

      const status = manager.getAllHealthStatus();
      expect(status).toHaveLength(2);
      const aStatus = status.find(s => s.modelId === 'a');
      expect(aStatus?.modelName).toBe('A');
      expect(aStatus?.consecutiveFailures).toBe(1);
      expect(aStatus?.isHealthy).toBe(true); // 1 < 3, still healthy
    });
  });
});

// ===================== callAIModelWithFailover 测试 =====================

describe('callAIModelWithFailover', () => {
  let manager: ModelFailoverManager;

  beforeEach(() => {
    // 为每个测试创建独立的 failover manager，避免单例状态泄漏
    manager = new ModelFailoverManager({
      maxFailuresBeforeCooldown: 3,
      cooldownMs: 60_000,
      policy: 'priority',
    });
    vi.mocked(getModelFailoverManager).mockReturnValue(manager);
    global.fetch = vi.fn();
  });

  it('首个模型成功时直接返回', async () => {
    global.fetch = vi.fn().mockResolvedValue(successResponse('Hello'));

    const models = [
      createCallConfig({ id: 'model-a', apiEndpoint: 'https://api.example.com/a/v1' }),
      createCallConfig({ id: 'model-b', apiEndpoint: 'https://api.example.com/b/v1' }),
    ];

    const result = await callAIModelWithFailover(
      models,
      [{ role: 'user', content: 'hi' }],
    );

    expect(result.content).toBe('Hello');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // 应记录成功
    expect(manager.getModelHealth('model-a')?.successCount).toBe(1);
  });

  it('首个模型失败时切换到下一个', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/a/')) {
        return createErrorResponse(401, '{"error":"invalid key"}');
      }
      return successResponse('Backup response');
    });

    const models = [
      createCallConfig({ id: 'model-a', apiEndpoint: 'https://api.example.com/a/v1' }),
      createCallConfig({ id: 'model-b', apiEndpoint: 'https://api.example.com/b/v1' }),
    ];

    const result = await callAIModelWithFailover(
      models,
      [{ role: 'user', content: 'hi' }],
    );

    expect(result.content).toBe('Backup response');
    // model-a 应记录失败
    expect(manager.getModelHealth('model-a')?.failureCount).toBe(1);
    // model-b 应记录成功
    expect(manager.getModelHealth('model-b')?.successCount).toBe(1);
  });

  it('所有模型失败时抛出最后一个错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      createErrorResponse(401, '{"error":"invalid key"}'),
    );

    const models = [
      createCallConfig({ id: 'model-a', apiEndpoint: 'https://api.example.com/a/v1' }),
      createCallConfig({ id: 'model-b', apiEndpoint: 'https://api.example.com/b/v1' }),
    ];

    await expect(
      callAIModelWithFailover(models, [{ role: 'user', content: 'hi' }]),
    ).rejects.toMatchObject({ name: 'AIAPIError', category: 'auth' });
  });

  it('onModelSwitch 回调应被正确调用', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/a/')) {
        return createErrorResponse(401, '{"error":"invalid key"}');
      }
      return successResponse('OK');
    });

    const onModelSwitch = vi.fn();
    const models = [
      createCallConfig({ id: 'model-a', apiEndpoint: 'https://api.example.com/a/v1' }),
      createCallConfig({ id: 'model-b', apiEndpoint: 'https://api.example.com/b/v1' }),
    ];

    await callAIModelWithFailover(
      models,
      [{ role: 'user', content: 'hi' }],
      { onModelSwitch },
    );

    expect(onModelSwitch).toHaveBeenCalledTimes(1);
    expect(onModelSwitch).toHaveBeenCalledWith('model-a', 'model-b', 'auth');
  });

  it('首个模型成功时不调用 onModelSwitch', async () => {
    global.fetch = vi.fn().mockResolvedValue(successResponse('OK'));

    const onModelSwitch = vi.fn();
    const models = [
      createCallConfig({ id: 'model-a', apiEndpoint: 'https://api.example.com/a/v1' }),
      createCallConfig({ id: 'model-b', apiEndpoint: 'https://api.example.com/b/v1' }),
    ];

    await callAIModelWithFailover(
      models,
      [{ role: 'user', content: 'hi' }],
      { onModelSwitch },
    );

    expect(onModelSwitch).not.toHaveBeenCalled();
  });

  it('只有一个模型且失败时应直接抛出错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      createErrorResponse(401, '{"error":"invalid key"}'),
    );

    const models = [
      createCallConfig({ id: 'model-a', apiEndpoint: 'https://api.example.com/a/v1' }),
    ];

    await expect(
      callAIModelWithFailover(models, [{ role: 'user', content: 'hi' }]),
    ).rejects.toMatchObject({ name: 'AIAPIError', category: 'auth' });
  });

  it('应通过 onChunk 回调传递流式文本', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      createSSEResponse([
        'data: {"choices":[{"delta":{"content":"chunk1"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"chunk2"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const onChunk = vi.fn();
    const models = [
      createCallConfig({ id: 'model-a', apiEndpoint: 'https://api.example.com/a/v1' }),
    ];

    const result = await callAIModelWithFailover(
      models,
      [{ role: 'user', content: 'hi' }],
      { onChunk },
    );

    expect(onChunk).toHaveBeenCalledWith('chunk1');
    expect(onChunk).toHaveBeenCalledWith('chunk2');
    expect(result.content).toBe('chunk1chunk2');
  });
});
