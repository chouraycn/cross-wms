import { describe, it, expect, beforeEach } from 'vitest';
import { ContextEngineRegistry, OWNER_CORE, OWNER_PUBLIC_SDK, getPluginOwner } from '../registry.js';
import type {
  ContextEngine,
  ContextEngineConfig,
  ContextEngineInfo,
  AgentMessage,
  BootstrapResult,
  IngestResult,
  IngestBatchResult,
  AssembleResult,
  CompactResult,
  ContextEngineMaintenanceResult,
  MemorySearchResult,
  ContextEngineStats,
  ContextEngineSessionState,
  ContextEngineFactoryContext,
} from '../types.js';

class MockEngine implements ContextEngine {
  readonly info: ContextEngineInfo;
  readonly config: ContextEngineConfig;
  sessionId: string = '';
  messages: AgentMessage[] = [];
  bootstrapCalls = 0;
  ingestCalls = 0;
  ingestBatchCalls = 0;
  assembleCalls = 0;
  afterTurnCalls = 0;
  compactCalls = 0;
  maintainCalls = 0;
  searchMemoryCalls = 0;
  disposeCalls = 0;
  shouldFail = false;
  factoryContext?: ContextEngineFactoryContext;

  constructor(config: ContextEngineConfig, factoryContext?: ContextEngineFactoryContext) {
    this.config = config;
    this.factoryContext = factoryContext;
    this.info = {
      id: config.engineId,
      name: config.displayName,
      version: config.version,
      description: config.description,
      ownsCompaction: config.ownsCompaction,
      turnMaintenanceMode: config.turnMaintenanceMode,
      defaultMemorySync: config.defaultMemorySync,
    };
  }

  async bootstrap(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
    initialMessages?: AgentMessage[];
  }): Promise<BootstrapResult> {
    if (this.shouldFail) throw new Error('bootstrap failed');
    this.sessionId = params.sessionId;
    this.bootstrapCalls++;
    if (params.initialMessages) {
      this.messages.push(...params.initialMessages);
    }
    return { bootstrapped: true, importedMessages: params.initialMessages?.length ?? 0 };
  }

  async maintain(_params: {
    sessionId: string;
  }): Promise<ContextEngineMaintenanceResult> {
    if (this.shouldFail) throw new Error('maintain failed');
    this.maintainCalls++;
    return { changed: false, bytesFreed: 0, rewrittenEntries: 0 };
  }

  async ingest(params: {
    sessionId: string;
    message: AgentMessage;
  }): Promise<IngestResult> {
    if (this.shouldFail) throw new Error('ingest failed');
    this.messages.push(params.message);
    this.ingestCalls++;
    return { ingested: true, added: 1, skipped: 0, tokensAdded: 0 };
  }

  async ingestBatch(params: {
    sessionId: string;
    messages: AgentMessage[];
  }): Promise<IngestBatchResult> {
    if (this.shouldFail) throw new Error('ingestBatch failed');
    this.messages.push(...params.messages);
    this.ingestBatchCalls++;
    return { ingestedCount: params.messages.length, added: params.messages.length, skipped: 0, tokensAdded: 0 };
  }

  async afterTurn(_params: {
    sessionId: string;
    messages: AgentMessage[];
    prePromptMessageCount: number;
  }): Promise<void> {
    if (this.shouldFail) throw new Error('afterTurn failed');
    this.afterTurnCalls++;
  }

  async assemble(_params: {
    sessionId: string;
    messages: AgentMessage[];
    tokenBudget?: number;
  }): Promise<AssembleResult> {
    if (this.shouldFail) throw new Error('assemble failed');
    this.assembleCalls++;
    return { messages: this.messages, estimatedTokens: 0, compactedCount: 0 };
  }

  async compact(_params: {
    sessionId: string;
    tokenBudget?: number;
    force?: boolean;
  }): Promise<CompactResult> {
    if (this.shouldFail) throw new Error('compact failed');
    this.compactCalls++;
    return { ok: true, compacted: false, didCompact: false, messagesRemoved: 0, tokensSaved: 0 };
  }

  async searchMemory(_params: {
    sessionId: string;
    query: string;
    topK?: number;
  }): Promise<MemorySearchResult[]> {
    if (this.shouldFail) throw new Error('searchMemory failed');
    this.searchMemoryCalls++;
    return [];
  }

  async getStats(): Promise<ContextEngineStats> {
    return {
      totalMessages: this.messages.length,
      totalTokens: 0,
      systemMessages: 0,
      compactedCount: 0,
      memoryItems: 0,
    };
  }

  getSessionState(): ContextEngineSessionState | null {
    return this.sessionId
      ? {
          sessionId: this.sessionId,
          agentId: 'test',
          createdAt: Date.now(),
          lastModified: Date.now(),
          messageCount: this.messages.length,
          tokenCount: 0,
        }
      : null;
  }

  async dispose(): Promise<void> {
    this.disposeCalls++;
    this.sessionId = '';
    this.messages = [];
  }
}

describe('ContextEngineRegistry', () => {
  let registry: ContextEngineRegistry;

  const testConfig: ContextEngineConfig = {
    engineId: 'test-engine',
    displayName: 'Test Engine',
    version: '1.0.0',
    description: 'Test engine for unit tests',
  };

  beforeEach(() => {
    registry = new ContextEngineRegistry();
  });

  describe('基础注册功能', () => {
    it('应该能注册一个引擎', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      expect(registry.has('test-engine')).toBe(true);
      expect(registry.listEngines()).toHaveLength(1);
      expect(registry.listEngines()[0].engineId).toBe('test-engine');
    });

    it('应该能设置默认引擎', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig, { isDefault: true });
      expect(registry.getDefaultEngineId()).toBe('test-engine');
    });

    it('第一个注册的引擎自动成为默认', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      expect(registry.getDefaultEngineId()).toBe('test-engine');
    });

    it('应该能注销引擎', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      expect(registry.has('test-engine')).toBe(true);

      const result = registry.unregister('test-engine');
      expect(result).toBe(true);
      expect(registry.has('test-engine')).toBe(false);
    });

    it('注销不存在的引擎返回 false', () => {
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });

    it('应该能获取引擎配置', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      const config = registry.getConfig('test-engine');
      expect(config).not.toBeNull();
      expect(config?.engineId).toBe('test-engine');
      expect(config?.displayName).toBe('Test Engine');
    });

    it('获取不存在引擎的配置返回 null', () => {
      const config = registry.getConfig('nonexistent');
      expect(config).toBeNull();
    });

    it('应该能创建引擎实例', async () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig, { isDefault: true });

      const engine = await registry.createEngine('session-1', { engineId: 'test-engine' });
      expect(engine).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect((engine as MockEngine).getSessionState?.() ?? null).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await (engine as MockEngine).bootstrap({ sessionId: 'session-1' });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect((engine as MockEngine).getSessionState?.()?.sessionId ?? null).toBe('session-1');
    });

    it('没有指定引擎时使用默认引擎', async () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'default-engine' }, ctx);
      registry.register('default-engine', factory, { ...testConfig, engineId: 'default-engine' }, { isDefault: true });

      const engine = await registry.createEngine('session-1');
      expect(engine.config.engineId).toBe('default-engine');
    });

    it('没有注册引擎时创建应该抛错', async () => {
      await expect(registry.createEngine('session-1')).rejects.toThrow('没有可用的上下文引擎');
    });

    it('注册不存在的引擎应该抛错', () => {
      expect(() => registry.setDefault('nonexistent')).toThrow('上下文引擎 nonexistent 未注册');
    });
  });

  describe('生命周期钩子', () => {
    it('应该能添加和触发生命周期钩子', async () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig, { isDefault: true });

      let hookCalled = false;
      let hookEngineId = '';

      registry.addLifecycleHook({
        phase: 'bootstrap',
        handler: (engine) => {
          hookCalled = true;
          hookEngineId = engine.config.engineId;
        },
      });

      const engine = await registry.createEngine('session-1');
      if (!engine) throw new Error('engine should exist');
      await (engine as MockEngine).bootstrap({ sessionId: 'session-1' });
      await registry.triggerLifecycle('bootstrap', engine!);

      expect(hookCalled).toBe(true);
      expect(hookEngineId).toBe('test-engine');
    });

    it('钩子执行失败不影响其他钩子', async () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig, { isDefault: true });

      let secondHookCalled = false;

      registry.addLifecycleHook({
        phase: 'ingest',
        handler: () => {
          throw new Error('first hook failed');
        },
        priority: 10,
      });

      registry.addLifecycleHook({
        phase: 'ingest',
        handler: () => {
          secondHookCalled = true;
        },
        priority: 1,
      });

      const engine = await registry.createEngine('session-1');
      await registry.triggerLifecycle('ingest', engine);

      expect(secondHookCalled).toBe(true);
    });

    it('没有钩子时不报错', async () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig, { isDefault: true });

      const engine = await registry.createEngine('session-1');
      await expect(registry.triggerLifecycle('bootstrap', engine)).resolves.not.toThrow();
    });
  });

  describe('健康状态管理', () => {
    it('新注册的引擎应该是 healthy 状态', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);

      const health = registry.getHealth('test-engine');
      expect(health).not.toBeNull();
      expect(health?.status).toBe('healthy');
      expect(health?.failureCount).toBe(0);
      expect(health?.consecutiveSuccesses).toBe(0);
    });

    it('记录失败应该增加失败计数', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);

      registry.recordFailure('test-engine', 'test error');
      const health = registry.getHealth('test-engine');
      expect(health?.failureCount).toBe(1);
      expect(health?.status).toBe('degraded');
      expect(health?.lastFailureReason).toBe('test error');
    });

    it('连续失败应该进入隔离状态', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      registry.setQuarantineConfig({ threshold: 3 });

      registry.recordFailure('test-engine', 'error 1');
      registry.recordFailure('test-engine', 'error 2');
      expect(registry.getHealth('test-engine')?.status).toBe('degraded');

      registry.recordFailure('test-engine', 'error 3');
      expect(registry.getHealth('test-engine')?.status).toBe('quarantined');
      expect(registry.getHealth('test-engine')?.quarantinedUntil).toBeDefined();
    });

    it('记录成功应该增加连续成功计数', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);

      registry.recordSuccess('test-engine');
      registry.recordSuccess('test-engine');

      const health = registry.getHealth('test-engine');
      expect(health?.consecutiveSuccesses).toBe(2);
    });

    it('连续成功应该从 degraded 恢复到 healthy', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      registry.setQuarantineConfig({ recoverySuccessThreshold: 2 });

      registry.recordFailure('test-engine');
      expect(registry.getHealth('test-engine')?.status).toBe('degraded');

      registry.recordSuccess('test-engine');
      expect(registry.getHealth('test-engine')?.status).toBe('degraded');

      registry.recordSuccess('test-engine');
      expect(registry.getHealth('test-engine')?.status).toBe('healthy');
      expect(registry.getHealth('test-engine')?.failureCount).toBe(0);
    });

    it('失败后应该重置连续成功计数', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);

      registry.recordSuccess('test-engine');
      registry.recordSuccess('test-engine');
      expect(registry.getHealth('test-engine')?.consecutiveSuccesses).toBe(2);

      registry.recordFailure('test-engine');
      expect(registry.getHealth('test-engine')?.consecutiveSuccesses).toBe(0);
    });

    it('应该能重置健康状态', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);

      registry.recordFailure('test-engine');
      registry.recordFailure('test-engine');
      expect(registry.getHealth('test-engine')?.status).toBe('degraded');

      const result = registry.resetHealth('test-engine');
      expect(result).toBe(true);
      expect(registry.getHealth('test-engine')?.status).toBe('healthy');
      expect(registry.getHealth('test-engine')?.failureCount).toBe(0);
    });

    it('重置不存在的引擎返回 false', () => {
      const result = registry.resetHealth('nonexistent');
      expect(result).toBe(false);
    });

    it('listEnginesWithHealth 应该返回所有引擎及其健康状态', () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'engine-1' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'engine-2' }, ctx);
      registry.register('engine-1', factory1, { ...testConfig, engineId: 'engine-1' });
      registry.register('engine-2', factory2, { ...testConfig, engineId: 'engine-2' });

      registry.recordFailure('engine-1');

      const list = registry.listEnginesWithHealth();
      expect(list).toHaveLength(2);
      expect(list.find(e => e.config.engineId === 'engine-1')?.health.status).toBe('degraded');
      expect(list.find(e => e.config.engineId === 'engine-2')?.health.status).toBe('healthy');
    });
  });

  describe('故障隔离与自动降级', () => {
    it('创建隔离状态的引擎应该自动 fallback 到健康引擎', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'bad-engine' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'good-engine' }, ctx);

      registry.register('bad-engine', factory1, { ...testConfig, engineId: 'bad-engine' });
      registry.register('good-engine', factory2, { ...testConfig, engineId: 'good-engine' }, { isDefault: true });
      registry.setQuarantineConfig({ threshold: 2 });

      registry.recordFailure('bad-engine');
      registry.recordFailure('bad-engine');
      expect(registry.getHealth('bad-engine')?.status).toBe('quarantined');

      const engine = await registry.createEngine('session-1', { engineId: 'bad-engine' });
      expect(engine.config.engineId).toBe('good-engine');
    });

    it('所有引擎都隔离时，使用指定引擎（强制）', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'engine-1' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'engine-2' }, ctx);

      registry.register('engine-1', factory1, { ...testConfig, engineId: 'engine-1' });
      registry.register('engine-2', factory2, { ...testConfig, engineId: 'engine-2' }, { isDefault: true });
      registry.setQuarantineConfig({ threshold: 2 });

      registry.recordFailure('engine-1');
      registry.recordFailure('engine-1');
      registry.recordFailure('engine-2');
      registry.recordFailure('engine-2');

      expect(registry.getHealth('engine-1')?.status).toBe('quarantined');
      expect(registry.getHealth('engine-2')?.status).toBe('quarantined');

      const engine = await registry.createEngine('session-1', { engineId: 'engine-1' });
      expect(engine.config.engineId).toBe('engine-1');
    });

    it('隔离期结束后应该降级为 degraded', async () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      registry.setQuarantineConfig({ threshold: 2, durationMs: 100 });

      registry.recordFailure('test-engine');
      registry.recordFailure('test-engine');
      expect(registry.getHealth('test-engine')?.status).toBe('quarantined');

      const health = registry.getHealth('test-engine');
      if (health?.quarantinedUntil) {
        health.quarantinedUntil = Date.now() - 1;
      }

      const engine = await registry.createEngine('session-1', { engineId: 'test-engine' });
      expect(engine.config.engineId).toBe('test-engine');
      expect(registry.getHealth('test-engine')?.status).toBe('degraded');
    });
  });

  describe('隔离配置', () => {
    it('应该能设置隔离阈值', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      registry.setQuarantineConfig({ threshold: 10 });

      for (let i = 0; i < 9; i++) {
        registry.recordFailure('test-engine');
      }
      expect(registry.getHealth('test-engine')?.status).toBe('degraded');

      registry.recordFailure('test-engine');
      expect(registry.getHealth('test-engine')?.status).toBe('quarantined');
    });

    it('应该能设置恢复成功阈值', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      registry.setQuarantineConfig({ recoverySuccessThreshold: 5 });

      registry.recordFailure('test-engine');
      expect(registry.getHealth('test-engine')?.status).toBe('degraded');

      for (let i = 0; i < 4; i++) {
        registry.recordSuccess('test-engine');
      }
      expect(registry.getHealth('test-engine')?.status).toBe('degraded');

      registry.recordSuccess('test-engine');
      expect(registry.getHealth('test-engine')?.status).toBe('healthy');
    });
  });

  describe('清空注册表', () => {
    it('应该能清空所有注册', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      expect(registry.listEngines()).toHaveLength(1);

      registry.clear();
      expect(registry.listEngines()).toHaveLength(0);
      expect(registry.getDefaultEngineId()).toBeNull();
    });
  });

  describe('Owner 机制', () => {
    it('新注册的引擎默认 owner 为 core', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig);
      expect(registry.getOwner('test-engine')).toBe(OWNER_CORE);
    });

    it('应该能注册指定 owner 的引擎', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'sdk-engine' }, ctx);
      registry.register('sdk-engine', factory, testConfig, { owner: OWNER_PUBLIC_SDK });
      expect(registry.getOwner('sdk-engine')).toBe(OWNER_PUBLIC_SDK);
    });

    it('应该能按 owner 列出引擎', () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'core-engine' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'sdk-engine' }, ctx);
      registry.register('core-engine', factory1, { ...testConfig, engineId: 'core-engine' }, { owner: OWNER_CORE });
      registry.register('sdk-engine', factory2, { ...testConfig, engineId: 'sdk-engine' }, { owner: OWNER_PUBLIC_SDK });

      const coreEngines = registry.listEnginesByOwner(OWNER_CORE);
      const sdkEngines = registry.listEnginesByOwner(OWNER_PUBLIC_SDK);

      expect(coreEngines).toHaveLength(1);
      expect(coreEngines[0].engineId).toBe('core-engine');
      expect(sdkEngines).toHaveLength(1);
      expect(sdkEngines[0].engineId).toBe('sdk-engine');
    });

    it('不同 owner 不能互相覆盖注册', () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'shared-engine' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'shared-engine' }, ctx);

      registry.register('shared-engine', factory1, testConfig, { owner: OWNER_CORE });
      registry.register('shared-engine', factory2, testConfig, { owner: OWNER_PUBLIC_SDK });

      expect(registry.getOwner('shared-engine')).toBe(OWNER_CORE);
    });

    it('不同 owner 不能互相注销', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'core-engine' }, ctx);
      registry.register('core-engine', factory, testConfig, { owner: OWNER_CORE });

      const result = registry.unregister('core-engine', OWNER_PUBLIC_SDK);
      expect(result).toBe(false);
      expect(registry.has('core-engine')).toBe(true);
    });

    it('相同 owner 可以注销', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'core-engine' }, ctx);
      registry.register('core-engine', factory, testConfig, { owner: OWNER_CORE });

      const result = registry.unregister('core-engine', OWNER_CORE);
      expect(result).toBe(true);
      expect(registry.has('core-engine')).toBe(false);
    });

    it('不同 owner 不能互相设置默认引擎', () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'engine-1' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'engine-2' }, ctx);

      registry.register('engine-1', factory1, { ...testConfig, engineId: 'engine-1' }, { owner: OWNER_CORE, isDefault: true });
      registry.register('engine-2', factory2, { ...testConfig, engineId: 'engine-2' }, { owner: OWNER_PUBLIC_SDK });

      expect(() => registry.setDefault('engine-2', OWNER_CORE)).toThrow();
      expect(registry.getDefaultEngineId()).toBe('engine-1');
    });

    it('插件 owner 应该通过 pluginName 验证', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'plugin-engine' }, ctx);
      const pluginOwner = getPluginOwner('my-plugin');
      registry.register('plugin-engine', factory, testConfig, { owner: pluginOwner, pluginName: 'my-plugin' });
      expect(registry.getOwner('plugin-engine')).toBe(pluginOwner);
    });

    it('非法 owner 应该被拒绝注册', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'bad-owner-engine' }, ctx);
      registry.register('bad-owner-engine', factory, testConfig, { owner: 'invalid-owner' });
      expect(registry.has('bad-owner-engine')).toBe(false);
    });

    it('listEnginesWithHealth 应该包含 owner 信息', () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'test-engine' }, ctx);
      registry.register('test-engine', factory, testConfig, { owner: OWNER_PUBLIC_SDK });

      const list = registry.listEnginesWithHealth();
      expect(list).toHaveLength(1);
      expect(list[0].owner).toBe(OWNER_PUBLIC_SDK);
    });
  });

  describe('插件槽位配置', () => {
    it('默认槽位配置为 null', () => {
      expect(registry.getSlotConfig()).toBeNull();
    });

    it('应该能设置和获取槽位配置', () => {
      registry.setSlotConfig('slot-engine');
      expect(registry.getSlotConfig()).toBe('slot-engine');
    });

    it('设置槽位为 null 应该清除配置', () => {
      registry.setSlotConfig('slot-engine');
      expect(registry.getSlotConfig()).toBe('slot-engine');
      registry.setSlotConfig(null);
      expect(registry.getSlotConfig()).toBeNull();
    });

    it('有槽位配置时应该优先使用槽位引擎', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'default-engine' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'slot-engine' }, ctx);

      registry.register('default-engine', factory1, { ...testConfig, engineId: 'default-engine' }, { isDefault: true });
      registry.register('slot-engine', factory2, { ...testConfig, engineId: 'slot-engine' });

      registry.setSlotConfig('slot-engine');

      const engine = await registry.createEngine('session-1');
      expect(engine.config.engineId).toBe('slot-engine');
    });

    it('指定 engineId 时应该优先使用指定引擎', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'default-engine' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'slot-engine' }, ctx);
      const factory3 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'custom-engine' }, ctx);

      registry.register('default-engine', factory1, { ...testConfig, engineId: 'default-engine' }, { isDefault: true });
      registry.register('slot-engine', factory2, { ...testConfig, engineId: 'slot-engine' });
      registry.register('custom-engine', factory3, { ...testConfig, engineId: 'custom-engine' });

      registry.setSlotConfig('slot-engine');

      const engine = await registry.createEngine('session-1', { engineId: 'custom-engine' });
      expect(engine.config.engineId).toBe('custom-engine');
    });

    it('槽位引擎不存在时应该回退到默认引擎', async () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'default-engine' }, ctx);
      registry.register('default-engine', factory, { ...testConfig, engineId: 'default-engine' }, { isDefault: true });

      registry.setSlotConfig('nonexistent-slot');

      const engine = await registry.createEngine('session-1');
      expect(engine.config.engineId).toBe('default-engine');
    });

    it('清空注册表应该清除槽位配置', () => {
      registry.setSlotConfig('slot-engine');
      expect(registry.getSlotConfig()).toBe('slot-engine');
      registry.clear();
      expect(registry.getSlotConfig()).toBeNull();
    });
  });

  describe('运行时代理自动降级', () => {
    it('fallback 引擎应该包装有运行时代理', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'bad-engine' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'good-engine' }, ctx);

      registry.register('bad-engine', factory1, { ...testConfig, engineId: 'bad-engine' });
      registry.register('good-engine', factory2, { ...testConfig, engineId: 'good-engine' }, { isDefault: true });
      registry.setQuarantineConfig({ threshold: 2 });

      registry.recordFailure('bad-engine');
      registry.recordFailure('bad-engine');

      const engine = await registry.createEngine('session-1', { engineId: 'bad-engine' });
      expect(engine.config.engineId).toBe('good-engine');
    });

    it('运行时代理成功调用应该记录成功', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'bad-engine' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'good-engine' }, ctx);

      registry.register('bad-engine', factory1, { ...testConfig, engineId: 'bad-engine' });
      registry.register('good-engine', factory2, { ...testConfig, engineId: 'good-engine' }, { isDefault: true });
      registry.setQuarantineConfig({ threshold: 2, recoverySuccessThreshold: 1 });

      registry.recordFailure('bad-engine');
      registry.recordFailure('bad-engine');
      expect(registry.getHealth('bad-engine')?.status).toBe('quarantined');

      const engine = await registry.createEngine('session-1', { engineId: 'bad-engine' });
      expect(engine.config.engineId).toBe('good-engine');

      await engine.ingest({ sessionId: 'session-1', message: { role: 'user', content: 'hello' } });

      expect(registry.getHealth('good-engine')?.consecutiveSuccesses).toBe(1);
    });

    it('运行时代理失败调用应该记录失败', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'bad-engine' }, ctx);
      const mockEngine = new MockEngine({ ...testConfig, engineId: 'fallible-engine' });
      const factory2 = (ctx: ContextEngineFactoryContext) => {
        mockEngine.factoryContext = ctx;
        return mockEngine;
      };

      registry.register('bad-engine', factory1, { ...testConfig, engineId: 'bad-engine' });
      registry.register('fallible-engine', factory2, { ...testConfig, engineId: 'fallible-engine' }, { isDefault: true });
      registry.setQuarantineConfig({ threshold: 2 });

      registry.recordFailure('bad-engine');
      registry.recordFailure('bad-engine');

      const engine = await registry.createEngine('session-1', { engineId: 'bad-engine' });
      expect(engine.config.engineId).toBe('fallible-engine');

      mockEngine.shouldFail = true;
      await expect(engine.ingest({ sessionId: 'session-1', message: { role: 'user', content: 'hello' } })).rejects.toThrow();

      expect(registry.getHealth('fallible-engine')?.failureCount).toBeGreaterThanOrEqual(1);
    });

    it('禁用 withRuntimeQuarantine 时不包装代理', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'bad-engine' }, ctx);
      const factory2 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'good-engine' }, ctx);

      registry.register('bad-engine', factory1, { ...testConfig, engineId: 'bad-engine' });
      registry.register('good-engine', factory2, { ...testConfig, engineId: 'good-engine' }, { isDefault: true });
      registry.setQuarantineConfig({ threshold: 2 });

      registry.recordFailure('bad-engine');
      registry.recordFailure('bad-engine');

      const engine = await registry.createEngine('session-1', {
        engineId: 'bad-engine',
        withRuntimeQuarantine: false,
      });
      expect(engine.config.engineId).toBe('bad-engine');
    });

    it('运行时代理应该代理 ingest、assemble、compact 方法', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'bad-engine' }, ctx);
      const mockEngine = new MockEngine({ ...testConfig, engineId: 'good-engine' });
      const factory2 = (ctx: ContextEngineFactoryContext) => {
        mockEngine.factoryContext = ctx;
        return mockEngine;
      };

      registry.register('bad-engine', factory1, { ...testConfig, engineId: 'bad-engine' });
      registry.register('good-engine', factory2, { ...testConfig, engineId: 'good-engine' }, { isDefault: true });
      registry.setQuarantineConfig({ threshold: 2 });

      registry.recordFailure('bad-engine');
      registry.recordFailure('bad-engine');

      const engine = await registry.createEngine('session-1', { engineId: 'bad-engine' });

      await engine.ingest({ sessionId: 'session-1', message: { role: 'user', content: 'hello' } });
      expect(mockEngine.ingestCalls).toBe(1);

      await engine.assemble({ sessionId: 'session-1', messages: [] });
      expect(mockEngine.assembleCalls).toBe(1);

      await engine.compact({ sessionId: 'session-1' });
      expect(mockEngine.compactCalls).toBe(1);

      expect(registry.getHealth('good-engine')?.consecutiveSuccesses).toBe(3);
    });

    it('AbortError 不应该被记录为失败', async () => {
      const factory1 = (ctx: ContextEngineFactoryContext) => new MockEngine({ ...testConfig, engineId: 'bad-engine' }, ctx);
      const mockEngine = new MockEngine({ ...testConfig, engineId: 'good-engine' });
      const factory2 = (ctx: ContextEngineFactoryContext) => {
        mockEngine.factoryContext = ctx;
        return mockEngine;
      };

      registry.register('bad-engine', factory1, { ...testConfig, engineId: 'bad-engine' });
      registry.register('good-engine', factory2, { ...testConfig, engineId: 'good-engine' }, { isDefault: true });
      registry.setQuarantineConfig({ threshold: 2 });

      registry.recordFailure('bad-engine');
      registry.recordFailure('bad-engine');

      const engine = await registry.createEngine('session-1', { engineId: 'bad-engine' });

      const originalIngest = mockEngine.ingest.bind(mockEngine);
      mockEngine.ingest = async () => {
        const abortError = new DOMException('Aborted', 'AbortError');
        throw abortError;
      };

      await expect(engine.ingest({ sessionId: 'session-1', message: { role: 'user', content: 'hello' } })).rejects.toThrow(DOMException);

      const health = registry.getHealth('good-engine');
      expect(health?.consecutiveSuccesses).toBe(0);
      expect(health?.failureCount).toBe(0);

      mockEngine.ingest = originalIngest;
    });
  });

  describe('工厂上下文', () => {
    it('工厂函数应该接收 factoryContext', async () => {
      let receivedCtx: ContextEngineFactoryContext | undefined;
      const factory = (ctx: ContextEngineFactoryContext) => {
        receivedCtx = ctx;
        return new MockEngine(testConfig, ctx);
      };

      registry.register('test-engine', factory, testConfig, { isDefault: true });

      const customContext = {
        config: { custom: 'value' },
        agentDir: '/path/to/agent',
        workspaceDir: '/path/to/workspace',
      };

      await registry.createEngine('session-1', {
        engineId: 'test-engine',
        factoryContext: customContext,
      });

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx?.sessionId).toBe('session-1');
      expect(receivedCtx?.config).toEqual(customContext.config);
      expect(receivedCtx?.agentDir).toBe(customContext.agentDir);
      expect(receivedCtx?.workspaceDir).toBe(customContext.workspaceDir);
    });

    it('sessionId 应该覆盖 factoryContext 中的 sessionId', async () => {
      let receivedCtx: ContextEngineFactoryContext | undefined;
      const factory = (ctx: ContextEngineFactoryContext) => {
        receivedCtx = ctx;
        return new MockEngine(testConfig, ctx);
      };

      registry.register('test-engine', factory, testConfig, { isDefault: true });

      await registry.createEngine('session-1', {
        engineId: 'test-engine',
        factoryContext: { sessionId: 'different-session' },
      });

      expect(receivedCtx?.sessionId).toBe('session-1');
    });

    it('空 factoryContext 应该只包含 sessionId', async () => {
      let receivedCtx: ContextEngineFactoryContext | undefined;
      const factory = (ctx: ContextEngineFactoryContext) => {
        receivedCtx = ctx;
        return new MockEngine(testConfig, ctx);
      };

      registry.register('test-engine', factory, testConfig, { isDefault: true });

      await registry.createEngine('session-1');

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx?.sessionId).toBe('session-1');
      expect(receivedCtx?.config).toBeUndefined();
      expect(receivedCtx?.agentDir).toBeUndefined();
      expect(receivedCtx?.workspaceDir).toBeUndefined();
    });

    it('引擎实例应该保存 factoryContext', async () => {
      const factory = (ctx: ContextEngineFactoryContext) => new MockEngine(testConfig, ctx);
      registry.register('test-engine', factory, testConfig, { isDefault: true });

      const customContext = {
        config: { foo: 'bar' },
        agentDir: '/agent',
      };

      const engine = await registry.createEngine('session-1', {
        factoryContext: customContext,
      });

      const mockEngine = engine as MockEngine;
      expect(mockEngine.factoryContext).toBeDefined();
      expect(mockEngine.factoryContext?.sessionId).toBe('session-1');
      expect(mockEngine.factoryContext?.config).toEqual(customContext.config);
      expect(mockEngine.factoryContext?.agentDir).toBe(customContext.agentDir);
    });
  });
});
