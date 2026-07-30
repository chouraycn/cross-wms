/**
 * keyRotator API Key 轮询与故障转移 单元测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---- mock 依赖 ----
const { fsMock } = vi.hoisted(() => ({
  fsMock: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(() => {}),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(() => {}),
  },
}));

vi.mock('fs', () => ({
  default: fsMock,
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../config/appPaths.js', () => ({
  AppPaths: {
    modelsDir: '/tmp/test-models-dir',
  },
}));

import { selectKey, reportKeyResult, getKeyStatus, clearRotationState } from '../keyRotator.js';

// 辅助构造 ModelConfig
function makeModel(id: string, keys: string[], strategy: 'round-robin' | 'random' | 'failover' = 'round-robin') {
  return {
    id,
    apiKey: keys.length === 1 ? keys[0] : undefined,
    apiKeys: keys.length > 1 ? keys.map((k, i) => ({ key: k, index: i, enabled: true })) : undefined,
    keyStrategy: strategy,
  } as any;
}

describe('keyRotator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(false);
    fsMock.readFileSync.mockReturnValue('');
  });

  afterEach(() => {
    // 清理所有可能创建的模型状态
    // 通过 clearRotationState 清理（即使无状态也不报错）
  });

  describe('selectKey - 基础', () => {
    it('无 key 时返回 null', () => {
      const model = makeModel('m-empty', [], 'round-robin');
      expect(selectKey(model)).toBeNull();
    });

    it('单个 key 时直接返回该 key', () => {
      const model = makeModel('m-single', ['only-key'], 'round-robin');
      const result = selectKey(model);
      expect(result).toEqual({ key: 'only-key', index: 0 });
    });

    it('兼容单 apiKey 字段', () => {
      const model = { id: 'm-legacy', apiKey: 'legacy-key', keyStrategy: 'round-robin' } as any;
      const result = selectKey(model);
      expect(result).toEqual({ key: 'legacy-key', index: 0 });
    });

    it('过滤掉 enabled=false 的 key', () => {
      const model = {
        id: 'm-disabled',
        apiKeys: [
          { key: 'k0', enabled: false },
          { key: 'k1', enabled: true },
        ],
        keyStrategy: 'round-robin',
      } as any;
      const result = selectKey(model);
      expect(result).toEqual({ key: 'k1', index: 0 });
    });

    it('过滤掉空字符串 key', () => {
      const model = {
        id: 'm-blank',
        apiKeys: [
          { key: '   ', enabled: true },
          { key: 'valid', enabled: true },
        ],
        keyStrategy: 'round-robin',
      } as any;
      const result = selectKey(model);
      expect(result).toEqual({ key: 'valid', index: 0 });
    });
  });

  describe('selectKey - round-robin 策略', () => {
    it('按顺序循环选择 key', () => {
      const model = makeModel('m-rr', ['a', 'b', 'c'], 'round-robin');
      const r1 = selectKey(model);
      const r2 = selectKey(model);
      const r3 = selectKey(model);
      const r4 = selectKey(model);
      expect(r1).toEqual({ key: 'a', index: 0 });
      expect(r2).toEqual({ key: 'b', index: 1 });
      expect(r3).toEqual({ key: 'c', index: 2 });
      // 循环回到第一个
      expect(r4).toEqual({ key: 'a', index: 0 });
    });
  });

  describe('selectKey - random 策略', () => {
    it('在可用 key 范围内随机选择', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const model = makeModel('m-rand', ['a', 'b', 'c', 'd'], 'random');
      const result = selectKey(model);
      // Math.floor(0.5 * 4) = 2
      expect(result).toEqual({ key: 'c', index: 2 });
      spy.mockRestore();
    });

    it('random=0 时选择第一个', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
      const model = makeModel('m-rand0', ['a', 'b', 'c'], 'random');
      const result = selectKey(model);
      expect(result).toEqual({ key: 'a', index: 0 });
      spy.mockRestore();
    });
  });

  describe('selectKey - failover 策略', () => {
    it('主 Key 健康时优先使用主 Key', () => {
      const model = makeModel('m-fo', ['primary', 'backup1', 'backup2'], 'failover');
      const result = selectKey(model);
      expect(result).toEqual({ key: 'primary', index: 0 });
    });

    it('主 Key 连续失败达阈值后切换到备用 Key', () => {
      const model = makeModel('m-fo-fail', ['primary', 'backup1', 'backup2'], 'failover');
      // 第一次使用主 Key
      const r1 = selectKey(model);
      expect(r1).toEqual({ key: 'primary', index: 0 });
      // 报告主 Key 失败两次（达到 FAILOVER_THRESHOLD=2）
      reportKeyResult('m-fo-fail', 0, false);
      reportKeyResult('m-fo-fail', 0, false);
      // 再次选择应切换到健康备用 Key
      const r2 = selectKey(model);
      expect(r2.key).not.toBe('primary');
      // primaryIndex 应已切换
      const status = getKeyStatus('m-fo-fail')!;
      const newPrimary = status.find(s => s.isPrimary);
      expect(newPrimary).toBeTruthy();
      expect(newPrimary!.index).not.toBe(0);
    });

    it('所有 Key 都在冷却中时强制重置并使用主 Key', () => {
      const model = makeModel('m-fo-allcd', ['p', 'b1', 'b2'], 'failover');
      // 让所有 key 都失败
      reportKeyResult('m-fo-allcd', 0, false);
      reportKeyResult('m-fo-allcd', 0, false);
      reportKeyResult('m-fo-allcd', 1, false);
      reportKeyResult('m-fo-allcd', 1, false);
      // primaryIndex 已切到 1，再让新的 primary (1) 失败
      reportKeyResult('m-fo-allcd', 1, false);
      reportKeyResult('m-fo-allcd', 1, false);
      // 此时所有 key 应处于冷却/失败状态，selectKey 强制重置当前主 Key
      const result = selectKey(model);
      expect(result).not.toBeNull();
      expect(typeof result!.key).toBe('string');
    });

    it('主 Key 成功后重置失败计数', () => {
      const model = makeModel('m-fo-success', ['p', 'b1'], 'failover');
      selectKey(model);
      reportKeyResult('m-fo-success', 0, false);
      reportKeyResult('m-fo-success', 0, true); // 成功重置
      const status = getKeyStatus('m-fo-success')!;
      expect(status[0].failCount).toBe(0);
      expect(status[0].lastFailedAt).toBeUndefined();
    });
  });

  describe('reportKeyResult', () => {
    it('未知模型 ID 时不报错', () => {
      expect(() => reportKeyResult('non-existent', 0, false)).not.toThrow();
    });

    it('无效 keyIndex 时不报错', () => {
      const model = makeModel('m-report', ['a', 'b'], 'round-robin');
      selectKey(model);
      expect(() => reportKeyResult('m-report', 99, false)).not.toThrow();
    });

    it('失败时递增 failCount 并记录 lastFailedAt', () => {
      const model = makeModel('m-failcount', ['a', 'b'], 'round-robin');
      selectKey(model);
      reportKeyResult('m-failcount', 0, false);
      const status = getKeyStatus('m-failcount')!;
      expect(status[0].failCount).toBe(1);
      expect(status[0].lastFailedAt).toBeGreaterThan(0);
    });
  });

  describe('getKeyStatus', () => {
    it('未知模型返回 null', () => {
      expect(getKeyStatus('never-existed')).toBeNull();
    });

    it('返回包含 index/failCount/lastUsedAt/isPrimary 的状态', () => {
      const model = makeModel('m-status', ['a', 'b'], 'failover');
      selectKey(model);
      const status = getKeyStatus('m-status')!;
      expect(status).toHaveLength(2);
      expect(status[0]).toHaveProperty('index');
      expect(status[0]).toHaveProperty('failCount');
      expect(status[0]).toHaveProperty('lastUsedAt');
      expect(status[0]).toHaveProperty('isPrimary');
      // failover 策略下 index 0 是 primary
      expect(status[0].isPrimary).toBe(true);
      expect(status[1].isPrimary).toBe(false);
    });

    it('非 failover 策略时所有 isPrimary 为 false', () => {
      const model = makeModel('m-noprimary', ['a', 'b'], 'round-robin');
      selectKey(model);
      const status = getKeyStatus('m-noprimary')!;
      expect(status.every(s => !s.isPrimary)).toBe(true);
    });
  });

  describe('clearRotationState', () => {
    it('清除内存中的模型状态', () => {
      const model = makeModel('m-clear', ['a', 'b'], 'round-robin');
      selectKey(model);
      expect(getKeyStatus('m-clear')).not.toBeNull();
      clearRotationState('m-clear');
      expect(getKeyStatus('m-clear')).toBeNull();
    });

    it('清除不存在的模型状态不报错', () => {
      expect(() => clearRotationState('not-exist')).not.toThrow();
    });

    it('当持久化文件存在且包含该模型时，从文件中删除条目', () => {
      const persisted = {
        version: 1,
        states: {
          'm-persist': { currentIndex: 1, primaryIndex: 0, keyStates: { 0: { failCount: 1, lastUsedAt: 0 } } },
          'other-model': { currentIndex: 0, primaryIndex: 0, keyStates: {} },
        },
        savedAt: '2024-01-01T00:00:00.000Z',
      };
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readFileSync.mockReturnValue(JSON.stringify(persisted));

      clearRotationState('m-persist');

      // 应写入文件，且写入内容不再包含 m-persist
      expect(fsMock.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(fsMock.writeFileSync.mock.calls[0][1] as string);
      expect(written.states).not.toHaveProperty('m-persist');
      expect(written.states).toHaveProperty('other-model');
    });

    it('持久化文件不存在时不写入', () => {
      fsMock.existsSync.mockReturnValue(false);
      clearRotationState('m-nofile');
      expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    });

    it('STATE_DIR 不存在时创建目录后再写入', () => {
      const persisted = {
        version: 1,
        states: {
          'm-mkdir': { currentIndex: 0, primaryIndex: 0, keyStates: {} },
        },
        savedAt: '2024-01-01T00:00:00.000Z',
      };
      // existsSync 对状态文件返回 true，对目录返回 false（触发 mkdirSync）
      fsMock.existsSync.mockImplementation((p: string) =>
        String(p).endsWith('rotation-state.json'),
      );
      fsMock.readFileSync.mockReturnValue(JSON.stringify(persisted));

      clearRotationState('m-mkdir');

      expect(fsMock.mkdirSync).toHaveBeenCalledWith('/tmp/test-models-dir', { recursive: true });
      expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    it('读取持久化文件抛错时捕获异常不传播', () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readFileSync.mockImplementation(() => {
        throw new Error('read failed');
      });
      expect(() => clearRotationState('m-readerr')).not.toThrow();
    });

    it('持久化文件中不含该模型时不写入', () => {
      const persisted = { version: 1, states: { 'other': { currentIndex: 0, primaryIndex: 0, keyStates: {} } }, savedAt: 'x' };
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readFileSync.mockReturnValue(JSON.stringify(persisted));
      clearRotationState('m-absent');
      expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('key 变更检测', () => {
    it('同一模型 key 列表变化时重新初始化状态', () => {
      const model1 = makeModel('m-change', ['a', 'b'], 'round-robin');
      selectKey(model1); // currentIndex -> 1
      selectKey(model1); // currentIndex -> 0
      // 更换 key
      const model2 = makeModel('m-change', ['x', 'y'], 'round-robin');
      const result = selectKey(model2);
      // 新 key 应为 'x' 或 'y'，不应返回旧 key 'a'/'b'
      expect(['x', 'y']).toContain(result!.key);
    });
  });

  describe('selectKey - 未知策略', () => {
    it('未知策略时走默认轮询逻辑', () => {
      const model = makeModel('m-unknown', ['a', 'b', 'c'], 'unknown' as any);
      const r1 = selectKey(model);
      const r2 = selectKey(model);
      expect(r1).toEqual({ key: 'a', index: 0 });
      expect(r2).toEqual({ key: 'b', index: 1 });
    });
  });

  describe('selectKey - failover 冷却逻辑', () => {
    it('主 Key 在冷却期内时跳过并使用备用 Key', () => {
      const model = makeModel('m-cd-skip', ['primary', 'backup1', 'backup2'], 'failover');
      // 让主 Key 失败达阈值，触发切换
      selectKey(model);
      reportKeyResult('m-cd-skip', 0, false);
      reportKeyResult('m-cd-skip', 0, false);
      // primaryIndex 应已切换到 1
      // 再次选择应使用 index 1 或 2 的 key（非 index 0）
      const result = selectKey(model);
      expect(result!.index).not.toBe(0);
      expect(['backup1', 'backup2']).toContain(result!.key);
    });

    it('备用 Key 也在冷却中时强制重置主 Key', () => {
      const model = makeModel('m-cd-all', ['p', 'b1', 'b2'], 'failover');
      selectKey(model);
      // 让 index 0 失败
      reportKeyResult('m-cd-all', 0, false);
      reportKeyResult('m-cd-all', 0, false);
      // primaryIndex -> 1
      // 让 index 1 也失败
      reportKeyResult('m-cd-all', 1, false);
      reportKeyResult('m-cd-all', 1, false);
      // primaryIndex -> 2
      // 让 index 2 也失败
      reportKeyResult('m-cd-all', 2, false);
      reportKeyResult('m-cd-all', 2, false);
      // primaryIndex -> 0 (循环)
      // 此时所有 key 都在冷却中，selectKey 应强制重置当前主 Key
      const result = selectKey(model);
      expect(result).not.toBeNull();
      expect(typeof result!.key).toBe('string');
    });
  });

  describe('loadRotationStates - 持久化加载', () => {
    it('模块加载时从文件恢复状态并重置过期冷却', async () => {
      vi.resetModules();

      const persisted = {
        version: 1,
        states: {
          'm-loaded': {
            currentIndex: 2,
            primaryIndex: 1,
            keyStates: {
              0: { failCount: 3, lastUsedAt: 1000, lastFailedAt: Date.now() - 120000 },
              1: { failCount: 0, lastUsedAt: 2000 },
            },
          },
        },
        savedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.doMock('fs', () => ({
        default: {
          existsSync: vi.fn(() => true),
          mkdirSync: vi.fn(() => {}),
          readFileSync: vi.fn(() => JSON.stringify(persisted)),
          writeFileSync: vi.fn(() => {}),
        },
      }));

      vi.doMock('../logger.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));

      vi.doMock('../config/appPaths.js', () => ({
        AppPaths: { modelsDir: '/tmp/test-models-dir' },
      }));

      const { selectKey: selectKeyReloaded, getKeyStatus: getKeyStatusReloaded } =
        await import('../keyRotator.js');

      const model = makeModel('m-loaded', ['key0', 'key1'], 'round-robin');
      const result = selectKeyReloaded(model);
      expect(result).not.toBeNull();

      const status = getKeyStatusReloaded('m-loaded')!;
      // 冷却已过期的 key 0 的 failCount 应被重置为 0
      expect(status[0].failCount).toBe(0);
      expect(status[0].lastFailedAt).toBeUndefined();

      vi.resetModules();
    });

    it('持久化文件版本不匹配时跳过加载', async () => {
      vi.resetModules();

      vi.doMock('fs', () => ({
        default: {
          existsSync: vi.fn(() => true),
          mkdirSync: vi.fn(() => {}),
          readFileSync: vi.fn(() => JSON.stringify({ version: 99, states: {} })),
          writeFileSync: vi.fn(() => {}),
        },
      }));

      vi.doMock('../logger.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));

      vi.doMock('../config/appPaths.js', () => ({
        AppPaths: { modelsDir: '/tmp/test-models-dir' },
      }));

      const { getKeyStatus: getKeyStatusReloaded } = await import('../keyRotator.js');
      expect(getKeyStatusReloaded('any-model')).toBeNull();

      vi.resetModules();
    });

    it('持久化文件读取抛错时不崩溃', async () => {
      vi.resetModules();

      vi.doMock('fs', () => ({
        default: {
          existsSync: vi.fn(() => true),
          mkdirSync: vi.fn(() => {}),
          readFileSync: vi.fn(() => { throw new Error('read error'); }),
          writeFileSync: vi.fn(() => {}),
        },
      }));

      vi.doMock('../logger.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));

      vi.doMock('../config/appPaths.js', () => ({
        AppPaths: { modelsDir: '/tmp/test-models-dir' },
      }));

      const { selectKey: selectKeyReloaded } = await import('../keyRotator.js');
      // 模块加载不应抛出异常
      const model = makeModel('m-errload', ['a'], 'round-robin');
      expect(selectKeyReloaded(model)).toEqual({ key: 'a', index: 0 });

      vi.resetModules();
    });
  });

  describe('extractKeys - 边界', () => {
    it('apiKeys 全部 disabled 时回退到 apiKey', () => {
      const model = {
        id: 'm-fallback',
        apiKey: 'legacy-key',
        apiKeys: [{ key: 'disabled-key', enabled: false }],
        keyStrategy: 'round-robin',
      } as any;
      const result = selectKey(model);
      expect(result!.key).toBe('legacy-key');
    });

    it('apiKeys 和 apiKey 都为空时返回 null', () => {
      const model = { id: 'm-empty2', keyStrategy: 'round-robin' } as any;
      expect(selectKey(model)).toBeNull();
    });

    it('apiKey 为纯空白时返回 null', () => {
      const model = { id: 'm-blank2', apiKey: '   ', keyStrategy: 'round-robin' } as any;
      expect(selectKey(model)).toBeNull();
    });
  });
});
