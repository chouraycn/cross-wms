/**
 * 健康检查注册表测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HealthCheckRegistrationError,
  registerHealthCheck,
  listHealthChecks,
  getHealthCheck,
  hasHealthCheck,
  healthCheckCount,
  clearHealthChecksForTest,
  registerHealthChecks,
  getHealthChecksByIds,
  listExtensionHealthChecksForDoctor,
} from '../health-check-registry.js';
import type { HealthCheck } from '../types.js';

const { loggerMock } = vi.hoisted(() => {
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { loggerMock };
});

vi.mock('../../../logger.js', () => ({ logger: loggerMock }));

function createMockCheck(id: string, kind: 'core' | 'plugin' = 'core'): HealthCheck {
  return {
    id,
    kind,
    description: `测试检查 ${id}`,
    source: 'test',
    async detect() {
      return [];
    },
  };
}

describe('health-check-registry', () => {
  beforeEach(() => {
    clearHealthChecksForTest();
    vi.clearAllMocks();
  });

  describe('registerHealthCheck', () => {
    it('注册单个健康检查', () => {
      const check = createMockCheck('test/check-1');
      registerHealthCheck(check);
      expect(healthCheckCount()).toBe(1);
      expect(hasHealthCheck('test/check-1')).toBe(true);
    });

    it('重复注册相同 id 抛出错误', () => {
      const check = createMockCheck('test/duplicate');
      registerHealthCheck(check);
      expect(() => registerHealthCheck(check)).toThrow(HealthCheckRegistrationError);
    });

    it('抛出的错误包含 checkId 和 code', () => {
      const check = createMockCheck('test/error');
      registerHealthCheck(check);
      try {
        registerHealthCheck(check);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(HealthCheckRegistrationError);
        expect((err as HealthCheckRegistrationError).checkId).toBe('test/error');
        expect((err as HealthCheckRegistrationError).code).toBe('DOCTOR_DUPLICATE_CHECK');
      }
    });
  });

  describe('listHealthChecks', () => {
    it('按插入顺序返回所有检查', () => {
      const check1 = createMockCheck('test/a');
      const check2 = createMockCheck('test/b');
      const check3 = createMockCheck('test/c');
      registerHealthCheck(check1);
      registerHealthCheck(check2);
      registerHealthCheck(check3);
      const list = listHealthChecks();
      expect(list).toHaveLength(3);
      expect(list[0].id).toBe('test/a');
      expect(list[1].id).toBe('test/b');
      expect(list[2].id).toBe('test/c');
    });

    it('注册表为空时返回空数组', () => {
      expect(listHealthChecks()).toEqual([]);
    });
  });

  describe('getHealthCheck', () => {
    it('根据 id 查找已注册的检查', () => {
      const check = createMockCheck('test/find-me');
      registerHealthCheck(check);
      const found = getHealthCheck('test/find-me');
      expect(found).toBeDefined();
      expect(found?.id).toBe('test/find-me');
    });

    it('未注册的 id 返回 undefined', () => {
      expect(getHealthCheck('test/nonexistent')).toBeUndefined();
    });
  });

  describe('hasHealthCheck', () => {
    it('检查是否存在', () => {
      registerHealthCheck(createMockCheck('test/exists'));
      expect(hasHealthCheck('test/exists')).toBe(true);
      expect(hasHealthCheck('test/missing')).toBe(false);
    });
  });

  describe('healthCheckCount', () => {
    it('返回正确的计数', () => {
      expect(healthCheckCount()).toBe(0);
      registerHealthCheck(createMockCheck('test/1'));
      expect(healthCheckCount()).toBe(1);
      registerHealthCheck(createMockCheck('test/2'));
      expect(healthCheckCount()).toBe(2);
    });
  });

  describe('registerHealthChecks', () => {
    it('批量注册多个检查', () => {
      const checks = [
        createMockCheck('test/batch-1'),
        createMockCheck('test/batch-2'),
        createMockCheck('test/batch-3'),
      ];
      registerHealthChecks(checks);
      expect(healthCheckCount()).toBe(3);
    });
  });

  describe('getHealthChecksByIds', () => {
    it('按 id 列表批量获取，不存在的忽略', () => {
      registerHealthCheck(createMockCheck('test/a'));
      registerHealthCheck(createMockCheck('test/b'));
      registerHealthCheck(createMockCheck('test/c'));
      const result = getHealthChecksByIds(['test/a', 'test/c', 'test/z']);
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.id).sort()).toEqual(['test/a', 'test/c']);
    });
  });

  describe('listExtensionHealthChecksForDoctor', () => {
    it('返回非 core 类型的检查', () => {
      const coreCheck = createMockCheck('core-internal/test-core', 'core');
      const pluginCheck = createMockCheck('plugin/test-plugin', 'plugin');
      registerHealthCheck(pluginCheck);
      const extensions = listExtensionHealthChecksForDoctor([coreCheck]);
      expect(extensions).toHaveLength(1);
      expect(extensions[0].id).toBe('plugin/test-plugin');
    });

    it('插件检查占用 core/doctor/ 前缀时抛出错误', () => {
      const coreCheck = createMockCheck('core-internal/real-core', 'core');
      const badPlugin = createMockCheck('core/doctor/fake-plugin', 'plugin');
      registerHealthCheck(badPlugin);
      expect(() => listExtensionHealthChecksForDoctor([coreCheck])).toThrow(HealthCheckRegistrationError);
    });

    it('插件检查 id 与 core 检查 id 冲突时抛出错误', () => {
      const coreCheck = createMockCheck('shared/check-id', 'core');
      const badPlugin = createMockCheck('shared/check-id', 'plugin');
      registerHealthCheck(badPlugin);
      expect(() => listExtensionHealthChecksForDoctor([coreCheck])).toThrow(HealthCheckRegistrationError);
    });

    it('注册表中只有 core 检查时返回空数组', () => {
      const coreCheck = createMockCheck('core-internal/test', 'core');
      registerHealthCheck(coreCheck);
      const extensions = listExtensionHealthChecksForDoctor([]);
      expect(extensions).toHaveLength(0);
    });

    it('没有注册任何检查时返回空数组', () => {
      const extensions = listExtensionHealthChecksForDoctor([]);
      expect(extensions).toHaveLength(0);
    });
  });

  describe('clearHealthChecksForTest', () => {
    it('清空注册表', () => {
      registerHealthCheck(createMockCheck('test/clear-1'));
      registerHealthCheck(createMockCheck('test/clear-2'));
      expect(healthCheckCount()).toBe(2);
      clearHealthChecksForTest();
      expect(healthCheckCount()).toBe(0);
    });
  });
});
