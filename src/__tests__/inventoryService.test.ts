/**
 * Unit tests for server/services/inventoryService.ts
 *
 * Tests transactional inbound/outbound business logic.
 * Uses a mock better-sqlite3 db object to simulate database operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock Setup =====================

// Mock uuid to return predictable IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

// Prepare the mock statement object
function createMockStatement() {
  return {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
  };
}

// Prepare mock db object
function createMockDb() {
  const db = {
    prepare: vi.fn(),
    transaction: vi.fn(),
    exec: vi.fn(),
    pragma: vi.fn(),
  };
  return db;
}

// Hold reference to the mock db so we can configure it per-test
const mockDb = createMockDb();

// Mock initDb to return our mock db
vi.mock('../../server/db.js', () => ({
  initDb: () => mockDb,
}));

// Mock the txnDao
vi.mock('../../server/dao/inventoryTransactionDao.js', () => ({
  insert: vi.fn(),
}));

import { createInbound, createOutbound } from '../../server/services/inventoryService.js';
import type { CreateInboundData, CreateOutboundData } from '../../server/services/inventoryService.js';
import * as txnDao from '../../server/dao/inventoryTransactionDao.js';
import type { InventoryItemRow, InboundRecordRow, OutboundRecordRow, InventoryTransactionRow } from '../../server/db.js';

// ===================== Test Fixtures =====================

const existingItem: InventoryItemRow = {
  id: 'item-1',
  sku: 'SKU-001',
  name: 'Test Item',
  warehouseId: 'wh-1',
  quantity: 100,
  volumePerUnit: 0.5,
  totalVolume: 50,
  inboundDate: '2024-01-01T00:00:00Z',
  valuePerUnit: 10,
  totalValue: 1000,
  category: 'Electronics',
  isAgeWarning: 0,
  autoCreated: 0,
};

const updatedItemAfterInbound: InventoryItemRow = {
  ...existingItem,
  quantity: 150,
  totalVolume: 75,
  totalValue: 1500,
};

const updatedItemAfterOutbound: InventoryItemRow = {
  ...existingItem,
  quantity: 80,
  totalVolume: 40,
  totalValue: 800,
};

const inboundRecord: InboundRecordRow = {
  id: 'mock-uuid-1234',
  warehouseId: 'wh-1',
  sku: 'SKU-001',
  name: 'Test Item',
  quantity: 50,
  volume: 25,
  createdAt: '2024-06-01T00:00:00Z',
  operator: 'Alice',
  status: 'completed',
  supplier: 'Supplier A',
  batchNo: 'BATCH-001',
};

const outboundRecord: OutboundRecordRow = {
  id: 'mock-uuid-1234',
  warehouseId: 'wh-1',
  sku: 'SKU-001',
  name: 'Test Item',
  quantity: 20,
  volume: 10,
  createdAt: '2024-06-01T00:00:00Z',
  operator: 'Bob',
  destination: 'Customer X',
  customer: 'Customer X',
  orderNo: 'ORD-001',
};

const mockTransaction: InventoryTransactionRow = {
  id: 1,
  sku: 'SKU-001',
  type: 'inbound',
  quantity: 50,
  warehouseId: 'wh-1',
  operator: 'Alice',
  sourceId: 'mock-uuid-1234',
  sourceType: 'inbound_record',
  remark: '',
  createdAt: '2024-06-01T00:00:00Z',
};

const defaultInboundData: CreateInboundData = {
  warehouseId: 'wh-1',
  sku: 'SKU-001',
  name: 'Test Item',
  quantity: 50,
  volume: 25,
  operator: 'Alice',
  status: 'completed',
  supplier: 'Supplier A',
  batchNo: 'BATCH-001',
};

const defaultOutboundData: CreateOutboundData = {
  warehouseId: 'wh-1',
  sku: 'SKU-001',
  name: 'Test Item',
  quantity: 20,
  volume: 10,
  operator: 'Bob',
  destination: 'Customer X',
  customer: 'Customer X',
  orderNo: 'ORD-001',
};

// ===================== Helpers =====================

/**
 * Set up the mock db.prepare to return statements with appropriate behaviors
 * for a successful inbound flow where the item already exists.
 */
function setupInboundWithExistingItem() {
  const stmts = {
    findItem: createMockStatement(),
    updateItem: createMockStatement(),
    getItem: createMockStatement(),
    insertRecord: createMockStatement(),
    getRecord: createMockStatement(),
    insertItem: createMockStatement(),
  };

  // findItem by sku + warehouseId → returns existing item
  stmts.findItem.get.mockReturnValue(existingItem);
  // update item
  stmts.updateItem.run.mockReturnValue({ changes: 1 });
  // get updated item
  stmts.getItem.get.mockReturnValue(updatedItemAfterInbound);
  // insert inbound record
  stmts.insertRecord.run.mockReturnValue({ changes: 1 });
  // get inbound record
  stmts.getRecord.get.mockReturnValue(inboundRecord);

  // Mock prepare to return different statements based on SQL
  mockDb.prepare.mockImplementation((sql: string) => {
    if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('sku')) {
      return stmts.findItem;
    }
    if (sql.includes('UPDATE') && sql.includes('inventory_items')) {
      return stmts.updateItem;
    }
    if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('WHERE id')) {
      return stmts.getItem;
    }
    if (sql.includes('INSERT') && sql.includes('inbound_records')) {
      return stmts.insertRecord;
    }
    if (sql.includes('SELECT') && sql.includes('inbound_records')) {
      return stmts.getRecord;
    }
    return createMockStatement();
  });

  // Mock transaction to just execute the callback immediately
  mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());

  return stmts;
}

/**
 * Set up the mock db.prepare for a successful outbound flow.
 */
function setupOutboundWithSufficientStock() {
  const stmts = {
    findItem: createMockStatement(),
    updateItem: createMockStatement(),
    getItem: createMockStatement(),
    insertRecord: createMockStatement(),
    getRecord: createMockStatement(),
  };

  stmts.findItem.get.mockReturnValue(existingItem);
  stmts.updateItem.run.mockReturnValue({ changes: 1 });
  stmts.getItem.get.mockReturnValue(updatedItemAfterOutbound);
  stmts.insertRecord.run.mockReturnValue({ changes: 1 });
  stmts.getRecord.get.mockReturnValue(outboundRecord);

  mockDb.prepare.mockImplementation((sql: string) => {
    if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('sku')) {
      return stmts.findItem;
    }
    if (sql.includes('UPDATE') && sql.includes('inventory_items')) {
      return stmts.updateItem;
    }
    if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('WHERE id')) {
      return stmts.getItem;
    }
    if (sql.includes('INSERT') && sql.includes('outbound_records')) {
      return stmts.insertRecord;
    }
    if (sql.includes('SELECT') && sql.includes('outbound_records')) {
      return stmts.getRecord;
    }
    return createMockStatement();
  });

  mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());

  return stmts;
}

beforeEach(() => {
  vi.clearAllMocks();
  (txnDao.insert as ReturnType<typeof vi.fn>).mockReturnValue(mockTransaction);
});

// ===================== createInbound Tests =====================

describe('inventoryService.createInbound', () => {
  it('should create inbound with existing inventory item', () => {
    const stmts = setupInboundWithExistingItem();

    const result = createInbound(defaultInboundData);

    // Verify the find-item query was called with correct params
    expect(stmts.findItem.get).toHaveBeenCalledWith('SKU-001', 'wh-1');

    // Verify quantity was incremented (100 + 50 = 150)
    expect(stmts.updateItem.run).toHaveBeenCalledWith(
      150, 75, 1500, expect.any(String), 'item-1'
    );

    // Verify inbound record was inserted
    expect(stmts.insertRecord.run).toHaveBeenCalled();

    // Verify transaction audit was created
    expect(txnDao.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'SKU-001',
        type: 'inbound',
        quantity: 50,
        warehouseId: 'wh-1',
        operator: 'Alice',
        sourceType: 'inbound_record',
      })
    );

    // Verify the result structure
    expect(result.inboundRecord).toEqual(inboundRecord);
    expect(result.inventoryItem).toEqual(updatedItemAfterInbound);
    expect(result.transaction).toEqual(mockTransaction);
  });

  it('should auto-create inventory item when it does not exist', () => {
    const stmts = {
      findItem: createMockStatement(),
      insertItem: createMockStatement(),
      getNewItem: createMockStatement(),
      updateItem: createMockStatement(),
      getUpdatedItem: createMockStatement(),
      insertRecord: createMockStatement(),
      getRecord: createMockStatement(),
    };

    // Item not found initially
    stmts.findItem.get.mockReturnValue(undefined);

    // After insert, return the new item
    const newItem: InventoryItemRow = {
      id: 'mock-uuid-1234',
      sku: 'SKU-002',
      name: 'New Item',
      warehouseId: 'wh-1',
      quantity: 0,
      volumePerUnit: 0.3,
      totalVolume: 0,
      inboundDate: '2024-06-01T00:00:00Z',
      valuePerUnit: 20,
      totalValue: 0,
      category: 'Toys',
      isAgeWarning: 0,
      autoCreated: 1,
    };
    stmts.getNewItem.get.mockReturnValue(newItem);

    // After update, item has the inbound quantity
    const updatedNewItem: InventoryItemRow = {
      ...newItem,
      quantity: 30,
      totalVolume: 9,
      totalValue: 600,
    };
    // Both getNewItem and getUpdatedItem return the same item initially
    // The actual implementation may return either depending on mock SQL matching
    stmts.getNewItem.get
      .mockReturnValueOnce(newItem)   // after INSERT
      .mockReturnValueOnce(updatedNewItem); // after UPDATE
    stmts.getUpdatedItem.get.mockReturnValue(updatedNewItem);

    stmts.insertRecord.run.mockReturnValue({ changes: 1 });
    stmts.getRecord.get.mockReturnValue(inboundRecord);

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('sku')) {
        return stmts.findItem;
      }
      if (sql.includes('INSERT') && sql.includes('inventory_items')) {
        return stmts.insertItem;
      }
      if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('WHERE id')) {
        // First call returns newly created item, second returns updated item
        return stmts.getNewItem;
      }
      if (sql.includes('UPDATE') && sql.includes('inventory_items')) {
        return stmts.updateItem;
      }
      if (sql.includes('INSERT') && sql.includes('inbound_records')) {
        return stmts.insertRecord;
      }
      if (sql.includes('SELECT') && sql.includes('inbound_records')) {
        return stmts.getRecord;
      }
      return createMockStatement();
    });

    mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());

    const data: CreateInboundData = {
      ...defaultInboundData,
      sku: 'SKU-002',
      name: 'New Item',
      quantity: 30,
      volumePerUnit: 0.3,
      valuePerUnit: 20,
      category: 'Toys',
    };

    const result = createInbound(data);

    // Verify INSERT was called to create the new item
    expect(stmts.insertItem.run).toHaveBeenCalled();
    expect(stmts.insertItem.run).toHaveBeenCalledWith(
      'mock-uuid-1234', 'SKU-002', 'New Item', 'wh-1', 0, 0.3, 0,
      expect.any(String), 20, 0, 'Toys', 0, 1
    );

    // Verify the result contains the updated item
    expect(result.inventoryItem).toEqual(updatedNewItem);
  });

  it('should use default values for optional fields when not provided', () => {
    const stmts = setupInboundWithExistingItem();

    const minimalData: CreateInboundData = {
      warehouseId: 'wh-1',
      sku: 'SKU-001',
      name: 'Test Item',
      quantity: 10,
      volume: 5,
      operator: 'Alice',
      status: 'pending',
      supplier: '',
      batchNo: '',
    };

    createInbound(minimalData);

    // Verify transaction audit uses empty string for remark
    expect(txnDao.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        remark: '',
      })
    );
  });

  it('should pass remark to transaction audit when provided', () => {
    setupInboundWithExistingItem();

    const dataWithRemark: CreateInboundData = {
      ...defaultInboundData,
      remark: 'Urgent delivery',
    };

    createInbound(dataWithRemark);

    expect(txnDao.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        remark: 'Urgent delivery',
      })
    );
  });

  it('should use default volumePerUnit/valuePerUnit/category when auto-creating item without them', () => {
    const stmts = {
      findItem: createMockStatement(),
      insertItem: createMockStatement(),
      getNewItem: createMockStatement(),
      updateItem: createMockStatement(),
      getUpdatedItem: createMockStatement(),
      insertRecord: createMockStatement(),
      getRecord: createMockStatement(),
    };

    stmts.findItem.get.mockReturnValue(undefined);

    const newItem: InventoryItemRow = {
      id: 'mock-uuid-1234',
      sku: 'SKU-003',
      name: 'No Options Item',
      warehouseId: 'wh-1',
      quantity: 0,
      volumePerUnit: 0,
      totalVolume: 0,
      inboundDate: '2024-06-01T00:00:00Z',
      valuePerUnit: 0,
      totalValue: 0,
      category: '',
      isAgeWarning: 0,
      autoCreated: 1,
    };
    stmts.getNewItem.get.mockReturnValue(newItem);
    stmts.getUpdatedItem.get.mockReturnValue({ ...newItem, quantity: 5 });
    stmts.insertRecord.run.mockReturnValue({ changes: 1 });
    stmts.getRecord.get.mockReturnValue(inboundRecord);

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('sku')) {
        return stmts.findItem;
      }
      if (sql.includes('INSERT') && sql.includes('inventory_items')) {
        return stmts.insertItem;
      }
      if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('WHERE id')) {
        return stmts.getNewItem;
      }
      if (sql.includes('UPDATE') && sql.includes('inventory_items')) {
        return stmts.updateItem;
      }
      if (sql.includes('INSERT') && sql.includes('inbound_records')) {
        return stmts.insertRecord;
      }
      if (sql.includes('SELECT') && sql.includes('inbound_records')) {
        return stmts.getRecord;
      }
      return createMockStatement();
    });

    mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());

    const dataNoOptional: CreateInboundData = {
      warehouseId: 'wh-1',
      sku: 'SKU-003',
      name: 'No Options Item',
      quantity: 5,
      volume: 2,
      operator: 'Alice',
      status: 'pending',
      supplier: '',
      batchNo: '',
    };

    createInbound(dataNoOptional);

    // Verify INSERT was called with defaults: volumePerUnit=0, valuePerUnit=0, category=''
    expect(stmts.insertItem.run).toHaveBeenCalledWith(
      'mock-uuid-1234', 'SKU-003', 'No Options Item', 'wh-1', 0,
      0, 0, expect.any(String), 0, 0, '', 0, 1
    );
  });
});

// ===================== createOutbound Tests =====================

describe('inventoryService.createOutbound', () => {
  it('should create outbound with sufficient stock', () => {
    setupOutboundWithSufficientStock();

    const result = createOutbound(defaultOutboundData);

    // Verify quantity was decremented (100 - 20 = 80)
    expect(result.inventoryItem).toEqual(updatedItemAfterOutbound);
    expect(result.outboundRecord).toEqual(outboundRecord);
    expect(result.transaction).toEqual(mockTransaction);
  });

  it('should throw "库存不足" when item does not exist', () => {
    const findItemStmt = createMockStatement();
    findItemStmt.get.mockReturnValue(undefined); // Item not found

    mockDb.prepare.mockReturnValue(findItemStmt);
    mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());

    expect(() => createOutbound(defaultOutboundData)).toThrow('库存不足');
  });

  it('should throw "库存不足" when item quantity is insufficient', () => {
    const findItemStmt = createMockStatement();
    const lowStockItem: InventoryItemRow = {
      ...existingItem,
      quantity: 10, // Less than the requested 20
    };
    findItemStmt.get.mockReturnValue(lowStockItem);

    mockDb.prepare.mockReturnValue(findItemStmt);
    mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());

    expect(() => createOutbound(defaultOutboundData)).toThrow('库存不足');
  });

  it('should throw "库存不足" when item quantity equals zero', () => {
    const findItemStmt = createMockStatement();
    const zeroStockItem: InventoryItemRow = {
      ...existingItem,
      quantity: 0,
    };
    findItemStmt.get.mockReturnValue(zeroStockItem);

    mockDb.prepare.mockReturnValue(findItemStmt);
    mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());

    expect(() => createOutbound(defaultOutboundData)).toThrow('库存不足');
  });

  it('should correctly deduct quantity and update derived fields', () => {
    const stmts = setupOutboundWithSufficientStock();

    createOutbound(defaultOutboundData);

    // Verify UPDATE was called with (100-20=80, 80*0.5=40, 80*10=800, item-1)
    expect(stmts.updateItem.run).toHaveBeenCalledWith(
      80, 40, 800, 'item-1'
    );
  });

  it('should create transaction audit record for outbound', () => {
    setupOutboundWithSufficientStock();

    createOutbound(defaultOutboundData);

    expect(txnDao.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'SKU-001',
        type: 'outbound',
        quantity: 20,
        warehouseId: 'wh-1',
        operator: 'Bob',
        sourceType: 'outbound_record',
      })
    );
  });

  it('should allow outbound exactly equal to current stock', () => {
    const findItemStmt = createMockStatement();
    const exactItem: InventoryItemRow = { ...existingItem, quantity: 20 };
    findItemStmt.get.mockReturnValue(exactItem);

    const updateStmt = createMockStatement();
    updateStmt.run.mockReturnValue({ changes: 1 });

    const getStmt = createMockStatement();
    const zeroItem: InventoryItemRow = {
      ...existingItem,
      quantity: 0,
      totalVolume: 0,
      totalValue: 0,
    };
    getStmt.get.mockReturnValue(zeroItem);

    const insertStmt = createMockStatement();
    insertStmt.run.mockReturnValue({ changes: 1 });

    const getRecordStmt = createMockStatement();
    getRecordStmt.get.mockReturnValue(outboundRecord);

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('sku')) return findItemStmt;
      if (sql.includes('UPDATE') && sql.includes('inventory_items')) return updateStmt;
      if (sql.includes('SELECT') && sql.includes('inventory_items') && sql.includes('WHERE id')) return getStmt;
      if (sql.includes('INSERT') && sql.includes('outbound_records')) return insertStmt;
      if (sql.includes('SELECT') && sql.includes('outbound_records')) return getRecordStmt;
      return createMockStatement();
    });

    mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());

    // Should NOT throw when quantity equals stock
    const result = createOutbound(defaultOutboundData);
    expect(result.inventoryItem.quantity).toBe(0);
  });

  it('should pass remark to transaction audit when provided', () => {
    setupOutboundWithSufficientStock();

    const dataWithRemark: CreateOutboundData = {
      ...defaultOutboundData,
      remark: 'Emergency shipment',
    };

    createOutbound(dataWithRemark);

    expect(txnDao.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        remark: 'Emergency shipment',
      })
    );
  });
});

// ===================== Transactional Behavior Tests =====================

describe('inventoryService transactional behavior', () => {
  it('should wrap inbound in a db.transaction() call', () => {
    setupInboundWithExistingItem();

    createInbound(defaultInboundData);

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('should wrap outbound in a db.transaction() call', () => {
    setupOutboundWithSufficientStock();

    createOutbound(defaultOutboundData);

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('should not call txnDao.insert if the transaction callback throws (outbound)', () => {
    // Setup: findItem returns insufficient stock, which throws
    const findItemStmt = createMockStatement();
    findItemStmt.get.mockReturnValue({ ...existingItem, quantity: 5 });

    mockDb.prepare.mockReturnValue(findItemStmt);
    mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());

    expect(() => createOutbound(defaultOutboundData)).toThrow('库存不足');
    // txnDao.insert should NOT have been called since the error threw before reaching it
    expect(txnDao.insert).not.toHaveBeenCalled();
  });
});
