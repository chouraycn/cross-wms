/**
 * 库存盘点状态配置单元测试
 *
 * 测试范围：
 * - INVENTORY_STATUS_CONFIG 状态映射正确性
 * - STATUS_FLOW 状态流转规则
 * - canTransition() 流转合法性检查
 * - STATUS_ACTIONS 各状态可用操作
 * - getVarianceColor() / getVarianceLabel() 差异显示
 * - EXPORT_FILENAME / EXPORT_HEADERS 导出配置
 */

import { describe, it, expect } from 'vitest';
import {
  INVENTORY_STATUS_CONFIG,
  STATUS_FLOW,
  canTransition,
  STATUS_ACTIONS,
  getVarianceColor,
  getVarianceLabel,
  EXPORT_FILENAME,
  EXPORT_HEADERS,
} from '@/constants/wmsInventoryStatus';
import type { InventoryCount } from '@/types/wms';

// ===================== INVENTORY_STATUS_CONFIG =====================

describe('INVENTORY_STATUS_CONFIG', () => {
  it('should have exactly 3 status entries: pending, counted, adjusted', () => {
    const keys = Object.keys(INVENTORY_STATUS_CONFIG);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('pending');
    expect(keys).toContain('counted');
    expect(keys).toContain('adjusted');
  });

  it('pending status should map to correct label, color, and actionLabel', () => {
    expect(INVENTORY_STATUS_CONFIG.pending.label).toBe('待盘点');
    expect(INVENTORY_STATUS_CONFIG.pending.color).toBe('warning');
    expect(INVENTORY_STATUS_CONFIG.pending.actionLabel).toBe('录入实盘');
  });

  it('counted status should map to correct label, color, and actionLabel', () => {
    expect(INVENTORY_STATUS_CONFIG.counted.label).toBe('已盘点');
    expect(INVENTORY_STATUS_CONFIG.counted.color).toBe('info');
    expect(INVENTORY_STATUS_CONFIG.counted.actionLabel).toBe('确认调整');
  });

  it('adjusted status should map to correct label, color, and actionLabel', () => {
    expect(INVENTORY_STATUS_CONFIG.adjusted.label).toBe('已调整');
    expect(INVENTORY_STATUS_CONFIG.adjusted.color).toBe('success');
    expect(INVENTORY_STATUS_CONFIG.adjusted.actionLabel).toBe('查看详情');
  });

  it('every status config should have label, color, and actionLabel fields', () => {
    const statuses: InventoryCount['status'][] = ['pending', 'counted', 'adjusted'];
    for (const status of statuses) {
      const config = INVENTORY_STATUS_CONFIG[status];
      expect(config).toBeDefined();
      expect(typeof config.label).toBe('string');
      expect(config.label.length).toBeGreaterThan(0);
      expect(['warning', 'info', 'success', 'default']).toContain(config.color);
      expect(typeof config.actionLabel).toBe('string');
      expect(config.actionLabel.length).toBeGreaterThan(0);
    }
  });
});

// ===================== STATUS_FLOW =====================

describe('STATUS_FLOW', () => {
  it('pending can only transition to counted', () => {
    expect(STATUS_FLOW.pending).toEqual(['counted']);
  });

  it('counted can only transition to adjusted', () => {
    expect(STATUS_FLOW.counted).toEqual(['adjusted']);
  });

  it('adjusted cannot transition to any status', () => {
    expect(STATUS_FLOW.adjusted).toEqual([]);
  });

  it('should have exactly 3 keys matching InventoryCount status', () => {
    const keys = Object.keys(STATUS_FLOW);
    expect(keys).toHaveLength(3);
    expect(keys.sort()).toEqual(['adjusted', 'counted', 'pending']);
  });
});

// ===================== canTransition =====================

describe('canTransition', () => {
  it('pending → counted is allowed', () => {
    expect(canTransition('pending', 'counted')).toBe(true);
  });

  it('counted → adjusted is allowed', () => {
    expect(canTransition('counted', 'adjusted')).toBe(true);
  });

  it('pending → adjusted is NOT allowed (must go through counted)', () => {
    expect(canTransition('pending', 'adjusted')).toBe(false);
  });

  it('counted → pending is NOT allowed (no backward transition)', () => {
    expect(canTransition('counted', 'pending')).toBe(false);
  });

  it('adjusted → counted is NOT allowed (no backward transition)', () => {
    expect(canTransition('adjusted', 'counted')).toBe(false);
  });

  it('adjusted → pending is NOT allowed (terminal state)', () => {
    expect(canTransition('adjusted', 'pending')).toBe(false);
  });

  it('pending → pending is NOT allowed (no self-transition)', () => {
    expect(canTransition('pending', 'pending')).toBe(false);
  });

  it('counted → counted is NOT allowed (no self-transition)', () => {
    expect(canTransition('counted', 'counted')).toBe(false);
  });

  it('adjusted → adjusted is NOT allowed (terminal state)', () => {
    expect(canTransition('adjusted', 'adjusted')).toBe(false);
  });
});

// ===================== STATUS_ACTIONS =====================

describe('STATUS_ACTIONS', () => {
  it('pending status should allow count, edit, and delete', () => {
    expect(STATUS_ACTIONS.pending).toEqual(['count', 'edit', 'delete']);
  });

  it('counted status should allow adjust, edit, and delete', () => {
    expect(STATUS_ACTIONS.counted).toEqual(['adjust', 'edit', 'delete']);
  });

  it('adjusted status should only allow view', () => {
    expect(STATUS_ACTIONS.adjusted).toEqual(['view']);
  });

  it('pending should NOT have adjust action (not yet counted)', () => {
    expect(STATUS_ACTIONS.pending).not.toContain('adjust');
  });

  it('counted should NOT have count action (already counted)', () => {
    expect(STATUS_ACTIONS.counted).not.toContain('count');
  });

  it('adjusted should NOT have edit or delete actions (final state)', () => {
    expect(STATUS_ACTIONS.adjusted).not.toContain('edit');
    expect(STATUS_ACTIONS.adjusted).not.toContain('delete');
  });
});

// ===================== getVarianceColor =====================

describe('getVarianceColor', () => {
  it('positive variance (surplus) should return green', () => {
    expect(getVarianceColor(5)).toBe('#059669');
    expect(getVarianceColor(1)).toBe('#059669');
    expect(getVarianceColor(100)).toBe('#059669');
  });

  it('negative variance (shortage) should return red', () => {
    expect(getVarianceColor(-1)).toBe('#DC2626');
    expect(getVarianceColor(-5)).toBe('#DC2626');
    expect(getVarianceColor(-100)).toBe('#DC2626');
  });

  it('zero variance should return gray', () => {
    expect(getVarianceColor(0)).toBe('#6B7280');
  });
});

// ===================== getVarianceLabel =====================

describe('getVarianceLabel', () => {
  it('positive variance should show surplus label with + sign', () => {
    expect(getVarianceLabel(3)).toBe('盘盈 +3');
    expect(getVarianceLabel(1)).toBe('盘盈 +1');
  });

  it('negative variance should show shortage label', () => {
    expect(getVarianceLabel(-2)).toBe('盘亏 -2');
    expect(getVarianceLabel(-10)).toBe('盘亏 -10');
  });

  it('zero variance should show no-difference label', () => {
    expect(getVarianceLabel(0)).toBe('无差异');
  });
});

// ===================== Export Config =====================

describe('Export Configuration', () => {
  it('EXPORT_FILENAME should be inventory-counts.csv', () => {
    expect(EXPORT_FILENAME).toBe('inventory-counts.csv');
  });

  it('EXPORT_HEADERS should have 11 columns', () => {
    expect(EXPORT_HEADERS).toHaveLength(11);
  });

  it('EXPORT_HEADERS should include all required fields', () => {
    expect(EXPORT_HEADERS).toContain('ID');
    expect(EXPORT_HEADERS).toContain('仓库ID');
    expect(EXPORT_HEADERS).toContain('SKU');
    expect(EXPORT_HEADERS).toContain('系统数量');
    expect(EXPORT_HEADERS).toContain('实盘数量');
    expect(EXPORT_HEADERS).toContain('差异');
    expect(EXPORT_HEADERS).toContain('状态');
  });
});
