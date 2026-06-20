import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock getWarehouses before import
vi.mock('../../capabilities/warehouse', () => ({
  getWarehouses: vi.fn(() => [
    { id: 'wh-1', name: '深圳仓', country: '中国', city: '深圳' },
    { id: 'wh-2', name: '洛杉矶仓', country: '美国', city: '洛杉矶' },
  ]),
}));

import {
  matchWarehouse,
  parseWarehouses,
  parseTransitOrders,
  parseInventoryItems,
  type ParseResult,
} from '../docDataParser';
import type { Warehouse } from '../../types';

const minimalWarehouse = (overrides: Partial<Warehouse> & { id: string; name: string }): Warehouse =>
  ({
    country: '中国',
    city: '深圳',
    totalVolume: 0,
    usedVolume: 0,
    totalItems: 0,
    usedItems: 0,
    address: '',
    manager: '',
    phone: '',
    status: 'normal',
    ...overrides,
  } as Warehouse);

// ===================== 辅助函数 =====================

function makeSheet(headers: string[], rows: string[][]): any {
  return {
    gridData: {
      rows: [
        { values: headers.map(h => ({ cellValue: { text: h } })) },
        ...rows.map(row => ({ values: row.map(cell => ({ cellValue: { text: cell } })) })),
      ],
    },
  };
}

// ===================== matchWarehouse =====================

describe('matchWarehouse', () => {
  it('should match exact name', () => {
    const warehouses = [minimalWarehouse({ id: 'wh-1', name: '深圳仓' })];
    expect(matchWarehouse('深圳仓', warehouses)).toBe('wh-1');
  });

  it('should match with different case', () => {
    const warehouses = [minimalWarehouse({ id: 'wh-1', name: 'Shenzhen Warehouse' })];
    expect(matchWarehouse('shenzhen warehouse', warehouses)).toBe('wh-1');
  });

  it('should not match with extra spaces in middle', () => {
    // matchWarehouse 只做 trim + toLowerCase，不做去空格
    const warehouses = [minimalWarehouse({ id: 'wh-1', name: '深圳仓' })];
    expect(matchWarehouse('深圳 仓', warehouses)).toBeNull();
  });

  it('should return null for no match', () => {
    const warehouses = [minimalWarehouse({ id: 'wh-1', name: '深圳仓' })];
    expect(matchWarehouse('上海仓', warehouses)).toBeNull();
  });

  it('should return null for empty warehouses', () => {
    expect(matchWarehouse('深圳仓', [])).toBeNull();
  });

  it('should return first match when duplicates exist', () => {
    const warehouses = [
      minimalWarehouse({ id: 'wh-1', name: '深圳仓' }),
      minimalWarehouse({ id: 'wh-2', name: '深圳仓' }),
    ];
    expect(matchWarehouse('深圳仓', warehouses)).toBe('wh-1');
  });
});

// ===================== parseWarehouses =====================

describe('parseWarehouses', () => {
  it('should parse valid warehouse data', () => {
    const sheet = makeSheet(
      ['仓库名称', '国家', '城市', '件数上限', '已用件数', '地址', '负责人', '电话'],
      [['深圳仓', '中国', '深圳', '1000', '750', '科技园路1号', '张三', '13800138000']],
    );
    const result = parseWarehouses(sheet);
    expect(result.data).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.data[0].name).toBe('深圳仓');
    expect(result.data[0].country).toBe('中国');
    expect(result.data[0].city).toBe('深圳');
    expect(result.data[0].totalItems).toBe(1000);
    expect(result.data[0].usedItems).toBe(750);
    expect(result.data[0].address).toBe('科技园路1号');
    expect(result.data[0].manager).toBe('张三');
    expect(result.data[0].phone).toBe('13800138000');
  });

  it('should set status based on utilization', () => {
    const sheet = makeSheet(
      ['仓库名称', '国家', '城市', '件数上限', '已用件数'],
      [
        ['仓A', '中国', '深圳', '100', '50'],   // 50% → normal
        ['仓B', '中国', '深圳', '100', '75'],   // 75% → warning
        ['仓C', '中国', '深圳', '100', '90'],   // 90% → full
      ],
    );
    const result = parseWarehouses(sheet);
    expect(result.data[0].status).toBe('normal');
    expect(result.data[1].status).toBe('warning');
    expect(result.data[2].status).toBe('full');
  });

  it('should default usedItems to 0 when not provided', () => {
    const sheet = makeSheet(
      ['仓库名称', '国家', '城市', '件数上限'],
      [['深圳仓', '中国', '深圳', '1000']],
    );
    const result = parseWarehouses(sheet);
    expect(result.data[0].usedItems).toBe(0);
  });

  it('should return errors for missing required columns', () => {
    const sheet = makeSheet(['仓库名称', '国家'], []);
    const result = parseWarehouses(sheet);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.col === 'city')).toBe(true);
    expect(result.errors.some(e => e.col === 'totalItems')).toBe(true);
  });

  it('should return errors for empty name rows', () => {
    const sheet = makeSheet(
      ['仓库名称', '国家', '城市', '件数上限'],
      [['', '中国', '深圳', '100']],
    );
    const result = parseWarehouses(sheet);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('仓库名称为空');
  });

  it('should return errors for invalid totalItems', () => {
    const sheet = makeSheet(
      ['仓库名称', '国家', '城市', '件数上限'],
      [['深圳仓', '中国', '深圳', 'abc']],
    );
    const result = parseWarehouses(sheet);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('件数上限无效');
  });

  it('should return errors for empty country', () => {
    const sheet = makeSheet(
      ['仓库名称', '国家', '城市', '件数上限'],
      [['深圳仓', '', '深圳', '100']],
    );
    const result = parseWarehouses(sheet);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].col).toBe('country');
  });

  it('should handle empty sheet (no rows)', () => {
    const sheet = makeSheet(['仓库名称', '国家', '城市', '件数上限'], []);
    const result = parseWarehouses(sheet);
    expect(result.data).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle sheet with no gridData', () => {
    const result = parseWarehouses({ gridData: { rows: [] } });
    expect(result.data).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should parse multiple rows', () => {
    const sheet = makeSheet(
      ['仓库名称', '国家', '城市', '件数上限'],
      [
        ['深圳仓', '中国', '深圳', '1000'],
        ['上海仓', '中国', '上海', '2000'],
        ['北京仓', '中国', '北京', '3000'],
      ],
    );
    const result = parseWarehouses(sheet);
    expect(result.data).toHaveLength(3);
  });

  it('should support English column names', () => {
    const sheet = makeSheet(
      ['name', 'country', 'city', 'totalItems'],
      [['Test Warehouse', 'US', 'LA', '500']],
    );
    const result = parseWarehouses(sheet);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Test Warehouse');
  });
});

// ===================== parseTransitOrders =====================

describe('parseTransitOrders', () => {
  it('should parse valid transit order data', () => {
    const sheet = makeSheet(
      ['运单号', '发出仓', '目的仓', '品类', '重量', '体积', '运输方式', '预计到货', '状态', '承运商', '货值'],
      [['TR001', '深圳仓', '洛杉矶仓', '电子产品', '100', '2', '海运', '2026-07-01', '运输中', 'FedEx', '5000']],
    );
    const result = parseTransitOrders(sheet);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].trackingNo).toBe('TR001');
    expect(result.data[0].fromWarehouseId).toBe('wh-1');
    expect(result.data[0].toWarehouseId).toBe('wh-2');
    expect(result.data[0].transportMode).toBe('sea');
    expect(result.data[0].status).toBe('in_transit');
    expect(result.data[0].weight).toBe(100);
    expect(result.data[0].carrier).toBe('FedEx');
    expect(result.data[0].value).toBe(5000);
  });

  it('should return errors for missing required columns', () => {
    const sheet = makeSheet(['运单号'], []);
    const result = parseTransitOrders(sheet);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.col === 'fromWarehouse')).toBe(true);
    expect(result.errors.some(e => e.col === 'toWarehouse')).toBe(true);
  });

  it('should return errors for empty tracking number', () => {
    const sheet = makeSheet(
      ['运单号', '发出仓', '目的仓'],
      [['', '深圳仓', '洛杉矶仓']],
    );
    const result = parseTransitOrders(sheet);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('运单号为空');
  });

  it('should add warning for unmatched warehouse', () => {
    const sheet = makeSheet(
      ['运单号', '发出仓', '目的仓'],
      [['TR001', '未知仓', '洛杉矶仓']],
    );
    const result = parseTransitOrders(sheet);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('未匹配到现有仓库');
    expect(result.data).toHaveLength(0);
  });

  it('should map Chinese status values', () => {
    const sheet = makeSheet(
      ['运单号', '发出仓', '目的仓', '状态'],
      [['TR001', '深圳仓', '洛杉矶仓', '已发货']],
    );
    const result = parseTransitOrders(sheet);
    expect(result.data[0].status).toBe('dispatched');
  });

  it('should map Chinese transport mode', () => {
    const sheet = makeSheet(
      ['运单号', '发出仓', '目的仓', '运输方式'],
      [['TR001', '深圳仓', '洛杉矶仓', '空运']],
    );
    const result = parseTransitOrders(sheet);
    expect(result.data[0].transportMode).toBe('air');
  });

  it('should default transport mode to sea', () => {
    const sheet = makeSheet(
      ['运单号', '发出仓', '目的仓', '运输方式'],
      [['TR001', '深圳仓', '洛杉矶仓', 'unknown']],
    );
    const result = parseTransitOrders(sheet);
    expect(result.data[0].transportMode).toBe('sea');
  });

  it('should default status to in_transit', () => {
    const sheet = makeSheet(
      ['运单号', '发出仓', '目的仓', '状态'],
      [['TR001', '深圳仓', '洛杉矶仓', 'unknown']],
    );
    const result = parseTransitOrders(sheet);
    expect(result.data[0].status).toBe('in_transit');
  });

  it('should default numeric fields to 0 when missing', () => {
    const sheet = makeSheet(
      ['运单号', '发出仓', '目的仓'],
      [['TR001', '深圳仓', '洛杉矶仓']],
    );
    const result = parseTransitOrders(sheet);
    expect(result.data[0].weight).toBe(0);
    expect(result.data[0].volume).toBe(0);
    expect(result.data[0].value).toBe(0);
  });

  it('should handle empty sheet', () => {
    const sheet = makeSheet(['运单号', '发出仓', '目的仓'], []);
    const result = parseTransitOrders(sheet);
    expect(result.data).toHaveLength(0);
  });
});

// ===================== parseInventoryItems =====================

describe('parseInventoryItems', () => {
  it('should parse valid inventory data', () => {
    const sheet = makeSheet(
      ['SKU', '商品名称', '仓库', '数量', '单位体积', '入库日期', '单价', '品类'],
      [['SKU-001', '手机壳', '深圳仓', '100', '0.5', '2026-01-15', '25', '配件']],
    );
    const result = parseInventoryItems(sheet);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].sku).toBe('SKU-001');
    expect(result.data[0].name).toBe('手机壳');
    expect(result.data[0].warehouseId).toBe('wh-1');
    expect(result.data[0].quantity).toBe(100);
    expect(result.data[0].volumePerUnit).toBe(0.5);
    expect(result.data[0].totalVolume).toBe(50);
    expect(result.data[0].valuePerUnit).toBe(25);
    expect(result.data[0].totalValue).toBe(2500);
    expect(result.data[0].inboundDate).toBe('2026-01-15');
    expect(result.data[0].category).toBe('配件');
  });

  it('should return errors for missing required columns', () => {
    const sheet = makeSheet(['SKU'], []);
    const result = parseInventoryItems(sheet);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.col === 'quantity')).toBe(true);
  });

  it('should return errors for empty SKU', () => {
    const sheet = makeSheet(
      ['SKU', '数量'],
      [['', '100']],
    );
    const result = parseInventoryItems(sheet);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('SKU 为空');
  });

  it('should return errors for invalid quantity', () => {
    const sheet = makeSheet(
      ['SKU', '数量'],
      [['SKU-001', 'abc']],
    );
    const result = parseInventoryItems(sheet);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('数量无效');
  });

  it('should add warning for unmatched warehouse', () => {
    const sheet = makeSheet(
      ['SKU', '数量', '仓库'],
      [['SKU-001', '100', '未知仓']],
    );
    const result = parseInventoryItems(sheet);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('未匹配到现有仓库');
  });

  it('should use SKU as name when name column is missing', () => {
    const sheet = makeSheet(
      ['SKU', '数量', '仓库'],
      [['SKU-001', '100', '深圳仓']],
    );
    const result = parseInventoryItems(sheet);
    expect(result.data[0].name).toBe('SKU-001');
  });

  it('should default volume/value to 0 when missing', () => {
    const sheet = makeSheet(
      ['SKU', '数量', '仓库'],
      [['SKU-001', '100', '深圳仓']],
    );
    const result = parseInventoryItems(sheet);
    expect(result.data[0].volumePerUnit).toBe(0);
    expect(result.data[0].totalVolume).toBe(0);
    expect(result.data[0].valuePerUnit).toBe(0);
    expect(result.data[0].totalValue).toBe(0);
  });

  it('should use today as inbound date when missing', () => {
    const sheet = makeSheet(
      ['SKU', '数量', '仓库'],
      [['SKU-001', '100', '深圳仓']],
    );
    const result = parseInventoryItems(sheet);
    const today = new Date().toISOString().split('T')[0];
    expect(result.data[0].inboundDate).toBe(today);
  });

  it('should handle empty sheet', () => {
    const sheet = makeSheet(['SKU', '数量'], []);
    const result = parseInventoryItems(sheet);
    expect(result.data).toHaveLength(0);
  });

  it('should detect age warning for items older than 90 days', () => {
    const sheet = makeSheet(
      ['SKU', '数量', '仓库', '入库日期'],
      [['SKU-001', '100', '深圳仓', '2025-01-01']],
    );
    const result = parseInventoryItems(sheet);
    expect(result.data[0].isAgeWarning).toBe(true);
  });

  it('should not flag age warning for recent items', () => {
    const today = new Date().toISOString().split('T')[0];
    const sheet = makeSheet(
      ['SKU', '数量', '仓库', '入库日期'],
      [['SKU-001', '100', '深圳仓', today]],
    );
    const result = parseInventoryItems(sheet);
    expect(result.data[0].isAgeWarning).toBe(false);
  });
});
