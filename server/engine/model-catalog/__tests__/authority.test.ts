import { describe, expect, it } from 'vitest';
import {
  mergeRowsByAuthority,
  getSourceAuthority,
  compareSources,
  hasHigherOrEqualAuthority,
} from '../authority';
import type { NormalizedModelCatalogRow, ModelCatalogSource } from '../types';

function createRow(
  source: ModelCatalogSource,
  name: string,
  overrides: Partial<NormalizedModelCatalogRow> = {},
): NormalizedModelCatalogRow {
  return {
    provider: 'test-provider',
    id: 'test-model',
    ref: 'test-provider/test-model',
    mergeKey: 'test-provider::test-model',
    name,
    source,
    input: ['text'],
    reasoning: false,
    status: 'available',
    ...overrides,
  };
}

describe('authority', () => {
  describe('mergeRowsByAuthority', () => {
    it('当只有一行时应该返回该行', () => {
      const row = createRow('config', 'Config Model');
      const result = mergeRowsByAuthority([row]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Config Model');
    });

    it('应该优先选择 config 而不是 manifest', () => {
      const rows = [
        createRow('manifest', 'Manifest Model'),
        createRow('config', 'Config Model'),
      ];
      const result = mergeRowsByAuthority(rows);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Config Model');
      expect(result[0].source).toBe('config');
    });

    it('应该优先选择 manifest 而不是 cache', () => {
      const rows = [
        createRow('cache', 'Cached Model'),
        createRow('manifest', 'Manifest Model'),
      ];
      const result = mergeRowsByAuthority(rows);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Manifest Model');
      expect(result[0].source).toBe('manifest');
    });

    it('应该优先选择 cache 而不是 provider-index', () => {
      const rows = [
        createRow('provider-index', 'Preview Model'),
        createRow('cache', 'Cached Model'),
      ];
      const result = mergeRowsByAuthority(rows);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Cached Model');
      expect(result[0].source).toBe('cache');
    });

    it('当没有更高优先级的行时应该使用 provider-index', () => {
      const rows = [createRow('provider-index', 'Preview Model')];
      const result = mergeRowsByAuthority(rows);
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('provider-index');
    });

    it('应该保留不同 mergeKey 的行', () => {
      const rows = [
        createRow('config', 'Model A', { mergeKey: 'p1::m1', id: 'm1', provider: 'p1' }),
        createRow('provider-index', 'Model B', { mergeKey: 'p2::m2', id: 'm2', provider: 'p2' }),
      ];
      const result = mergeRowsByAuthority(rows);
      expect(result).toHaveLength(2);
    });

    it('应该按 provider 和 id 排序结果', () => {
      const rows = [
        createRow('config', 'Z Model', {
          mergeKey: 'z-provider::z-model',
          id: 'z-model',
          provider: 'z-provider',
        }),
        createRow('config', 'A Model', {
          mergeKey: 'a-provider::a-model',
          id: 'a-model',
          provider: 'a-provider',
        }),
      ];
      const result = mergeRowsByAuthority(rows);
      expect(result[0].provider).toBe('a-provider');
      expect(result[1].provider).toBe('z-provider');
    });

    it('应该处理空的可迭代对象', () => {
      const result = mergeRowsByAuthority([]);
      expect(result).toEqual([]);
    });

    it('应该处理同一 provider 下的多个模型', () => {
      const rows = [
        createRow('config', 'Model 1', { mergeKey: 'p1::m1', id: 'm1' }),
        createRow('config', 'Model 2', { mergeKey: 'p1::m2', id: 'm2' }),
        createRow('manifest', 'Model 3', { mergeKey: 'p1::m3', id: 'm3' }),
      ];
      const result = mergeRowsByAuthority(rows);
      expect(result).toHaveLength(3);
    });
  });

  describe('getSourceAuthority', () => {
    it('应该返回 config 的最低权限值（最高优先级）', () => {
      expect(getSourceAuthority('config')).toBe(0);
    });

    it('应该返回 manifest 的权限值', () => {
      expect(getSourceAuthority('manifest')).toBe(1);
    });

    it('应该返回 cache 的权限值', () => {
      expect(getSourceAuthority('cache')).toBe(2);
    });

    it('应该返回 provider-index 的最高权限值（最低优先级）', () => {
      expect(getSourceAuthority('provider-index')).toBe(3);
    });
  });

  describe('compareSources', () => {
    it('当左边优先级更高时应该返回负数', () => {
      expect(compareSources('config', 'manifest')).toBeLessThan(0);
    });

    it('当右边优先级更高时应该返回正数', () => {
      expect(compareSources('provider-index', 'cache')).toBeGreaterThan(0);
    });

    it('当优先级相同时应该返回零', () => {
      expect(compareSources('cache', 'runtime-refresh')).toBe(0);
    });
  });

  describe('hasHigherOrEqualAuthority', () => {
    it('当源具有更高优先级时应该返回 true', () => {
      expect(hasHigherOrEqualAuthority('config', 'manifest')).toBe(true);
    });

    it('当源具有相同优先级时应该返回 true', () => {
      expect(hasHigherOrEqualAuthority('cache', 'runtime-refresh')).toBe(true);
    });

    it('当源具有更低优先级时应该返回 false', () => {
      expect(hasHigherOrEqualAuthority('provider-index', 'manifest')).toBe(false);
    });
  });
});
