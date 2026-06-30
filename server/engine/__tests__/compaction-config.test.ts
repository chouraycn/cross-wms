// @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CompactionConfigManager,
  DEFAULT_COMPACTION_CONFIG,
  getGlobalCompactionConfigManager,
  setGlobalCompactionConfigManager,
  mergeCompactionConfig,
  validateCompactionConfig,
  createConfigOverrides,
  compileConfigConstants,
  type CompactionConfigOverrides,
} from '../compaction-config.js';

describe('compaction-config', () => {
  describe('DEFAULT_COMPACTION_CONFIG', () => {
    it('应该有合理的默认值', () => {
      expect(DEFAULT_COMPACTION_CONFIG.enabled).toBe(true);
      expect(DEFAULT_COMPACTION_CONFIG.timeoutMs).toBe(180000);
      expect(DEFAULT_COMPACTION_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_COMPACTION_CONFIG.chunkRatio).toBe(0.4);
      expect(DEFAULT_COMPACTION_CONFIG.minChunkRatio).toBe(0.15);
      expect(DEFAULT_COMPACTION_CONFIG.safetyMargin).toBe(1.2);
      expect(DEFAULT_COMPACTION_CONFIG.identifierPolicy).toBe('strict');
    });
  });

  describe('validateCompactionConfig', () => {
    it('有效配置应该通过验证', () => {
      const result = validateCompactionConfig({
        timeoutMs: 60000,
        maxRetries: 2,
        chunkRatio: 0.5,
      });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('超时太小应该失败', () => {
      const result = validateCompactionConfig({ timeoutMs: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'timeoutMs')).toBe(true);
    });

    it('超时太大应该失败', () => {
      const result = validateCompactionConfig({ timeoutMs: 1000000 });
      expect(result.valid).toBe(false);
    });

    it('重试次数为负应该失败', () => {
      const result = validateCompactionConfig({ maxRetries: -1 });
      expect(result.valid).toBe(false);
    });

    it('重试次数超过上限应该失败', () => {
      const result = validateCompactionConfig({ maxRetries: 11 });
      expect(result.valid).toBe(false);
    });

    it('分块比例超出范围应该失败', () => {
      const result = validateCompactionConfig({ chunkRatio: 1.5 });
      expect(result.valid).toBe(false);
    });

    it('最小分块比例大于基础比例应该失败', () => {
      const result = validateCompactionConfig({
        chunkRatio: 0.3,
        minChunkRatio: 0.5,
      });
      expect(result.valid).toBe(false);
    });

    it('安全系数小于 1 应该失败', () => {
      const result = validateCompactionConfig({ safetyMargin: 0.5 });
      expect(result.valid).toBe(false);
    });
  });

  describe('mergeCompactionConfig', () => {
    it('没有覆盖时应该返回基础配置副本', () => {
      const result = mergeCompactionConfig(DEFAULT_COMPACTION_CONFIG);
      expect(result).toEqual(DEFAULT_COMPACTION_CONFIG);
      expect(result).not.toBe(DEFAULT_COMPACTION_CONFIG);
    });

    it('应该合并有效覆盖', () => {
      const overrides: CompactionConfigOverrides = {
        timeoutMs: 60000,
        maxRetries: 5,
      };
      const result = mergeCompactionConfig(DEFAULT_COMPACTION_CONFIG, overrides);
      expect(result.timeoutMs).toBe(60000);
      expect(result.maxRetries).toBe(5);
      expect(result.chunkRatio).toBe(DEFAULT_COMPACTION_CONFIG.chunkRatio);
    });

    it('无效覆盖应该抛出', () => {
      expect(() =>
        mergeCompactionConfig(DEFAULT_COMPACTION_CONFIG, { timeoutMs: -1 }),
      ).toThrow();
    });
  });

  describe('CompactionConfigManager', () => {
    let manager: CompactionConfigManager;

    beforeEach(() => {
      manager = new CompactionConfigManager();
    });

    it('应该初始化为默认配置', () => {
      const config = manager.getConfig();
      expect(config).toEqual(DEFAULT_COMPACTION_CONFIG);
    });

    it('应该更新配置', () => {
      manager.updateConfig({ timeoutMs: 60000 });
      expect(manager.getConfig().timeoutMs).toBe(60000);
    });

    it('应该重置为默认配置', () => {
      manager.updateConfig({ timeoutMs: 60000 });
      manager.reset();
      expect(manager.getConfig().timeoutMs).toBe(DEFAULT_COMPACTION_CONFIG.timeoutMs);
    });

    it('isEnabled 应该返回 enabled 状态', () => {
      expect(manager.isEnabled()).toBe(true);
      manager.updateConfig({ enabled: false });
      expect(manager.isEnabled()).toBe(false);
    });

    it('getTimeout 应该返回超时时间', () => {
      expect(manager.getTimeout()).toBe(DEFAULT_COMPACTION_CONFIG.timeoutMs);
    });

    it('getConfig 应该返回副本', () => {
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('全局配置管理器', () => {
    it('应该获取全局管理器', () => {
      const mgr = getGlobalCompactionConfigManager();
      expect(mgr).toBeInstanceOf(CompactionConfigManager);
    });

    it('应该设置全局管理器', () => {
      const newMgr = new CompactionConfigManager();
      setGlobalCompactionConfigManager(newMgr);
      expect(getGlobalCompactionConfigManager()).toBe(newMgr);
    });
  });

  describe('createConfigOverrides', () => {
    it('应该创建覆盖配置', () => {
      const overrides = createConfigOverrides({ timeoutMs: 60000 });
      expect(overrides.timeoutMs).toBe(60000);
    });
  });

  describe('compileConfigConstants', () => {
    it('应该编译配置为常量对象', () => {
      const constants = compileConfigConstants(DEFAULT_COMPACTION_CONFIG);
      expect(constants.COMPACTION_ENABLED).toBe(true);
      expect(constants.COMPACTION_TIMEOUT_MS).toBe(180000);
      expect(constants.COMPACTION_MAX_RETRIES).toBe(3);
      expect(typeof constants.COMPACTION_CHUNK_RATIO).toBe('number');
    });
  });
});
