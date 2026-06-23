/**
 * Unit tests for server/services/transferService.ts
 *
 * Tests:
 * - generateTransferNo() format validation
 * - submit() with mock DAO: status validation, inventory check, deduction, audit record
 * - receive() with mock DAO: status validation, destination item creation/increment, audit record
 * - bindTransit() / unbindTransit() with mock DAO: validation and status updates
 *
 * Mock strategy:
 * - vi.mock('../dao/warehouse.js') returns controllable mock DAO functions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock DAO =====================

const {
  mockGetTransferOrderById,
  mockGetTransferOrders,
  mockUpdateTransferOrder,
  mockCreateOutboundRecord,
  mockCreateInboundRecord,
  mockGetInventoryItems,
  mockUpdateInventoryItem,
  mockCreateInventoryItem,
} = vi.hoisted(() => ({
  mockGetTransferOrderById: vi.fn(),
  mockGetTransferOrders: vi.fn(),
  mockUpdateTransferOrder: vi.fn(),
  mockCreateOutboundRecord: vi.fn(),
  mockCreateInboundRecord: vi.fn(),
  mockGetInventoryItems: vi.fn(),
  mockUpdateInventoryItem: vi.fn(),
  mockCreateInventoryItem: vi.fn(),
}));

vi.mock('../dao/warehouse.js', () => ({
  getTransferOrderById: mockGetTransferOrderById,
  getTransferOrders: mockGetTransferOrders,
  updateTransferOrder: mockUpdateTransferOrder,
  createOutboundRecord: mockCreateOutboundRecord,
  createInboundRecord: mockCreateInboundRecord,
  getInventoryItems: mockGetInventoryItems,
  updateInventoryItem: mockUpdateInventoryItem,
  createInventoryItem: mockCreateInventoryItem,
}));

import {
  generateTransferNo,
  submit,
  receive,
  bindTransit,
  unbindTransit,
} from '../services/transferService';
import type { TransferOrderRow, InventoryItemRow } from '../db';

// ===================== Test Fixtures =====================

const DRAFT_ORDER: TransferOrderRow = {
  id: 'tf-001',
  transferNo: 'TF202605220001',
  fromWarehouseId: 'wh-source',
  toWarehouseId: 'wh-dest',
  sku: 'SKU-001',
  name: '测试商品A',
  quantity: 10,
  volume: 50.0,
  status: 'draft',
  transitOrderId: null,
  createdBy: 'admin',
  submittedAt: null,
  submittedBy: null,
  receivedAt: null,
  receivedBy: null,
  completedAt: null,
  completedBy: null,
  remark: '',
  createdAt: '2026-05-22T08:00:00Z',
  updatedAt: '2026-05-22T08:00:00Z',
};

const SOURCE_ITEM: InventoryItemRow = {
  id: 'inv-src-1',
  sku: 'SKU-001',
  name: '测试商品A',
  warehouseId: 'wh-source',
  quantity: 100,
  volumePerUnit: 5.0,
  totalVolume: 500.0,
  inboundDate: '2026-01-01',
  valuePerUnit: 25.0,
  totalValue: 2500.0,
  category: 'electronics',
  isAgeWarning: 0,
  autoCreated: 0,
};

const DEST_ITEM: InventoryItemRow = {
  id: 'inv-dst-1',
  sku: 'SKU-001',
  name: '测试商品A',
  warehouseId: 'wh-dest',
  quantity: 20,
  volumePerUnit: 5.0,
  totalVolume: 100.0,
  inboundDate: '2026-01-01',
  valuePerUnit: 25.0,
  totalValue: 500.0,
  category: 'electronics',
  isAgeWarning: 0,
  autoCreated: 0,
};

const SUBMITTED_ORDER: TransferOrderRow = { ...DRAFT_ORDER, status: 'submitted' };

const IN_TRANSIT_ORDER: TransferOrderRow = { ...DRAFT_ORDER, status: 'in_transit', transitOrderId: 'transit-001' };

// ===================== Reset =====================

beforeEach(() => {
  vi.clearAllMocks();
});

// ===================== generateTransferNo Tests =====================

describe('generateTransferNo', () => {
  it('should return a string starting with "TF"', () => {
    mockGetTransferOrders.mockReturnValue({ items: [], total: 0 });
    const no = generateTransferNo();
    expect(no).toMatch(/^TF/);
  });

  it('should contain current date in YYYYMMDD format', () => {
    mockGetTransferOrders.mockReturnValue({ items: [], total: 0 });
    const now = new Date();
    const dateStr =
      now.getFullYear().toString()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0');
    const no = generateTransferNo();
    expect(no).toContain(dateStr);
  });

  it('should end with a 4-digit sequence number', () => {
    mockGetTransferOrders.mockReturnValue({ items: [], total: 0 });
    const no = generateTransferNo();
    const seq = no.slice(-4);
    expect(seq).toHaveLength(4);
    expect(seq).toMatch(/^\d{4}$/);
  });

  it('should generate format TFYYYYMMDDXXXX', () => {
    mockGetTransferOrders.mockReturnValue({ items: [], total: 0 });
    const no = generateTransferNo();
    expect(no).toMatch(/^TF\d{12}$/);
  });
});

// ===================== submit Tests =====================

describe('submit', () => {
  function setupSubmitSuccess(order = DRAFT_ORDER, sourceItem = SOURCE_ITEM) {
    mockGetTransferOrderById.mockReturnValue(order);
    mockGetInventoryItems.mockImplementation((warehouseId?: string) => {
      if (warehouseId === 'wh-source') {
        return [{ ...sourceItem, isAgeWarning: false }];
      }
      return [];
    });
    mockUpdateInventoryItem.mockReturnValue({ ...sourceItem, isAgeWarning: false });
    mockCreateOutboundRecord.mockReturnValue({ id: 'out-001' });
    mockUpdateTransferOrder.mockReturnValue({ ...order, status: 'submitted' as const });
  }

  it('should successfully submit a draft order and deduct inventory', () => {
    setupSubmitSuccess();
    const result = submit('tf-001', 'operator-A');

    // Verify outbound record created
    expect(mockCreateOutboundRecord).toHaveBeenCalledTimes(1);
    expect(mockCreateOutboundRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 'wh-source',
        sku: 'SKU-001',
        name: '测试商品A',
        quantity: 10,
        operator: 'operator-A',
        destination: 'wh-dest',
        orderNo: 'TF202605220001',
      })
    );

    // Verify inventory updated with deducted values
    expect(mockUpdateInventoryItem).toHaveBeenCalledWith(
      'inv-src-1',
      expect.objectContaining({
        quantity: 90,
        totalValue: 2250,
      })
    );

    expect(result.status).toBe('submitted');
  });

  it('should throw "调拨单不存在" when order not found', () => {
    mockGetTransferOrderById.mockReturnValue(undefined);

    expect(() => submit('nonexistent', 'op')).toThrow('调拨单 nonexistent 不存在');
  });

  it('should throw error when order is not in draft status', () => {
    mockGetTransferOrderById.mockReturnValue({ ...DRAFT_ORDER, status: 'submitted' });

    expect(() => submit('tf-001', 'op')).toThrow('调拨单状态为 submitted，无法提交');
  });

  it('should throw "出库仓库存不足" when source inventory is insufficient', () => {
    mockGetTransferOrderById.mockReturnValue(DRAFT_ORDER);
    mockGetInventoryItems.mockReturnValue([{ ...SOURCE_ITEM, quantity: 5, isAgeWarning: false }]);

    expect(() => submit('tf-001', 'op')).toThrow('库存不足');
  });

  it('should throw "出库仓库存不足" when source inventory item does not exist', () => {
    mockGetTransferOrderById.mockReturnValue(DRAFT_ORDER);
    mockGetInventoryItems.mockReturnValue([]);

    expect(() => submit('tf-001', 'op')).toThrow('商品 SKU-001 在源仓库不存在');
  });

  it('should call updateInventoryItem with correct deducted values', () => {
    setupSubmitSuccess();
    submit('tf-001', 'op');

    expect(mockUpdateInventoryItem).toHaveBeenCalledTimes(1);
    expect(mockUpdateInventoryItem).toHaveBeenCalledWith(
      'inv-src-1',
      expect.objectContaining({
        quantity: 90,
        totalValue: 2250,
      })
    );
  });
});

// ===================== receive Tests =====================

describe('receive', () => {
  it('should receive a submitted order and add inventory to destination', () => {
    mockGetTransferOrderById.mockReturnValue(SUBMITTED_ORDER);
    mockGetInventoryItems.mockImplementation((warehouseId?: string) => {
      if (warehouseId === 'wh-dest') {
        return [{ ...DEST_ITEM, isAgeWarning: false }];
      }
      return [];
    });
    mockUpdateInventoryItem.mockReturnValue({ ...DEST_ITEM, quantity: 30, isAgeWarning: false });
    mockCreateInboundRecord.mockReturnValue({ id: 'in-001' });
    mockUpdateTransferOrder.mockReturnValue({ ...SUBMITTED_ORDER, status: 'completed' as const });

    const result = receive('tf-001', 'receiver-B');
    expect(result.status).toBe('completed');

    // Verify destination inventory updated
    expect(mockUpdateInventoryItem).toHaveBeenCalledWith(
      'inv-dst-1',
      expect.objectContaining({
        quantity: 30,
        totalValue: 750,
      })
    );

    // Verify inbound record created
    expect(mockCreateInboundRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 'wh-dest',
        sku: 'SKU-001',
        quantity: 10,
        operator: 'receiver-B',
        supplier: 'wh-source',
        batchNo: 'TF202605220001',
      })
    );
  });

  it('should auto-create destination inventory item when not exists', () => {
    mockGetTransferOrderById.mockReturnValue(SUBMITTED_ORDER);
    mockGetInventoryItems.mockImplementation((warehouseId?: string) => {
      if (warehouseId === 'wh-dest') {
        return [];
      }
      if (warehouseId === 'wh-source') {
        return [{ ...SOURCE_ITEM, isAgeWarning: false }];
      }
      return [];
    });
    mockCreateInventoryItem.mockReturnValue({
      id: 'new-dest-id',
      sku: 'SKU-001',
      name: '测试商品A',
      warehouseId: 'wh-dest',
      quantity: 10,
      volumePerUnit: 5.0,
      totalVolume: 50.0,
      inboundDate: expect.any(String),
      valuePerUnit: 25.0,
      totalValue: 250.0,
      category: 'electronics',
      isAgeWarning: false,
      autoCreated: 1,
    });
    mockCreateInboundRecord.mockReturnValue({ id: 'in-001' });
    mockUpdateTransferOrder.mockReturnValue({ ...SUBMITTED_ORDER, status: 'completed' as const });

    const result = receive('tf-001', 'receiver-B');
    expect(result.status).toBe('completed');

    // Verify createInventoryItem was called for auto-created item
    expect(mockCreateInventoryItem).toHaveBeenCalledTimes(1);
    expect(mockCreateInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'SKU-001',
        name: '测试商品A',
        warehouseId: 'wh-dest',
        quantity: 10,
        valuePerUnit: 25.0,
        totalValue: 250.0,
        autoCreated: 1,
      })
    );
  });

  it('should throw "调拨单不存在" when order not found', () => {
    mockGetTransferOrderById.mockReturnValue(undefined);

    expect(() => receive('nonexistent', 'op')).toThrow('调拨单 nonexistent 不存在');
  });

  it.each(['draft', 'completed'] as const)(
    'should reject non-receivable status "%s"',
    (status) => {
      mockGetTransferOrderById.mockReturnValue({ ...DRAFT_ORDER, status });

      expect(() => receive('tf-001', 'op')).toThrow(`调拨单状态为 ${status}，无法收货`);
    }
  );
});

// ===================== bindTransit Tests =====================

describe('bindTransit', () => {
  it('should bind transit order and change status to in_transit', () => {
    mockGetTransferOrderById.mockReturnValue(SUBMITTED_ORDER);
    mockUpdateTransferOrder.mockReturnValue({
      ...SUBMITTED_ORDER,
      status: 'in_transit' as const,
      transitOrderId: 'transit-001',
    });

    const result = bindTransit('tf-001', 'transit-001');
    expect(result.status).toBe('in_transit');
    expect(result.transitOrderId).toBe('transit-001');

    expect(mockUpdateTransferOrder).toHaveBeenCalledWith(
      'tf-001',
      expect.objectContaining({
        transitOrderId: 'transit-001',
      })
    );
  });

  it('should throw "调拨单不存在" when transfer order not found', () => {
    mockGetTransferOrderById.mockReturnValue(undefined);

    expect(() => bindTransit('bad-id', 't-001')).toThrow('调拨单 bad-id 不存在');
  });
});

// ===================== unbindTransit Tests =====================

describe('unbindTransit', () => {
  it('should unbind transit and revert status to submitted', () => {
    mockGetTransferOrderById.mockReturnValue(IN_TRANSIT_ORDER);
    mockUpdateTransferOrder.mockReturnValue({
      ...IN_TRANSIT_ORDER,
      status: 'submitted' as const,
      transitOrderId: null,
    });

    const result = unbindTransit('tf-001');
    expect(result.status).toBe('submitted');
    expect(result.transitOrderId).toBeNull();

    expect(mockUpdateTransferOrder).toHaveBeenCalledWith(
      'tf-001',
      expect.objectContaining({
        transitOrderId: null,
      })
    );
  });

  it('should throw "调拨单不存在" when order not found', () => {
    mockGetTransferOrderById.mockReturnValue(undefined);

    expect(() => unbindTransit('bad-id')).toThrow('调拨单 bad-id 不存在');
  });
});
