/**
 * @vitest-environment node
 *
 * InventoryQueryService Unit Tests
 * Tests SQL security validation, LIMIT enforcement, and safe execution
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryQueryService } from '../inventoryQueryService.js';
import type Database from 'better-sqlite3';

// ===================== Mock Database Helpers =====================

interface MockStatement {
  all: ReturnType<typeof vi.fn>;
  source: string;
}

/**
 * Creates a mock better-sqlite3 Database instance.
 * `stmt.all()` is called once by `executeWithTimeout()` inside `executeSafely()`.
 * If `allError` is provided, `stmt.all()` throws the error on that single call.
 */
function createMockDb(options: {
  rows?: Record<string, unknown>[];
  source?: string;
  pragmaValue?: number;
  prepareError?: Error;
  allError?: Error;
}) {
  const { rows = [], source = 'SELECT sku, name FROM inventory_items', pragmaValue = 5000, prepareError, allError } = options;

  const mockStmt: MockStatement = {
    all: allError
      ? vi.fn(() => { throw allError; })
      : vi.fn(() => rows),
    source,
  };

  const mockPrepare = prepareError
    ? vi.fn(() => { throw prepareError; })
    : vi.fn(() => mockStmt);

  const mockPragma = vi.fn((input: string | [string], options?: { simple?: boolean }) => {
    // When called as getter: db.pragma('busy_timeout', { simple: true })
    if (options?.simple) return pragmaValue;
    // When called as setter: db.pragma('busy_timeout = 5000')
    return [];
  });

  const mockDb = {
    prepare: mockPrepare,
    pragma: mockPragma,
  } as unknown as Database.Database;

  return { mockDb, mockStmt, mockPrepare, mockPragma };
}

// ===================== Test Suite =====================

describe('InventoryQueryService', () => {
  let service: InventoryQueryService;

  describe('SQL Security Validation (validateAndExecute)', () => {
    // ---- SELECT-only enforcement ----

    it('should accept a valid SELECT statement', () => {
      const { mockDb } = createMockDb({ rows: [{ sku: 'SKU001', name: 'Test' }] });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku, name FROM inventory_items LIMIT 10',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data).not.toBeNull();
      expect(result.data!.columns).toEqual(['sku', 'name']);
    });

    it('should reject INSERT statements', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'INSERT INTO inventory_items (sku) VALUES ("hack")',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
      expect(result.message).toContain('SELECT');
    });

    it('should reject UPDATE statements', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'UPDATE inventory_items SET quantity = 0',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    it('should reject DELETE statements', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'DELETE FROM inventory_items',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    it('should reject DROP statements', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'DROP TABLE inventory_items',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    it('should reject ALTER statements', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'ALTER TABLE inventory_items ADD COLUMN test TEXT',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    it('should reject TRUNCATE statements', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'TRUNCATE TABLE inventory_items',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    it('should reject CREATE statements', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'CREATE TABLE hack (id TEXT)',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    it('should reject statements that do not start with SELECT', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'EXPLAIN SELECT * FROM inventory_items',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    // ---- Case insensitivity ----

    it('should detect blocked keywords in mixed case', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'Insert INTO inventory_items (sku) VALUES ("hack")',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    it('should detect blocked keywords in uppercase', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'DELETE FROM inventory_items',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    // ---- SQL injection with semicolons ----

    it('should reject multi-statement injection via semicolons', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT * FROM inventory_items; DROP TABLE inventory_items;',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    // ---- Dangerous keywords even inside SELECT ----

    it('should reject ATTACH DATABASE in SELECT context', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT * FROM inventory_items WHERE 1=1; ATTACH DATABASE "/etc/passwd" AS hack',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });

    it('should reject PRAGMA statements', () => {
      const { mockDb } = createMockDb({});
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'PRAGMA table_info(inventory_items)',
        chartType: 'table',
      });

      expect(result.code).toBe(403);
    });
  });

  describe('LIMIT Enforcement', () => {
    it('should auto-append LIMIT 200 when SQL has no LIMIT', () => {
      const { mockDb } = createMockDb({ rows: [{ sku: 'SKU001' }] });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.sql).toContain('LIMIT 200');
    });

    it('should replace LIMIT > 500 with LIMIT 500', () => {
      const { mockDb } = createMockDb({ rows: [{ sku: 'SKU001' }] });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items LIMIT 1000',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.sql).toContain('LIMIT 500');
      expect(result.data!.sql).not.toContain('LIMIT 1000');
    });

    it('should keep LIMIT <= 500 unchanged', () => {
      const { mockDb } = createMockDb({ rows: [{ sku: 'SKU001' }] });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items LIMIT 50',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.sql).toContain('LIMIT 50');
    });

    it('should keep LIMIT 500 unchanged (boundary value)', () => {
      const { mockDb } = createMockDb({ rows: [{ sku: 'SKU001' }] });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items LIMIT 500',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.sql).toContain('LIMIT 500');
    });

    it('should replace LIMIT 501 with LIMIT 500 (boundary + 1)', () => {
      const { mockDb } = createMockDb({ rows: [{ sku: 'SKU001' }] });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items LIMIT 501',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.sql).toContain('LIMIT 500');
    });

    it('should handle SQL with trailing semicolon and no LIMIT', () => {
      const { mockDb } = createMockDb({ rows: [{ sku: 'SKU001' }] });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items;',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      // Semicolon should be removed and LIMIT 200 appended
      expect(result.data!.sql).not.toContain(';');
      expect(result.data!.sql).toContain('LIMIT 200');
    });
  });

  describe('SQL Execution', () => {
    it('should return columns and rows on successful query', () => {
      const rows = [
        { sku: 'SKU001', name: 'Widget A', quantity: 100 },
        { sku: 'SKU002', name: 'Widget B', quantity: 200 },
      ];
      const { mockDb } = createMockDb({ rows, source: 'SELECT sku, name, quantity FROM inventory_items LIMIT 200' });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku, name, quantity FROM inventory_items LIMIT 200',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.columns).toEqual(['sku', 'name', 'quantity']);
      expect(result.data!.rows).toEqual(rows);
      expect(result.data!.rowCount).toBe(2);
    });

    it('should return friendly message for SQL syntax errors', () => {
      const { mockDb } = createMockDb({
        allError: new Error('near "SELEC": syntax error'),
      });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items LIMIT 10',
        chartType: 'table',
      });

      expect(result.code).toBe(500);
      expect(result.message).toContain('SQL');
    });

    it('should return friendly message for table/column not found errors', () => {
      const { mockDb } = createMockDb({
        allError: new Error('no such table: nonexistent_table'),
      });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT * FROM nonexistent_table LIMIT 10',
        chartType: 'table',
      });

      expect(result.code).toBe(500);
      expect(result.message).toContain('表或字段');
    });

    it('should set truncated=true when rowCount equals LIMIT', () => {
      // Create 200 rows (matching the auto-appended LIMIT 200)
      const rows = Array.from({ length: 200 }, (_, i) => ({ sku: `SKU${i}`, name: `Item${i}` }));
      const { mockDb } = createMockDb({ rows });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku, name FROM inventory_items',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.truncated).toBe(true);
      expect(result.data!.rowCount).toBe(200);
    });

    it('should set truncated=false when rowCount is less than LIMIT', () => {
      const rows = [{ sku: 'SKU001', name: 'Widget A' }];
      const { mockDb } = createMockDb({ rows });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku, name FROM inventory_items LIMIT 10',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.truncated).toBe(false);
    });

    it('should infer columns from stmt.source when query returns no rows', () => {
      // When rows are empty, the service falls back to inferColumnsFromStatement(stmt.source)
      const { mockDb } = createMockDb({ rows: [], source: 'SELECT sku, name FROM inventory_items LIMIT 200' });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku, name FROM inventory_items WHERE 1=0 LIMIT 200',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      // inferColumnsFromStatement parses "SELECT sku, name FROM" → ['sku', 'name']
      expect(result.data!.columns).toEqual(['sku', 'name']);
      expect(result.data!.rows).toEqual([]);
      expect(result.data!.rowCount).toBe(0);
    });

    it('should return empty columns when no rows and stmt.source is unavailable', () => {
      // When source is empty/undefined, no columns can be inferred
      const { mockDb } = createMockDb({ rows: [], source: '' });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT 1 LIMIT 200',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.columns).toEqual([]);
      expect(result.data!.rows).toEqual([]);
      expect(result.data!.rowCount).toBe(0);
    });

    it('should pass chartType and chartConfig through to result', () => {
      const { mockDb } = createMockDb({ rows: [{ date: '2026-01', total: 100 }] });
      service = new InventoryQueryService(mockDb);

      const chartConfig = { xKey: 'date', yKey: 'total', xLabel: '日期', yLabel: '总量' };
      const result = service.validateAndExecute({
        sql: 'SELECT date, total FROM test LIMIT 200',
        chartType: 'bar',
        chartConfig,
      });

      expect(result.code).toBe(0);
      expect(result.data!.chartType).toBe('bar');
      expect(result.data!.chartConfig).toEqual(chartConfig);
    });

    it('should default chartType to table when not specified', () => {
      const { mockDb } = createMockDb({ rows: [{ sku: 'SKU001' }] });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items LIMIT 10',
      });

      expect(result.code).toBe(0);
      expect(result.data!.chartType).toBe('table');
    });

    it('should include the safe SQL in the response', () => {
      const { mockDb } = createMockDb({ rows: [{ sku: 'SKU001' }] });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items',
        chartType: 'table',
      });

      expect(result.code).toBe(0);
      expect(result.data!.sql).toContain('LIMIT 200');
    });

    it('should return generic error for unknown execution errors', () => {
      const { mockDb } = createMockDb({
        allError: new Error('disk I/O error'),
      });
      service = new InventoryQueryService(mockDb);

      const result = service.validateAndExecute({
        sql: 'SELECT sku FROM inventory_items LIMIT 10',
        chartType: 'table',
      });

      expect(result.code).toBe(500);
      expect(result.message).toContain('查询执行失败');
    });
  });
});
