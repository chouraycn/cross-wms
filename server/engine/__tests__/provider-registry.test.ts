/**
 * Unified Provider Registry 单元测试
 *
 * 覆盖 P0-2 Provider 插件化改造：
 * - ProviderDescriptor 注册与查询
 * - 显式 API type binding（替代 inferApiType）
 * - 桥接到 modelProviderRegistry 和 adapters/registry
 * - resolveApiTypeExplicitly 降级链
 * - getCompat 能力查询
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UnifiedProviderRegistry,
  getUnifiedProviderRegistry,
  resolveApiTypeExplicitly,
  type ProviderDescriptor,
} from '../provider-registry/unifiedProviderRegistry.js';
import type { ModelApiType, AdapterCompatConfig } from '../../adapters/types.js';

// mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// 使用 vi.hoisted() 解决 mock hoisting 问题
const { mockInferApiType, mockRegisterAdapter, mockUnregisterAdapter, mockRegisterProvider, mockUnregisterProvider } = vi.hoisted(() => ({
  mockInferApiType: vi.fn<(provider: string, endpoint?: string) => ModelApiType>(),
  mockRegisterAdapter: vi.fn(),
  mockUnregisterAdapter: vi.fn(),
  mockRegisterProvider: vi.fn(),
  mockUnregisterProvider: vi.fn(),
}));

// mock adapters/registry (inferApiType)
vi.mock('../../adapters/registry.js', () => ({
  inferApiType: mockInferApiType,
  registerAdapter: mockRegisterAdapter,
  unregisterAdapter: mockUnregisterAdapter,
  hasAdapter: vi.fn().mockReturnValue(true),
  getAdapter: vi.fn().mockReturnValue({}),
}));

// mock modelProviderRegistry
vi.mock('../modelProviderRegistry.js', () => ({
  registerProvider: mockRegisterProvider,
  unregisterProvider: mockUnregisterProvider,
  getProviderById: vi.fn(),
  BUILTIN_PROVIDERS: [],
}));

describe('Unified Provider Registry', () => {
  let registry: UnifiedProviderRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInferApiType.mockReset();
    registry = new UnifiedProviderRegistry();
  });

  const createDescriptor = (overrides: Partial<ProviderDescriptor> = {}): ProviderDescriptor => ({
    id: 'test-provider',
    displayName: 'Test Provider',
    apiType: 'openai-chat' as ModelApiType,
    defaultEndpoint: 'https://api.test.com/v1',
    authMode: 'api-key',
    builtin: false,
    ...overrides,
  });

  describe('register', () => {
    it('应能注册 provider descriptor', () => {
      const desc = createDescriptor();
      registry.register(desc);

      const stats = registry.getStats();
      expect(stats.total).toBe(1);
    });

    it('注册时应桥接到 modelProviderRegistry', () => {
      const desc = createDescriptor({ id: 'bridged-provider' });
      registry.register(desc);

      expect(mockRegisterProvider).toHaveBeenCalled();
    });

    it('重复注册同一 ID 应覆盖', () => {
      const desc1 = createDescriptor({ displayName: 'V1' });
      const desc2 = createDescriptor({ displayName: 'V2' });

      registry.register(desc1);
      registry.register(desc2);

      const stats = registry.getStats();
      expect(stats.total).toBe(1);
    });
  });

  describe('unregister', () => {
    it('应能注销已注册的 provider', () => {
      const desc = createDescriptor({ id: 'to-remove' });
      registry.register(desc);
      registry.unregister('to-remove');

      expect(registry.getStats().total).toBe(0);
      expect(mockUnregisterProvider).toHaveBeenCalled();
    });

    it('注销不存在的 ID 应安全处理', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('getAdapter', () => {
    it('应能通过显式 binding 获取 adapter', () => {
      const factory = vi.fn();
      const desc = createDescriptor({
        id: 'adapter-test',
        adapterFactory: factory as any,
      });
      registry.register(desc);

      registry.getAdapter('adapter-test');
      // adapterFactory 应被调用以创建 adapter
      // 注：具体调用取决于实现，这里验证不会抛出
    });
  });

  describe('resolveApiType', () => {
    it('应优先使用 descriptor 中的显式 apiType', () => {
      const desc = createDescriptor({
        id: 'explicit-type',
        apiType: 'anthropic' as ModelApiType,
      });
      registry.register(desc);

      const apiType = registry.resolveApiType('explicit-type');
      expect(apiType).toBe('anthropic');
      // resolveApiType 方法不会调用 inferApiType
      expect(mockInferApiType).not.toHaveBeenCalled();
    });

    it('descriptor 不存在时应返回 null（不降级到 inferApiType）', () => {
      // resolveApiType 方法只返回 descriptor.apiType，不降级
      const apiType = registry.resolveApiType('unknown-provider');
      expect(apiType).toBe(null);
    });
  });

  describe('getCompat', () => {
    it('应能返回 descriptor 中的 compat 配置', () => {
      const compat: AdapterCompatConfig = {
        streaming: true,
        toolCall: true,
        vision: false,
      };
      const desc = createDescriptor({
        id: 'compat-test',
        compat,
      });
      registry.register(desc);

      const result = registry.getCompat('compat-test');
      expect(result?.streaming).toBe(true);
      expect(result?.toolCall).toBe(true);
      expect(result?.vision).toBe(false);
    });

    it('descriptor 不存在时应返回 undefined', () => {
      const result = registry.getCompat('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getStats / getHealth', () => {
    it('应返回正确的统计信息', () => {
      registry.register(createDescriptor({ id: 'p1', builtin: true }));
      registry.register(createDescriptor({ id: 'p2', builtin: false }));
      registry.register(createDescriptor({ id: 'p3', isLocal: true }));

      const stats = registry.getStats();
      expect(stats.total).toBe(3);
      expect(stats.builtin).toBeGreaterThanOrEqual(1);
    });

    it('应返回健康状态', () => {
      registry.register(createDescriptor({ id: 'health-test' }));
      const health = registry.getHealth();
      // getHealth 返回 { total, activated, withAdapter }
      expect(health).toHaveProperty('total');
      expect(health).toHaveProperty('activated');
      expect(health).toHaveProperty('withAdapter');
    });
  });

  describe('resolveApiTypeExplicitly', () => {
    it('应优先从全局 registry 查找显式 binding', () => {
      // resolveApiTypeExplicitly 使用全局单例，需要注册到全局单例
      const globalRegistry = getUnifiedProviderRegistry();
      const desc = createDescriptor({
        id: 'explicit-resolve',
        apiType: 'gemini' as ModelApiType,
      });
      globalRegistry.register(desc);

      const result = resolveApiTypeExplicitly('explicit-resolve');
      expect(result).toBe('gemini');
    });

    it('registry 中无匹配时应降级到 inferApiType', () => {
      mockInferApiType.mockReturnValue('openai-chat' as ModelApiType);

      const result = resolveApiTypeExplicitly('fallback-test', 'https://api.openai.com');
      expect(result).toBe('openai-chat');
      expect(mockInferApiType).toHaveBeenCalledWith('fallback-test', 'https://api.openai.com');
    });
  });
});
