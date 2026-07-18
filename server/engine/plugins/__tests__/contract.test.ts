import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import {
  HOST_API_VERSION,
  HOST_API_SUPPORTED_RANGE,
  checkPluginContract,
  comparePluginVersions,
  isManifestContractValid,
  formatContractReport,
} from '../contract.js';
import type { PluginManifest } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    apiVersion: '1.0.0',
    ...overrides,
  };
}

describe('plugins/contract', () => {
  describe('常量', () => {
    it('HOST_API_VERSION 是合法版本', () => {
      expect(HOST_API_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('HOST_API_SUPPORTED_RANGE 是 ^1.0.0', () => {
      expect(HOST_API_SUPPORTED_RANGE.startsWith('^')).toBe(true);
    });
  });

  describe('checkPluginContract', () => {
    it('合法 manifest 返回 compatible=true', () => {
      const result = checkPluginContract(makeManifest());
      expect(result.compatible).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('缺少必需字段返回错误', () => {
      const result = checkPluginContract(
        makeManifest({ id: '', name: '', version: '' }),
      );
      expect(result.compatible).toBe(false);
      expect(result.reasons.some((r) => r.includes('id'))).toBe(true);
      expect(result.reasons.some((r) => r.includes('name'))).toBe(true);
      expect(result.reasons.some((r) => r.includes('version'))).toBe(true);
    });

    it('apiVersion 不兼容返回错误', () => {
      const result = checkPluginContract(makeManifest({ apiVersion: '2.0.0' }));
      expect(result.compatible).toBe(false);
      expect(result.reasons.some((r) => r.includes('apiVersion'))).toBe(true);
    });

    it('工具定义缺少 description 返回错误', () => {
      const result = checkPluginContract(
        makeManifest({
          tools: [
            {
              name: 'tool1',
              description: '',
              parameters: { type: 'object', properties: {} },
            },
          ],
        }),
      );
      expect(result.compatible).toBe(false);
      expect(result.reasons.some((r) => r.includes('description'))).toBe(true);
    });

    it('工具 parameters 非 object 类型返回错误', () => {
      const result = checkPluginContract(
        makeManifest({
          tools: [
            {
              name: 'tool1',
              description: 'd',
              parameters: { type: 'string', properties: {} } as unknown as PluginManifest['tools'] extends Array<infer T> ? T extends { parameters: infer P } ? P : never : never,
            },
          ],
        }),
      );
      expect(result.compatible).toBe(false);
    });

    it('依赖缺少 versionRange 返回错误', () => {
      const result = checkPluginContract(
        makeManifest({
          dependencies: [{ id: 'dep1', versionRange: '' }],
        }),
      );
      expect(result.compatible).toBe(false);
      expect(result.reasons.some((r) => r.includes('versionRange'))).toBe(true);
    });

    it('返回 hostApiVersion 与 pluginApiVersion', () => {
      const result = checkPluginContract(makeManifest({ apiVersion: '1.2.0' }));
      expect(result.hostApiVersion).toBe(HOST_API_VERSION);
      expect(result.pluginApiVersion).toBe('1.2.0');
    });
  });

  describe('comparePluginVersions', () => {
    it('升级场景返回 upgrade', () => {
      expect(comparePluginVersions('1.0.0', '2.0.0')).toBe('upgrade');
    });

    it('降级场景返回 downgrade', () => {
      expect(comparePluginVersions('2.0.0', '1.0.0')).toBe('downgrade');
    });

    it('相同版本返回 same', () => {
      expect(comparePluginVersions('1.2.3', '1.2.3')).toBe('same');
    });
  });

  describe('isManifestContractValid', () => {
    it('合法 manifest 返回 true', () => {
      expect(isManifestContractValid(makeManifest())).toBe(true);
    });

    it('非法 manifest 返回 false', () => {
      expect(isManifestContractValid(makeManifest({ apiVersion: '99.0.0' }))).toBe(false);
    });
  });

  describe('formatContractReport', () => {
    it('生成人类可读报告', () => {
      const result = checkPluginContract(makeManifest());
      const report = formatContractReport(result);
      expect(report).toContain('Plugin Contract Report');
      expect(report).toContain('Compatible: YES');
    });

    it('不兼容报告包含原因', () => {
      const result = checkPluginContract(makeManifest({ apiVersion: '2.0.0' }));
      const report = formatContractReport(result);
      expect(report).toContain('Compatible: NO');
      expect(report).toContain('Reasons');
    });
  });
});
