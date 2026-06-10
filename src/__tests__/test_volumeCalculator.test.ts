/**
 * volumeCalculator 工具函数单元测试
 *
 * 测试范围：
 * - calcUtilizationByItems（单仓库，件数基准）
 * - calcUtilizationByVolume（单仓库，体积基准）
 * - calcOverallByItems（多仓库汇总，件数基准）
 * - calcOverallByVolume（多仓库汇总，体积基准）
 * - getUtilizationColor（容积率颜色映射）
 * - 边界情况：NaN、Infinity、零值、空数组、负数
 */

import { describe, it, expect } from 'vitest';
import {
  calcUtilizationByItems,
  calcUtilizationByVolume,
  calcOverallByItems,
  calcOverallByVolume,
  getUtilizationColor,
} from '@/utils/volumeCalculator';
import type { Warehouse } from '@/types';

// ===================== 仓库 Mock =====================

function makeWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: 'WH-001',
    name: '测试仓库',
    totalItems: 1000,
    usedItems: 500,
    totalVolume: 1000,
    usedVolume: 500,
    totalContainers: 100,
    usedContainers: 50,
    location: '上海',
    status: 'active',
    ...overrides,
  } as Warehouse;
}

// ===================== calcUtilizationByItems =====================

describe('calcUtilizationByItems', () => {
  it('should return 50.0 when usedItems=500 and totalItems=1000', () => {
    const wh = makeWarehouse({ totalItems: 1000, usedItems: 500 });
    expect(calcUtilizationByItems(wh)).toBe(50.0);
  });

  it('should fallback to totalVolume when totalItems is 0 (not positive)', () => {
    // totalItems=0 falls through (0 > 0 is false), uses totalVolume as fallback
    const wh = makeWarehouse({ totalItems: 0, totalVolume: 1000, usedItems: 500 });
    expect(calcUtilizationByItems(wh)).toBe(50.0);
  });

  it('should return 100.0 when usedItems equals totalItems', () => {
    const wh = makeWarehouse({ totalItems: 100, usedItems: 100 });
    expect(calcUtilizationByItems(wh)).toBe(100.0);
  });

  it('should fallback to totalVolume when totalItems is NaN', () => {
    const wh = makeWarehouse({ totalItems: NaN, totalVolume: 500, usedItems: 100 });
    // usedItems 100 / totalVolume 500 = 20%
    expect(calcUtilizationByItems(wh)).toBe(20.0);
  });

  it('should fallback to usedVolume when usedItems is NaN', () => {
    const wh = makeWarehouse({ totalItems: 1000, usedItems: NaN, usedVolume: 200 });
    // usedVolume 200 / totalItems 1000 = 20%
    expect(calcUtilizationByItems(wh)).toBe(20.0);
  });

  it('should fallback to totalVolume when totalItems is Infinity', () => {
    // Number.isFinite(Infinity) is false, falls back to totalVolume
    const wh = makeWarehouse({ totalItems: Infinity, totalVolume: 1000, usedItems: 500 });
    expect(calcUtilizationByItems(wh)).toBe(50.0);
  });

  it('should return 0 when both totalItems and totalVolume are 0', () => {
    const wh = makeWarehouse({ totalItems: 0, totalVolume: 0, usedItems: 0 });
    expect(calcUtilizationByItems(wh)).toBe(0);
  });

  it('should not return negative utilization', () => {
    const wh = makeWarehouse({ totalItems: 100, usedItems: -10 });
    // usedItems is negative, falls through; fallback to usedVolume
    // If usedVolume is also invalid, it falls to 0
    const result = calcUtilizationByItems(wh);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('should return result with 1 decimal place precision', () => {
    const wh = makeWarehouse({ totalItems: 300, usedItems: 100 });
    // 100/300 = 33.333... → 33.3
    expect(calcUtilizationByItems(wh)).toBe(33.3);
  });
});

// ===================== calcUtilizationByVolume =====================

describe('calcUtilizationByVolume', () => {
  it('should return 50.0 when usedVolume=500 and totalVolume=1000', () => {
    const wh = makeWarehouse({ totalVolume: 1000, usedVolume: 500 });
    expect(calcUtilizationByVolume(wh)).toBe(50.0);
  });

  it('should default denominator to 1 when totalVolume is 0', () => {
    // totalVolume=0 (0 > 0 is false), defaults total to 1 → 500/1 = 50000%
    const wh = makeWarehouse({ totalVolume: 0, usedVolume: 500 });
    expect(calcUtilizationByVolume(wh)).toBe(50000.0);
  });

  it('should return 100.0 when usedVolume equals totalVolume', () => {
    const wh = makeWarehouse({ totalVolume: 200, usedVolume: 200 });
    expect(calcUtilizationByVolume(wh)).toBe(100.0);
  });

  it('should handle NaN totalVolume by defaulting to 1', () => {
    const wh = makeWarehouse({ totalVolume: NaN, usedVolume: 0 });
    expect(calcUtilizationByVolume(wh)).toBe(0);
  });

  it('should handle NaN usedVolume by defaulting to 0', () => {
    const wh = makeWarehouse({ totalVolume: 100, usedVolume: NaN });
    expect(calcUtilizationByVolume(wh)).toBe(0);
  });

  it('should default denominator to 1 when totalVolume is Infinity', () => {
    // Number.isFinite(Infinity) is false, defaults total to 1 → 500/1 = 50000%
    const wh = makeWarehouse({ totalVolume: Infinity, usedVolume: 500 });
    expect(calcUtilizationByVolume(wh)).toBe(50000.0);
  });

  it('should return 1 decimal precision', () => {
    const wh = makeWarehouse({ totalVolume: 300, usedVolume: 100 });
    // 100/300 = 33.333... → 33.3
    expect(calcUtilizationByVolume(wh)).toBe(33.3);
  });
});

// ===================== calcOverallByItems =====================

describe('calcOverallByItems', () => {
  it('should return 0 for empty array', () => {
    expect(calcOverallByItems([])).toBe(0);
  });

  it('should calculate weighted average across multiple warehouses', () => {
    const wh1 = makeWarehouse({ id: 'WH-001', totalItems: 100, usedItems: 50 });
    const wh2 = makeWarehouse({ id: 'WH-002', totalItems: 200, usedItems: 150 });
    // Total used: 50+150=200, Total: 100+200=300 → 66.7%
    expect(calcOverallByItems([wh1, wh2])).toBe(66.7);
  });

  it('should fallback to totalVolume when totalItems is NaN', () => {
    const wh1 = makeWarehouse({ id: 'WH-001', totalItems: NaN, totalVolume: 100, usedItems: 20 });
    const wh2 = makeWarehouse({ id: 'WH-002', totalItems: 100, usedItems: 50 });
    // WH-001: used 20(Items) / total 100(Vol) -> uses Items fallback
    // WH-002: used 50 / total 100
    // Sum: usedItems=20+50=70, totalItems via fallback=100+100=200
    // → 35.0%
    expect(calcOverallByItems([wh1, wh2])).toBe(35.0);
  });

  it('should fallback to usedVolume when usedItems is NaN', () => {
    const wh1 = makeWarehouse({ id: 'WH-001', totalItems: 100, usedItems: NaN, usedVolume: 30 });
    const wh2 = makeWarehouse({ id: 'WH-002', totalItems: 100, usedItems: 20 });
    // used sum: 30 + 20 = 50, total: 200 → 25.0%
    expect(calcOverallByItems([wh1, wh2])).toBe(25.0);
  });

  it('should return 0 when all totalItems sum to 0', () => {
    const wh1 = makeWarehouse({ id: 'WH-001', totalItems: 0, totalVolume: 0 });
    const wh2 = makeWarehouse({ id: 'WH-002', totalItems: 0, totalVolume: 0 });
    expect(calcOverallByItems([wh1, wh2])).toBe(0);
  });

  it('should handle single warehouse correctly', () => {
    const wh = makeWarehouse({ totalItems: 500, usedItems: 250 });
    expect(calcOverallByItems([wh])).toBe(50.0);
  });
});

// ===================== calcOverallByVolume =====================

describe('calcOverallByVolume', () => {
  it('should return 0 for empty array', () => {
    expect(calcOverallByVolume([])).toBe(0);
  });

  it('should calculate weighted average across multiple warehouses', () => {
    const wh1 = makeWarehouse({ id: 'WH-001', totalVolume: 100, usedVolume: 50 });
    const wh2 = makeWarehouse({ id: 'WH-002', totalVolume: 200, usedVolume: 150 });
    // 200/300 = 66.7%
    expect(calcOverallByVolume([wh1, wh2])).toBe(66.7);
  });

  it('should handle NaN totalVolume as 0 in summation', () => {
    const wh1 = makeWarehouse({ id: 'WH-001', totalVolume: NaN, usedVolume: 10 });
    const wh2 = makeWarehouse({ id: 'WH-002', totalVolume: 100, usedVolume: 40 });
    // totalVol sum: 0+100=100, usedVol sum: 10+40=50
    expect(calcOverallByVolume([wh1, wh2])).toBe(50.0);
  });

  it('should return 0 when all totalVolume sum to 0', () => {
    const wh1 = makeWarehouse({ id: 'WH-001', totalVolume: 0 });
    const wh2 = makeWarehouse({ id: 'WH-002', totalVolume: 0 });
    expect(calcOverallByVolume([wh1, wh2])).toBe(0);
  });

  it('should return 100.0 when all warehouses are full by volume', () => {
    const wh1 = makeWarehouse({ id: 'WH-001', totalVolume: 100, usedVolume: 100 });
    const wh2 = makeWarehouse({ id: 'WH-002', totalVolume: 50, usedVolume: 50 });
    expect(calcOverallByVolume([wh1, wh2])).toBe(100.0);
  });

  it('should handle 1 decimal precision', () => {
    const wh = makeWarehouse({ totalVolume: 300, usedVolume: 100 });
    // 100/300 = 33.333... → 33.3
    expect(calcOverallByVolume([wh])).toBe(33.3);
  });
});

// ===================== getUtilizationColor =====================

describe('getUtilizationColor', () => {
  it('should return "success" when rate is below warning threshold', () => {
    expect(getUtilizationColor(50)).toBe('success');
    expect(getUtilizationColor(69)).toBe('success');
  });

  it('should return "warning" when rate is at or above warning but below full', () => {
    expect(getUtilizationColor(70)).toBe('warning');
    expect(getUtilizationColor(85)).toBe('warning');
    expect(getUtilizationColor(90)).toBe('warning');
  });

  it('should return "error" when rate is above full threshold', () => {
    expect(getUtilizationColor(91)).toBe('error');
    expect(getUtilizationColor(100)).toBe('error');
  });

  it('should use custom thresholds when provided', () => {
    // Custom: warning at 50, full at 80
    expect(getUtilizationColor(40, 50, 80)).toBe('success');
    expect(getUtilizationColor(60, 50, 80)).toBe('warning');
    expect(getUtilizationColor(85, 50, 80)).toBe('error');
  });

  it('should use default thresholds (70/90) when only warning provided', () => {
    expect(getUtilizationColor(75, 70)).toBe('warning');
    expect(getUtilizationColor(95, 70)).toBe('error');
  });

  it('should handle rate of 0', () => {
    expect(getUtilizationColor(0)).toBe('success');
  });

  it('should handle rate of 100', () => {
    expect(getUtilizationColor(100)).toBe('error');
  });
});
