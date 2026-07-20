/**
 * 模型故障转移子系统端到端测试
 *
 * 覆盖完整的故障转移链路：
 *   1. API 路由层：/api/models/failover/{health,decisions,reset} 全契约
 *   2. 持久化：stateFilePath 注入 → JSON 文件落盘 → 新实例加载 + stale TTL 清理
 *   3. BackoffCoordinator：双层退避决策（rotate-key / switch-model / give-up）
 *      与 ModelFailoverManager 的状态联动
 *
 * 与 server/__tests__/modelFailover.test.ts（单元测试）的边界：
 *   - 单元测试：ModelFailoverManager 内部冷却/恢复逻辑、callAIModelWithFailover 行为
 *   - 本文件：跨模块集成（路由 → manager → 持久化 → BackoffCoordinator）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ===================== Mock 依赖（与单元测试保持一致）=====================
vi.mock('../../server/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ===================== 被测模块导入 =====================
import { createTestClient } from './utils/test-client.js';
import modelsRouter from '../../server/routes/models.js';
import {
  ModelFailoverManager,
  getModelFailoverManager,
  destroyDefaultManager,
  getFailoverDecisionLog,
} from '../../server/engine/modelFailover.js';
import { BackoffCoordinator } from '../../server/engine/backoffCoordinator.js';
import { selectKey } from '../../server/keyRotator.js';
import type { ModelConfig, ModelsFile } from '../../server/modelsStore.js';
import type { FailoverHealth } from '../../src/services/modelsApi';

// ===================== 测试辅助 =====================

function createModelConfig(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'test-model',
    name: 'Test Model',
    provider: 'custom',
    apiEndpoint: 'https://api.example.com/v1',
    enabled: true,
    isDefault: false,
    contextWindow: 32_000,
    maxTokens: 4_096,
    capabilities: ['general'],
    ...overrides,
  };
}

function createModelsFile(models: ModelConfig[]): ModelsFile {
  return {
    version: 1,
    models,
    defaultModelId: models[0]?.id || 'default',
    updatedAt: new Date().toISOString(),
  };
}

/** 创建一个临时 stateFilePath（每个测试独立） */
function createTempStateFile(): string {
  return path.join(
    os.tmpdir(),
    `failover-state-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
}

/** 读取 JSON 文件并解析 */
function readJsonFile(p: string): unknown {
  const raw = fs.readFileSync(p, 'utf-8').trim();
  return JSON.parse(raw);
}

// ============================================================
// 1. API 路由层契约测试
// ============================================================

describe('Failover API E2E — 路由契约', () => {
  const client = createTestClient(modelsRouter, '/api/models');
  let manager: ModelFailoverManager;

  beforeEach(() => {
    // 重置默认单例，确保每个测试干净启动
    destroyDefaultManager();
    // 注意：getModelFailoverManager 默认注入 stateFilePath=FAILOVER_STATE_FILE，
    // 这里显式传 undefined 禁用持久化，避免测试间通过磁盘文件互相污染状态。
    manager = getModelFailoverManager({
      maxFailuresBeforeCooldown: 3,
      cooldownMs: 60_000,
      policy: 'priority',
      stateFilePath: undefined,
    });
    manager.setModels([
      createModelConfig({ id: 'model-a', name: 'Model A' }),
      createModelConfig({ id: 'model-b', name: 'Model B' }),
    ]);
  });

  describe('GET /api/models/failover/health', () => {
    it('初始状态返回空数组或仅含零计数模型', async () => {
      const res = await client.get<{ models: FailoverHealth[] }>('/failover/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('models');
      expect(Array.isArray(res.body.models)).toBe(true);
    });

    it('记录失败后返回包含失败计数和冷却状态', async () => {
      manager.recordFailure('model-a', 'auth error', 'auth');

      const res = await client.get<{ models: FailoverHealth[] }>('/failover/health');
      expect(res.status).toBe(200);
      const modelA = res.body.models.find((m) => m.modelId === 'model-a');
      expect(modelA).toBeDefined();
      expect(modelA?.consecutiveFailures).toBe(1);
      expect(modelA?.isHealthy).toBe(true); // 1 次失败未触发冷却
    });

    it('连续失败达到阈值后标记为冷却中', async () => {
      // 触发 3 次失败以进入冷却（maxFailuresBeforeCooldown=3）
      manager.recordFailure('model-a', 'auth error 1', 'auth');
      manager.recordFailure('model-a', 'auth error 2', 'auth');
      manager.recordFailure('model-a', 'auth error 3', 'auth');

      const res = await client.get<{ models: FailoverHealth[] }>('/failover/health');
      expect(res.status).toBe(200);
      const modelA = res.body.models.find((m) => m.modelId === 'model-a');
      expect(modelA?.isInCooldown).toBe(true);
      expect(modelA?.isHealthy).toBe(false);
    });
  });

  describe('GET /api/models/failover/health/:modelId', () => {
    it('未知 modelId 返回 404', async () => {
      const res = await client.get('/failover/health/nonexistent-model');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('已知 modelId 返回详细健康状态', async () => {
      manager.recordFailure('model-a', 'timeout error', 'timeout');

      const res = await client.get<{ modelId: string; consecutiveFailures: number }>(
        '/failover/health/model-a',
      );
      expect(res.status).toBe(200);
      expect(res.body.modelId).toBe('model-a');
      expect(res.body.consecutiveFailures).toBe(1);
    });
  });

  describe('GET /api/models/failover/decisions', () => {
    // 注意：decision log 是模块级全局环形缓冲，跨测试用例累积。
    // 这里只验证响应结构，不验证 count=0（取决于全局状态）。
    it('响应结构包含 decisions 数组和 count', async () => {
      const res = await client.get<{ decisions: unknown[]; count: number }>(
        '/failover/decisions',
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('decisions');
      expect(res.body).toHaveProperty('count');
      expect(Array.isArray(res.body.decisions)).toBe(true);
      expect(typeof res.body.count).toBe('number');
    });

    it('触发故障转移后返回决策日志', async () => {
      // 触发一次失败以产生决策记录
      manager.recordFailure('model-a', 'rate limited', 'rate_limit');

      const res = await client.get<{ decisions: Array<{ type: string; modelId?: string }>; count: number }>(
        '/failover/decisions',
      );
      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
      // 最新一条应该是本次 failure
      const first = res.body.decisions[0];
      expect(first.type).toBe('failure');
      expect(first.modelId).toBe('model-a');
    });

    it('支持 limit 查询参数', async () => {
      // 触发多次失败
      for (let i = 0; i < 5; i++) {
        manager.recordFailure('model-a', `error-${i}`, 'server');
      }

      const res = await client.get<{ decisions: unknown[]; count: number }>(
        '/failover/decisions?limit=2',
      );
      expect(res.status).toBe(200);
      expect(res.body.decisions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('POST /api/models/failover/reset', () => {
    it('重置所有模型健康状态', async () => {
      // 先制造失败状态
      manager.recordFailure('model-a', 'error', 'server');
      manager.recordFailure('model-b', 'error', 'server');
      expect(manager.getModelHealth('model-a')?.failureCount).toBe(1);

      const res = await client.post<{ success: boolean; message: string }>('/failover/reset');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // 重置后失败计数清零
      const healthA = manager.getModelHealth('model-a');
      expect(healthA?.consecutiveFailures).toBe(0);
    });
  });

  describe('POST /api/models/failover/reset/:modelId', () => {
    it('重置指定模型健康状态', async () => {
      manager.recordFailure('model-a', 'error', 'server');
      manager.recordFailure('model-b', 'error', 'server');

      const res = await client.post<{ success: boolean; modelId: string }>(
        '/failover/reset/model-a',
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.modelId).toBe('model-a');

      // model-a 重置，model-b 保留
      expect(manager.getModelHealth('model-a')?.consecutiveFailures).toBe(0);
      expect(manager.getModelHealth('model-b')?.consecutiveFailures).toBe(1);
    });
  });
});

// ============================================================
// 2. 持久化端到端测试
// ============================================================

describe('Failover 持久化 E2E — stateFilePath 落盘与加载', () => {
  let stateFile: string;
  let manager: ModelFailoverManager;

  beforeEach(() => {
    stateFile = createTempStateFile();
    manager = new ModelFailoverManager({
      maxFailuresBeforeCooldown: 3,
      cooldownMs: 60_000,
      policy: 'priority',
      stateFilePath: stateFile,
    });
    manager.setModels([
      createModelConfig({ id: 'persist-a', name: 'Persist A' }),
      createModelConfig({ id: 'persist-b', name: 'Persist B' }),
    ]);
  });

  afterEach(() => {
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
    }
  });

  it('saveState 写入 JSON 文件，结构包含 version/healthStates/savedAt', () => {
    manager.recordFailure('persist-a', 'first failure', 'server');
    manager.recordFailure('persist-a', 'second failure', 'server');
    // saveState 由 autoSave 触发或显式调用，这里直接调用 public 方法（通过 recordFailure 间接）
    // 由于 saveState 是 private，用 autoSave 间隔（30s）不可控，改用「销毁触发 saveState」
    manager.destroy();

    expect(fs.existsSync(stateFile)).toBe(true);
    const persisted = readJsonFile(stateFile) as {
      version: number;
      healthStates: Record<string, { consecutiveFailures: number; lastError: string }>;
      savedAt: string;
    };
    expect(persisted.version).toBe(1);
    expect(persisted.healthStates['persist-a']).toBeDefined();
    expect(persisted.healthStates['persist-a'].consecutiveFailures).toBe(2);
    expect(persisted.healthStates['persist-a'].lastError).toContain('second failure');
  });

  it('新实例 loadState 恢复 consecutiveFailures 和 cooldownUntil', () => {
    // 第一个实例：制造 3 次失败进入冷却
    manager.recordFailure('persist-a', 'fail-1', 'auth');
    manager.recordFailure('persist-a', 'fail-2', 'auth');
    manager.recordFailure('persist-a', 'fail-3', 'auth');
    expect(manager.getModelHealth('persist-a')?.isInCooldown).toBe(true);
    manager.destroy();

    // 第二个实例：从同一文件加载
    const restored = new ModelFailoverManager({
      maxFailuresBeforeCooldown: 3,
      cooldownMs: 60_000,
      policy: 'priority',
      stateFilePath: stateFile,
    });

    const health = restored.getModelHealth('persist-a');
    expect(health).toBeDefined();
    expect(health?.consecutiveFailures).toBe(3);
    expect(health?.isInCooldown).toBe(true);
  });

  it('stale TTL 清理：超过 1 小时未失败的模型 consecutiveFailures 重置为 0', () => {
    // 制造一个 2 小时前的失败记录
    manager.recordFailure('persist-a', 'old failure', 'auth');
    manager.destroy();

    // 手动篡改持久化文件，将 lastFailureAt 设置为 2 小时前
    const persisted = readJsonFile(stateFile) as {
      healthStates: Record<string, { lastFailureAt: number; consecutiveFailures: number }>;
    };
    const staleTimestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 小时前
    persisted.healthStates['persist-a'].lastFailureAt = staleTimestamp;
    fs.writeFileSync(stateFile, JSON.stringify(persisted, null, 2), 'utf-8');

    // 新实例加载时，stale 记录的 consecutiveFailures 应被重置
    const restored = new ModelFailoverManager({
      maxFailuresBeforeCooldown: 3,
      cooldownMs: 60_000,
      policy: 'priority',
      stateFilePath: stateFile,
    });

    const health = restored.getModelHealth('persist-a');
    expect(health?.consecutiveFailures).toBe(0); // stale 清理
  });

  it('未配置 stateFilePath 时不进行任何文件 IO', () => {
    const noFileManager = new ModelFailoverManager({
      maxFailuresBeforeCooldown: 3,
      cooldownMs: 60_000,
      // 不传 stateFilePath
    });
    noFileManager.recordFailure('no-persist', 'error', 'server');
    noFileManager.destroy();
    // 无文件产生（也不会报错）
    expect(fs.existsSync(stateFile)).toBe(false);
  });
});

// ============================================================
// 3. BackoffCoordinator 集成测试
// ============================================================

describe('BackoffCoordinator E2E — 双层退避决策链路', () => {
  let manager: ModelFailoverManager;
  let coordinator: BackoffCoordinator;

  beforeEach(() => {
    destroyDefaultManager();
    manager = new ModelFailoverManager({
      maxFailuresBeforeCooldown: 3,
      cooldownMs: 60_000,
      policy: 'priority',
    });
    coordinator = new BackoffCoordinator(manager);
  });

  it('rate_limit 错误：模型配置 failover 策略 + 多 Key 时决策 rotate-key', () => {
    // 使用 failover 策略：主 Key 失败后 selectKey 会跳过冷却中的 Key
    const modelConfig = createModelConfig({
      id: 'rate-limit-model',
      keyStrategy: 'failover',
      apiKeys: [
        { key: 'key-1', enabled: true },
        { key: 'key-2', enabled: true },
      ],
    });

    // 模拟 reactExecutor 的初始化流程：先调用 selectKey 初始化 keyRotator 状态
    // （reportKeyResult 不会自动创建状态，必须先有 selectKey 调用）
    selectKey(modelConfig);

    const decision = coordinator.coordinate({
      modelId: 'rate-limit-model',
      modelConfig,
      keyIndex: 0,
      error: makeRateLimitError(),
      modelsConfig: createModelsFile([modelConfig]),
    });

    expect(decision.action).toBe('rotate-key');
    expect(decision.layer).toBe('key');
    expect(decision.keyIndex).not.toBe(0); // 轮换到不同 Key
    expect(decision.apiKey).toBeDefined();
    // 失败应上报到 manager（failureCount 是 recordFailure 调用次数，稳定可靠）
    expect(manager.getModelHealth('rate-limit-model')?.failureCount).toBe(1);
  });

  it('server 错误：可恢复，决策 switch-model（跨模型层）', () => {
    const modelA = createModelConfig({ id: 'server-error-a', name: 'Server A' });
    const modelB = createModelConfig({ id: 'server-error-b', name: 'Server B' });
    manager.setModels([modelA, modelB]);

    const decision = coordinator.coordinate({
      modelId: 'server-error-a',
      modelConfig: modelA,
      keyIndex: -1, // 无 Key
      error: makeServerError(),
      modelsConfig: createModelsFile([modelA, modelB]),
    });

    expect(decision.action).toBe('switch-model');
    expect(decision.layer).toBe('model');
    expect(decision.nextModelId).toBe('server-error-b');
    expect(decision.nextModelName).toBe('Server B');
    // failureCount 反映 recordFailure 调用次数
    expect(manager.getModelHealth('server-error-a')?.failureCount).toBe(1);
    expect(manager.getModelHealth('server-error-a')?.lastErrorCategory).toBe('server');
  });

  it('model_not_supported 错误：可恢复，触发 switch-model', () => {
    const modelA = createModelConfig({ id: 'notsupported-a' });
    const modelB = createModelConfig({ id: 'notsupported-b' });
    manager.setModels([modelA, modelB]);

    const decision = coordinator.coordinate({
      modelId: 'notsupported-a',
      modelConfig: modelA,
      keyIndex: -1,
      error: makeNotSupportedError(),
      modelsConfig: createModelsFile([modelA, modelB]),
    });

    expect(decision.action).toBe('switch-model');
    expect(decision.nextModelId).toBe('notsupported-b');
    expect(manager.getModelHealth('notsupported-a')?.lastErrorCategory).toBe('model_not_supported');
  });

  it('auth 错误：不可恢复（不在 RECOVERABLE 列表），决策 give-up', () => {
    const modelA = createModelConfig({ id: 'auth-giveup-a' });
    const modelB = createModelConfig({ id: 'auth-giveup-b' });
    manager.setModels([modelA, modelB]);

    const decision = coordinator.coordinate({
      modelId: 'auth-giveup-a',
      modelConfig: modelA,
      keyIndex: -1,
      error: makeAuthError(),
      modelsConfig: createModelsFile([modelA, modelB]),
    });

    expect(decision.action).toBe('give-up');
    expect(manager.getModelHealth('auth-giveup-a')?.lastErrorCategory).toBe('auth');
  });

  it('只有 1 个模型时：可恢复错误也无法降级，决策 give-up', () => {
    const modelA = createModelConfig({ id: 'solo-model' });
    manager.setModels([modelA]);

    const decision = coordinator.coordinate({
      modelId: 'solo-model',
      modelConfig: modelA,
      keyIndex: -1,
      error: makeServerError(),
      modelsConfig: createModelsFile([modelA]),
    });

    // 无备选模型 → switchModel 内 getNextModel 返回 null → give-up
    expect(decision.action).toBe('give-up');
  });

  it('recordSuccess 重置模型健康状态', () => {
    const modelConfig = createModelConfig({ id: 'success-model' });
    manager.setModels([modelConfig]);

    // 制造 1 次失败
    coordinator.coordinate({
      modelId: 'success-model',
      modelConfig,
      keyIndex: -1,
      error: makeServerError(),
      modelsConfig: createModelsFile([modelConfig]),
    });
    expect(manager.getModelHealth('success-model')?.failureCount).toBe(1);

    // 成功调用 → consecutiveFailures 重置为 0
    coordinator.recordSuccess('success-model');
    expect(manager.getModelHealth('success-model')?.consecutiveFailures).toBe(0);
    expect(manager.getModelHealth('success-model')?.isInCooldown).toBe(false);
  });

  it('决策日志被正确记录到全局环形缓冲', () => {
    const modelConfig = createModelConfig({ id: 'logged-model' });
    manager.setModels([modelConfig]);

    coordinator.coordinate({
      modelId: 'logged-model',
      modelConfig,
      keyIndex: -1,
      error: makeServerError(),
      modelsConfig: createModelsFile([modelConfig]),
    });

    const log = getFailoverDecisionLog(50);
    // 至少有 1 条 failure 类型的日志（可能也有 switch/no_candidate）
    const failureLog = log.find((e) => e.type === 'failure' && e.modelId === 'logged-model');
    expect(failureLog).toBeDefined();
  });
});

// ===================== 错误对象工厂 =====================

function makeRateLimitError(): unknown {
  return {
    name: 'AIAPIError',
    message: 'Rate limit exceeded',
    category: 'rate_limit',
    statusCode: 429,
  };
}

function makeServerError(): unknown {
  return {
    name: 'AIAPIError',
    message: 'Internal server error',
    category: 'server',
    statusCode: 500,
  };
}

function makeAuthError(): unknown {
  return {
    name: 'AIAPIError',
    message: 'Invalid API key',
    category: 'auth',
    statusCode: 401,
  };
}

function makeNotSupportedError(): unknown {
  return {
    name: 'AIAPIError',
    message: 'Model not supported',
    category: 'model_not_supported',
    statusCode: 404,
  };
}
