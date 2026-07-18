import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  validateManifest,
  resolveDependencyTree,
  computeLoadOrder,
  findIncompatiblePlugins,
  findMissingDependencies,
} from '../loader.js';
import type { PluginManifest } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    ...overrides,
  };
}

describe('plugins/loader', () => {
  describe('parseVersion', () => {
    it('解析标准语义化版本', () => {
      const v = parseVersion('1.2.3');
      expect(v).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('解析带 v 前缀的版本', () => {
      const v = parseVersion('v2.0.1');
      expect(v.major).toBe(2);
    });

    it('解析预发布版本', () => {
      const v = parseVersion('1.0.0-alpha.1');
      expect(v.prerelease).toBe('alpha.1');
    });

    it('对非法版本抛出错误', () => {
      expect(() => parseVersion('not-a-version')).toThrow();
      expect(() => parseVersion('')).toThrow();
    });
  });

  describe('compareVersions', () => {
    it('正确比较主版本', () => {
      expect(compareVersions(parseVersion('1.0.0'), parseVersion('2.0.0'))).toBe(-1);
      expect(compareVersions(parseVersion('2.0.0'), parseVersion('1.0.0'))).toBe(1);
    });

    it('相同版本返回 0', () => {
      expect(compareVersions(parseVersion('1.2.3'), parseVersion('1.2.3'))).toBe(0);
    });

    it('预发布版本小于正式版本', () => {
      expect(compareVersions(parseVersion('1.0.0-alpha'), parseVersion('1.0.0'))).toBe(-1);
    });
  });

  describe('satisfiesVersion', () => {
    it('星号匹配任意版本', () => {
      expect(satisfiesVersion('1.0.0', '*')).toBe(true);
      expect(satisfiesVersion('99.99.99', '*')).toBe(true);
    });

    it('精确版本匹配', () => {
      expect(satisfiesVersion('1.2.3', '1.2.3')).toBe(true);
      expect(satisfiesVersion('1.2.4', '1.2.3')).toBe(false);
    });

    it('插入符号 ^ 兼容范围', () => {
      expect(satisfiesVersion('1.2.3', '^1.0.0')).toBe(true);
      expect(satisfiesVersion('1.9.9', '^1.0.0')).toBe(true);
      expect(satisfiesVersion('2.0.0', '^1.0.0')).toBe(false);
      expect(satisfiesVersion('0.2.0', '^0.1.0')).toBe(false);
    });

    it('波浪号 ~ 兼容范围', () => {
      expect(satisfiesVersion('1.2.5', '~1.2.0')).toBe(true);
      expect(satisfiesVersion('1.3.0', '~1.2.0')).toBe(false);
    });

    it('比较运算符 >= > <= <', () => {
      expect(satisfiesVersion('1.5.0', '>=1.0.0')).toBe(true);
      expect(satisfiesVersion('1.0.0', '>1.0.0')).toBe(false);
      expect(satisfiesVersion('1.0.0', '<=1.0.0')).toBe(true);
      expect(satisfiesVersion('2.0.0', '<2.0.0')).toBe(false);
    });

    it('多边界 AND 关系', () => {
      expect(satisfiesVersion('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
      expect(satisfiesVersion('2.5.0', '>=1.0.0 <2.0.0')).toBe(false);
    });
  });

  describe('validateManifest', () => {
    it('合法 manifest 返回空数组', () => {
      expect(validateManifest(makeManifest())).toEqual([]);
    });

    it('非法 ID 返回错误', () => {
      const errors = validateManifest(makeManifest({ id: 'Invalid_ID!' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('非法 version 返回错误', () => {
      const errors = validateManifest(makeManifest({ version: 'bad' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('依赖缺失 versionRange 返回错误', () => {
      const errors = validateManifest(
        makeManifest({ dependencies: [{ id: 'dep-1', versionRange: '' }] }),
      );
      expect(errors.some((e) => e.includes('versionRange'))).toBe(true);
    });
  });

  describe('resolveDependencyTree', () => {
    it('无依赖时返回原顺序', () => {
      const result = resolveDependencyTree(
        [makeManifest({ id: 'a' }), makeManifest({ id: 'b' })],
        new Map(),
      );
      expect(result.order.length).toBe(2);
      expect(result.missing).toEqual([]);
      expect(result.cycles).toEqual([]);
    });

    it('依赖缺失时记录到 missing', () => {
      const result = resolveDependencyTree(
        [makeManifest({ id: 'a', dependencies: [{ id: 'b', versionRange: '^1.0.0' }] })],
        new Map(),
      );
      expect(result.missing).toEqual([{ pluginId: 'a', missing: 'b' }]);
    });

    it('按依赖顺序拓扑排序', () => {
      const result = resolveDependencyTree(
        [
          makeManifest({ id: 'a', dependencies: [{ id: 'b', versionRange: '*' }] }),
          makeManifest({ id: 'b' }),
        ],
        new Map([['b', '1.0.0']]),
      );
      const order = computeLoadOrder(result);
      expect(order).toEqual(['b', 'a']);
    });

    it('检测循环依赖', () => {
      const result = resolveDependencyTree(
        [
          makeManifest({ id: 'a', dependencies: [{ id: 'b', versionRange: '*' }] }),
          makeManifest({ id: 'b', dependencies: [{ id: 'a', versionRange: '*' }] }),
        ],
        new Map([
          ['a', '1.0.0'],
          ['b', '1.0.0'],
        ]),
      );
      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('可选依赖缺失不报错', () => {
      const result = resolveDependencyTree(
        [
          makeManifest({
            id: 'a',
            dependencies: [{ id: 'b', versionRange: '*', optional: true }],
          }),
        ],
        new Map(),
      );
      expect(result.missing).toEqual([]);
    });
  });

  describe('findIncompatiblePlugins', () => {
    it('返回 apiVersion 不兼容的插件', () => {
      const result = findIncompatiblePlugins(
        [makeManifest({ id: 'a', apiVersion: '2.0.0' }), makeManifest({ id: 'b', apiVersion: '1.0.0' })],
        '1.0.0',
        '^1.0.0',
      );
      expect(result).toEqual([{ pluginId: 'a', apiVersion: '2.0.0' }]);
    });
  });

  describe('findMissingDependencies', () => {
    it('返回未安装的依赖', () => {
      const missing = findMissingDependencies(
        makeManifest({
          dependencies: [
            { id: 'dep-1', versionRange: '*' },
            { id: 'dep-2', versionRange: '*' },
          ],
        }),
        new Set(['dep-1']),
      );
      expect(missing.map((d) => d.id)).toEqual(['dep-2']);
    });
  });
});
