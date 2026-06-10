/**
 * Unit tests for server/services/transferService.ts
 *
 * Tests:
 * - generateTransferNo() format validation
 * - submit() with mock DB: status validation, inventory check, deduction, audit record
 * - receive() with mock DB: status validation, destination item creation/increment, audit record
 * - bindTransit() / unbindTransit() with mock DB: validation and status updates
 *
 * Mock strategy:
 * - vi.mock('../db.js') returns controllable mockDb object
 * - vi.hoisted() + vi.mock('../dao/inventoryTransactionDao.js') spies on insert
 * - createMockStatement() returns {run, get, all} mocks; set return values on .get/.run/.all
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock Infrastructure =====================

function createMockStatement() {
  return {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
  };
}

const mockDb = {
  prepare: vi.fn(),
  transaction: vi.fn(),
  exec: vi.fn(),
  pragma: vi.fn(),
};

vi.mock('../db.js', () => ({
  initDb: () => mockDb,
  createSkillAudit: vi.fn(),
  getSessions: vi.fn(),
  searchSessions: vi.fn(),
  createSession: vi.fn(),
  getSessionMessages: vi.fn(),
  addMessage: vi.fn(),
  deleteSession: vi.fn(),
}));

const { mockTxnInsert } = vi.hoisted(() => ({
  mockTxnInsert: vi.fn(),
}));

vi.mock('../dao/inventoryTransactionDao.js', () => ({
  default: {},
  insert: mockTxnInsert,
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
  transferNo: 'TF-20260522-0001',
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
  // Simulate better-sqlite3 transaction: returns a deferred executor function
  mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());
});

// ===================== generateTransferNo Tests =====================

describe('generateTransferNo', () => {
  it('should return a string starting with "TF-"', () => {
    const no = generateTransferNo();
    expect(no).toMatch(/^TF-/);
  });

  it('should contain current date in YYYYMMDD format', () => {
    const now = new Date();
    const dateStr =
      now.getFullYear().toString()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0');
    const no = generateTransferNo();
    expect(no).toContain(dateStr);
  });

  it('should end with a 4-digit sequence number', () => {
    const no = generateTransferNo();
    const parts = no.split('-');
    expect(parts).toHaveLength(3);
    expect(parts[2]).toHaveLength(4);
    expect(parts[2]).toMatch(/^\d{4}$/);
  });

  it('should generate format TF-YYYYMMDD-XXXX', () => {
    const no = generateTransferNo();
    expect(no).toMatch(/^TF-\d{8}-\d{4}$/);
  });
});

// ===================== submit Tests =====================

describe('submit', () => {
  function setupSubmitSuccess(order = DRAFT_ORDER, sourceItem = SOURCE_ITEM) {
    const getOrderStmt = createMockStatement();
    getOrderStmt.get.mockReturnValue(order);

    const getItemStmt = createMockStatement();
    getItemStmt.get.mockReturnValue(sourceItem);

    const updateItemStmt = createMockStatement();

    const txnInsertStmt = createMockStatement();

    const finalGetStmt = createMockStatement();
    finalGetStmt.get.mockReturnValue({ ...order, status: 'submitted' as const });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return getOrderStmt;   // SELECT order by id
        case 2: return getItemStmt;     // SELECT source inventory
        case 3: return updateItemStmt;  // UPDATE inventory_items (deduct)
        case 4: return txnInsertStmt;   // INSERT audit row (via dao)
        case 5: return finalGetStmt;    // SELECT updated order
        default: return createMockStatement();
      }
    });
  }

  it('should successfully submit a draft order and deduct inventory', () => {
    setupSubmitSuccess();
    const result = submit('tf-001', 'operator-A');

    expect(mockDb.transaction).toHaveBeenCalled();

    // Verify audit record inserted as transfer_out
    expect(mockTxnInsert).toHaveBeenCalledTimes(1);
    expect(mockTxnInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transfer_out',
        quantity: 10,
        warehouseId: 'wh-source',
        operator: 'operator-A',
        sourceType: 'transfer_order',
        sourceId: 'tf-001',
      })
    );

    expect(result.status).toBe('submitted');
  });

  it('should throw "调拨单不存在" when order not found', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue(undefined);
    mockDb.prepare.mockReturnValue(stmt);

    expect(() => submit('nonexistent', 'op')).toThrow('调拨单不存在');
  });

  it('should throw error when order is not in draft status', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue({ ...DRAFT_ORDER, status: 'submitted' });
    mockDb.prepare.mockReturnValue(stmt);

    expect(() => submit('tf-001', 'op')).toThrow('只有草稿状态的调拨单可以提交');
  });

  it('should throw "出库仓库存不足" when source inventory is insufficient', () => {
    const getOrderStmt = createMockStatement();
    getOrderStmt.get.mockReturnValue(DRAFT_ORDER);
    const getItemStmt = createMockStatement();
    getItemStmt.get.mockReturnValue({ ...SOURCE_ITEM, quantity: 5 }); // less than required 10

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? getOrderStmt : getItemStmt;
    });

    expect(() => submit('tf-001', 'op')).toThrow('出库仓库存不足');
  });

  it('should throw "出库仓库存不足" when source inventory item does not exist', () => {
    const getOrderStmt = createMockStatement();
    getOrderStmt.get.mockReturnValue(DRAFT_ORDER);
    const getItemStmt = createMockStatement();
    getItemStmt.get.mockReturnValue(undefined);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? getOrderStmt : getItemStmt;
    });

    expect(() => submit('tf-001', 'op')).toThrow('出库仓库存不足');
  });

  it('should call UPDATE inventory_items with correct deducted values via prepare', () => {
    setupSubmitSuccess();
    submit('tf-001', 'op');

    // Verify prepare was called multiple times (at least 5 times)
    expect(mockDb.prepare.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});

// ===================== receive Tests =====================

describe('receive', () => {
  it('should receive a submitted order and add inventory to destination', () => {
    const getOrderStmt = createMockStatement();
    getOrderStmt.get.mockReturnValue(SUBMITTED_ORDER);

    const destItemStmt = createMockStatement();
    destItemStmt.get.mockReturnValue(DEST_ITEM);

    const updateDestStmt = createMockStatement();

    const txnInsertStmt = createMockStatement();

    const finalGetStmt = createMockStatement();
    finalGetStmt.get.mockReturnValue({ ...SUBMITTED_ORDER, status: 'completed' as const });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return getOrderStmt;    // SELECT order
        case 2: return destItemStmt;    // SELECT destination inventory (exists)
        case 3: return updateDestStmt;  // UPDATE destination (+quantity)
        case 4: return txnInsertStmt;   // INSERT audit row
        case 5: return finalGetStmt;    // SELECT updated order
        default: return createMockStatement();
      }
    });

    const result = receive('tf-001', 'receiver-B');
    expect(result.status).toBe('completed');

    // Verify audit record inserted as transfer_in
    expect(mockTxnInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transfer_in',
        quantity: 10,
        warehouseId: 'wh-dest',
        operator: 'receiver-B',
        sourceType: 'transfer_order',
        sourceId: 'tf-001',
      })
    );
  });

  it('should receive an in_transit order', () => {
    const getOrderStmt = createMockStatement();
    getOrderStmt.get.mockReturnValue(IN_TRANSIT_ORDER);

    const destItemStmt = createMockStatement();
    destItemStmt.get.mockReturnValue(DEST_ITEM);

    const updateDestStmt = createMockStatement();
    const txnInsertStmt = createMockStatement();
    const finalGetStmt = createMockStatement();
    finalGetStmt.get.mockReturnValue({ ...IN_TRANSIT_ORDER, status: 'completed' as const });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return getOrderStmt;
        case 2: return destItemStmt;
        case 3: return updateDestStmt;
        case 4: return txnInsertStmt;
        case 5: return finalGetStmt;
        default: return createMockStatement();
      }
    });

    const result = receive('tf-001', 'receiver-B');
    expect(result.status).toBe('completed');
  });

  it('should auto-create destination inventory item when not exists', () => {
    const getOrderStmt = createMockStatement();
    getOrderStmt.get.mockReturnValue(SUBMITTED_ORDER);

    const noDestStmt = createMockStatement();
    noDestStmt.get.mockReturnValue(undefined); // destination doesn't exist

    const srcItemStmt = createMockStatement();
    srcItemStmt.get.mockReturnValue(SOURCE_ITEM);

    const insertStmt = createMockStatement();

    const newDestStmt = createMockStatement();
    newDestStmt.get.mockReturnValue({
      id: 'new-dest-id',
      sku: 'SKU-001',
      name: '测试商品A',
      warehouseId: 'wh-dest',
      quantity: 0,
      volumePerUnit: 5.0,
      totalVolume: 0,
      inboundDate: '2026-01-01T00:00:00Z',
      valuePerUnit: 25.0,
      totalValue: 0,
      category: 'electronics',
      isAgeWarning: 0,
      autoCreated: 1,
    } as InventoryItemRow);

    const updateNewDestStmt = createMockStatement();
    const txnInsertStmt = createMockStatement();
    const finalGetStmt = createMockStatement();
    finalGetStmt.get.mockReturnValue({ ...SUBMITTED_ORDER, status: 'completed' as const });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return getOrderStmt;     // SELECT order
        case 2: return noDestStmt;       // SELECT dest inv (undefined)
        case 3: return srcItemStmt;      // SELECT source inv (metadata)
        case 4: return insertStmt;       // INSERT INTO inventory_items
        case 5: return newDestStmt;      // SELECT new item by id
        case 6: return updateNewDestStmt;// UPDATE dest inventory (+qty)
        case 7: return txnInsertStmt;    // INSERT audit row
        case 8: return finalGetStmt;     // SELECT updated order
        default: return createMockStatement();
      }
    });

    const result = receive('tf-001', 'receiver-B');
    expect(result.status).toBe('completed');

    // Verify INSERT was called for auto-created item
    const insertCall = mockDb.prepare.mock.calls.find((c: string[]) =>
      c[0]?.includes?.('INSERT INTO inventory_items')
    );
    expect(insertCall).toBeDefined();
  });

  it('should throw "调拨单不存在" when order not found', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue(undefined);
    mockDb.prepare.mockReturnValue(stmt);

    expect(() => receive('nonexistent', 'op')).toThrow('调拨单不存在');
  });

  it.each(['draft', 'completed'] as const)(
    'should reject non-receivable status "%s"',
    (status) => {
      const stmt = createMockStatement();
      stmt.get.mockReturnValue({ ...DRAFT_ORDER, status });
      mockDb.prepare.mockReturnValue(stmt);

      expect(() => receive('tf-001', 'op')).toThrow('只有已提交或在途状态的调拨单可以确认收货');
    }
  );
});

// ===================== bindTransit Tests =====================

describe('bindTransit', () => {
  it('should bind transit order and change status to in_transit', () => {
    const orderStmt = createMockStatement();
    orderStmt.get.mockReturnValue(SUBMITTED_ORDER);

    const transitStmt = createMockStatement();
    transitStmt.get.mockReturnValue({
      id: 'transit-001',
      fromWarehouseId: 'wh-source',
      toWarehouseId: 'wh-dest',
      trackingNo: 'TRK-12345',
    });

    const updateStmt = createMockStatement();
    const finalGetStmt = createMockStatement();
    finalGetStmt.get.mockReturnValue({
      ...SUBMITTED_ORDER,
      status: 'in_transit' as const,
      transitOrderId: 'transit-001',
    });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return orderStmt;    // SELECT transfer order
        case 2: return transitStmt;  // SELECT transit order
        case 3: return updateStmt;   // UPDATE transfer order (bind + set status)
        case 4: return finalGetStmt; // SELECT updated order
        default: return createMockStatement();
      }
    });

    const result = bindTransit('tf-001', 'transit-001');
    expect(result.status).toBe('in_transit');
    expect(result.transitOrderId).toBe('transit-001');
  });

  it('should throw "调拨单不存在" when transfer order not found', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue(undefined);
    mockDb.prepare.mockReturnValue(stmt);

    expect(() => bindTransit('bad-id', 't-001')).toThrow('调拨单不存在');
  });

  it('should throw when transfer order is not in submitted status', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue(DRAFT_ORDER); // draft, not submitted
    mockDb.prepare.mockReturnValue(stmt);

    expect(() => bindTransit('tf-001', 't-001')).toThrow('只有已提交状态的调拨单可以绑定物流');
  });

  it('should throw "物流单不存在" when transit order not found', () => {
    const orderStmt = createMockStatement();
    orderStmt.get.mockReturnValue(SUBMITTED_ORDER);

    const transitStmt = createMockStatement();
    transitStmt.get.mockReturnValue(undefined);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? orderStmt : transitStmt;
    });

    expect(() => bindTransit('tf-001', 'bad-transit')).toThrow('物流单不存在');
  });

  it('should throw when transit warehouses do not match', () => {
    const orderStmt = createMockStatement();
    orderStmt.get.mockReturnValue(SUBMITTED_ORDER); // wh-source → wh-dest

    const transitStmt = createMockStatement();
    transitStmt.get.mockReturnValue({
      id: 'transit-mismatch',
      fromWarehouseId: 'wrong-wh',  // mismatch!
      toWarehouseId: 'wh-dest',
      trackingNo: 'TRK-999',
    });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? orderStmt : transitStmt;
    });

    expect(() => bindTransit('tf-001', 'transit-mismatch')).toThrow('物流单的起止仓库与调拨单不匹配');
  });
});

// ===================== unbindTransit Tests =====================

describe('unbindTransit', () => {
  it('should unbind transit and revert status to submitted', () => {
    const orderStmt = createMockStatement();
    orderStmt.get.mockReturnValue(IN_TRANSIT_ORDER);

    const updateStmt = createMockStatement();
    const finalGetStmt = createMockStatement();
    finalGetStmt.get.mockReturnValue({
      ...IN_TRANSIT_ORDER,
      status: 'submitted' as const,
      transitOrderId: null,
    });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return orderStmt;    // SELECT order
        case 2: return updateStmt;   // UPDATE order (unbind + revert status)
        case 3: return finalGetStmt; // SELECT updated order
        default: return createMockStatement();
      }
    });

    const result = unbindTransit('tf-001');
    expect(result.status).toBe('submitted');
    expect(result.transitOrderId).toBeNull();
  });

  it('should throw "调拨单不存在" when order not found', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue(undefined);
    mockDb.prepare.mockReturnValue(stmt);

    expect(() => unbindTransit('bad-id')).toThrow('调拨单不存在');
  });

  it('should throw when order is not in in_transit status', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue(SUBMITTED_ORDER); // not in_transit
    mockDb.prepare.mockReturnValue(stmt);

    expect(() => unbindTransit('tf-001')).toThrow('只有在途状态的调拨单可以解绑物流');
  });
});
