/**
 * Unit tests for server/dao/inventoryTransactionDao.ts
 *
 * Tests insert, findByQuery (with pagination & filters), and countByQuery.
 * Uses a mock better-sqlite3 db object to simulate database operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock Setup =====================

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

vi.mock('../../server/db.js', () => ({
  initDb: () => mockDb,
}));

import * as txnDao from '../../server/dao/inventoryTransactionDao.js';
import type { InventoryTransactionRow } from '../../server/db.js';

// ===================== Test Fixtures =====================

const mockTransactionRow: InventoryTransactionRow = {
  id: 1,
  sku: 'SKU-001',
  type: 'inbound',
  quantity: 50,
  warehouseId: 'wh-1',
  operator: 'Alice',
  sourceId: 'rec-1',
  sourceType: 'inbound_record',
  remark: '',
  createdAt: '2024-06-01T00:00:00Z',
};

const mockTransactionRow2: InventoryTransactionRow = {
  id: 2,
  sku: 'SKU-002',
  type: 'outbound',
  quantity: 20,
  warehouseId: 'wh-2',
  operator: 'Bob',
  sourceId: 'rec-2',
  sourceType: 'outbound_record',
  remark: 'Urgent',
  createdAt: '2024-06-02T00:00:00Z',
};

const mockTransactionRows: InventoryTransactionRow[] = [mockTransactionRow, mockTransactionRow2];

beforeEach(() => {
  vi.clearAllMocks();
});

// ===================== insert() Tests =====================

describe('inventoryTransactionDao.insert', () => {
  it('should insert a new transaction and return the inserted row', () => {
    const insertStmt = createMockStatement();
    insertStmt.run.mockReturnValue({ lastInsertRowid: 1 });

    const getStmt = createMockStatement();
    getStmt.get.mockReturnValue(mockTransactionRow);

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('INSERT')) return insertStmt;
      if (sql.includes('SELECT')) return getStmt;
      return createMockStatement();
    });

    const result = txnDao.insert({
      sku: 'SKU-001',
      type: 'inbound',
      quantity: 50,
      warehouseId: 'wh-1',
      operator: 'Alice',
      sourceId: 'rec-1',
      sourceType: 'inbound_record',
      remark: '',
    });

    // Verify INSERT was called with correct params
    expect(insertStmt.run).toHaveBeenCalledWith(
      'SKU-001', 'inbound', 50, 'wh-1', 'Alice', 'rec-1', 'inbound_record', ''
    );

    // Verify SELECT was called with the lastInsertRowid
    expect(getStmt.get).toHaveBeenCalledWith(1);

    // Verify the returned row
    expect(result).toEqual(mockTransactionRow);
  });

  it('should use default empty strings for optional fields', () => {
    const insertStmt = createMockStatement();
    insertStmt.run.mockReturnValue({ lastInsertRowid: 2 });

    const getStmt = createMockStatement();
    getStmt.get.mockReturnValue(mockTransactionRow2);

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('INSERT')) return insertStmt;
      if (sql.includes('SELECT')) return getStmt;
      return createMockStatement();
    });

    txnDao.insert({
      sku: 'SKU-002',
      type: 'outbound',
      quantity: 20,
      warehouseId: 'wh-2',
      operator: 'test-user',
      sourceId: '',
      sourceType: 'manual_adjustment',
      remark: '',
    });

    // Verify defaults: operator='test-user', sourceId='', sourceType='manual_adjustment', remark=''
    expect(insertStmt.run).toHaveBeenCalledWith(
      'SKU-002', 'outbound', 20, 'wh-2', 'test-user', '', 'manual_adjustment', ''
    );
  });
});

// ===================== findByQuery() Tests =====================

describe('inventoryTransactionDao.findByQuery', () => {
  it('should return all transactions with default pagination (page=1, pageSize=20)', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue(mockTransactionRows);

    mockDb.prepare.mockReturnValue(stmt);

    const result = txnDao.findByQuery({});

    expect(result).toEqual(mockTransactionRows);

    // Verify the SQL includes pagination
    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('LIMIT');
    expect(sql).toContain('OFFSET');
    expect(stmt.all).toHaveBeenCalledWith(20, 0); // pageSize=20, offset=0
  });

  it('should apply pagination with custom page and pageSize', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue([mockTransactionRow]);

    mockDb.prepare.mockReturnValue(stmt);

    txnDao.findByQuery({ page: 3, pageSize: 10 });

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('LIMIT');
    expect(sql).toContain('OFFSET');

    // offset = (3-1) * 10 = 20
    expect(stmt.all).toHaveBeenCalledWith(10, 20);
  });

  it('should filter by type', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue([mockTransactionRow]);

    mockDb.prepare.mockReturnValue(stmt);

    txnDao.findByQuery({ type: 'inbound' });

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('type = ?');
    expect(stmt.all).toHaveBeenCalledWith('inbound', 20, 0);
  });

  it('should filter by warehouseId', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue([mockTransactionRow]);

    mockDb.prepare.mockReturnValue(stmt);

    txnDao.findByQuery({ warehouseId: 'wh-1' });

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('warehouseId = ?');
    expect(stmt.all).toHaveBeenCalledWith('wh-1', 20, 0);
  });

  it('should filter by startDate', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue([mockTransactionRow]);

    mockDb.prepare.mockReturnValue(stmt);

    txnDao.findByQuery({ startDate: '2024-06-01' });

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('createdAt >= ?');
    expect(stmt.all).toHaveBeenCalledWith('2024-06-01', 20, 0);
  });

  it('should filter by endDate with time suffix', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue([mockTransactionRow]);

    mockDb.prepare.mockReturnValue(stmt);

    txnDao.findByQuery({ endDate: '2024-06-30' });

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('createdAt <= ?');
    expect(stmt.all).toHaveBeenCalledWith('2024-06-30T23:59:59.999Z', 20, 0);
  });

  it('should filter by sku with LIKE pattern', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue([mockTransactionRow]);

    mockDb.prepare.mockReturnValue(stmt);

    txnDao.findByQuery({ sku: 'SKU-00' });

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('sku LIKE ?');
    expect(stmt.all).toHaveBeenCalledWith('%SKU-00%', 20, 0);
  });

  it('should combine multiple filters', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue([mockTransactionRow]);

    mockDb.prepare.mockReturnValue(stmt);

    txnDao.findByQuery({
      type: 'inbound',
      warehouseId: 'wh-1',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      sku: 'SKU',
      page: 2,
      pageSize: 5,
    });

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('type = ?');
    expect(sql).toContain('warehouseId = ?');
    expect(sql).toContain('createdAt >= ?');
    expect(sql).toContain('createdAt <= ?');
    expect(sql).toContain('sku LIKE ?');
    expect(sql).toContain('ORDER BY createdAt DESC');

    // offset = (2-1) * 5 = 5
    expect(stmt.all).toHaveBeenCalledWith(
      'inbound', 'wh-1', '2024-01-01', '2024-12-31T23:59:59.999Z', '%SKU%', 5, 5
    );
  });

  it('should order results by createdAt DESC', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue(mockTransactionRows);

    mockDb.prepare.mockReturnValue(stmt);

    txnDao.findByQuery({});

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY createdAt DESC');
  });

  it('should return empty array when no results', () => {
    const stmt = createMockStatement();
    stmt.all.mockReturnValue([]);

    mockDb.prepare.mockReturnValue(stmt);

    const result = txnDao.findByQuery({ type: 'adjustment' });

    expect(result).toEqual([]);
  });
});

// ===================== countByQuery() Tests =====================

describe('inventoryTransactionDao.countByQuery', () => {
  it('should return total count with no filters', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue({ total: 42 });

    mockDb.prepare.mockReturnValue(stmt);

    const result = txnDao.countByQuery({});

    expect(result).toBe(42);

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('COUNT(*)');
    expect(stmt.get).toHaveBeenCalledWith();
  });

  it('should count by type filter', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue({ total: 10 });

    mockDb.prepare.mockReturnValue(stmt);

    const result = txnDao.countByQuery({ type: 'inbound' });

    expect(result).toBe(10);

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('type = ?');
    expect(stmt.get).toHaveBeenCalledWith('inbound');
  });

  it('should count by warehouseId filter', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue({ total: 15 });

    mockDb.prepare.mockReturnValue(stmt);

    const result = txnDao.countByQuery({ warehouseId: 'wh-1' });

    expect(result).toBe(15);
    expect(stmt.get).toHaveBeenCalledWith('wh-1');
  });

  it('should count by date range', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue({ total: 8 });

    mockDb.prepare.mockReturnValue(stmt);

    const result = txnDao.countByQuery({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });

    expect(result).toBe(8);

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('createdAt >= ?');
    expect(sql).toContain('createdAt <= ?');
    expect(stmt.get).toHaveBeenCalledWith('2024-01-01', '2024-12-31T23:59:59.999Z');
  });

  it('should count by sku with LIKE pattern', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue({ total: 3 });

    mockDb.prepare.mockReturnValue(stmt);

    const result = txnDao.countByQuery({ sku: 'SKU-00' });

    expect(result).toBe(3);

    const sql = mockDb.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('sku LIKE ?');
    expect(stmt.get).toHaveBeenCalledWith('%SKU-00%');
  });

  it('should combine multiple filters for counting', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue({ total: 5 });

    mockDb.prepare.mockReturnValue(stmt);

    const result = txnDao.countByQuery({
      type: 'outbound',
      warehouseId: 'wh-2',
      startDate: '2024-06-01',
    });

    expect(result).toBe(5);
    expect(stmt.get).toHaveBeenCalledWith('outbound', 'wh-2', '2024-06-01');
  });

  it('should return 0 when no records match', () => {
    const stmt = createMockStatement();
    stmt.get.mockReturnValue({ total: 0 });

    mockDb.prepare.mockReturnValue(stmt);

    const result = txnDao.countByQuery({ type: 'adjustment' });

    expect(result).toBe(0);
  });
});
