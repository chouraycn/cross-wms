/**
 * @vitest-environment node
 *
 * POST /api/inventory/nl-query Route Tests
 * Tests request body validation, success/error responses, and HTTP status codes
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ===================== Mock Setup =====================

// Mock database module
const mockValidateAndExecute = vi.fn();

vi.mock('../../db.js', () => ({
  initDb: vi.fn(() => ({
    prepare: vi.fn(),
    exec: vi.fn(),
    transaction: vi.fn((fn: () => void) => fn),
  })),
}));

vi.mock('../../services/inventoryQueryService.js', () => ({
  InventoryQueryService: vi.fn().mockImplementation(() => ({
    validateAndExecute: mockValidateAndExecute,
  })),
}));

// ===================== Test Server Helper =====================

let server: http.Server;
let baseUrl: string;

async function startServer(app: express.Application): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve, reject) => {
    const s = app.listen(0, () => {
      const addr = s.address() as AddressInfo;
      resolve({ server: s, url: `http://127.0.0.1:${addr.port}` });
    });
    s.on('error', reject);
  });
}

function stopServer(s: http.Server): Promise<void> {
  return new Promise((resolve) => {
    s.close(() => resolve());
  });
}

// ===================== Test Suite =====================

describe('POST /api/inventory/nl-query', () => {
  let inventoryNlQueryRouter: { default: express.Router };

  beforeAll(async () => {
    inventoryNlQueryRouter = await import('../../routes/inventory-nl-query.js');
    const app = express();
    app.use(express.json());
    app.use('/api/inventory', inventoryNlQueryRouter.default);
    const s = await startServer(app);
    server = s.server;
    baseUrl = s.url;
  });

  afterAll(async () => {
    await stopServer(server);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Request body validation ----

  it('should return 400 when sql is missing', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartType: 'table' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(400);
    expect(body.message).toContain('sql');
  });

  it('should return 400 when sql is empty string', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: '' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(400);
  });

  it('should return 400 when sql is only whitespace', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: '   ' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(400);
  });

  it('should return 400 when sql is not a string', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 12345 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(400);
  });

  // ---- Success response ----

  it('should return 200 with code:0 on successful query', async () => {
    mockValidateAndExecute.mockReturnValue({
      code: 0,
      data: {
        columns: ['sku', 'name'],
        rows: [{ sku: 'SKU001', name: 'Widget' }],
        rowCount: 1,
        truncated: false,
        chartType: 'table',
        sql: 'SELECT sku, name FROM inventory_items LIMIT 200',
      },
      message: 'ok',
    });

    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT sku, name FROM inventory_items' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).not.toBeNull();
    expect(body.data.columns).toEqual(['sku', 'name']);
    expect(body.data.rows).toHaveLength(1);
  });

  it('should trim leading/trailing whitespace from sql', async () => {
    mockValidateAndExecute.mockReturnValue({
      code: 0,
      data: { columns: [], rows: [], rowCount: 0, truncated: false, chartType: 'table', sql: 'SELECT 1 LIMIT 200' },
      message: 'ok',
    });

    await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: '  SELECT 1  ' }),
    });

    expect(mockValidateAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'SELECT 1' }),
    );
  });

  it('should default chartType to table when not provided', async () => {
    mockValidateAndExecute.mockReturnValue({
      code: 0,
      data: { columns: [], rows: [], rowCount: 0, truncated: false, chartType: 'table', sql: 'SELECT 1 LIMIT 200' },
      message: 'ok',
    });

    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 2' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data?.chartType).toBe('table');
    expect(mockValidateAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: 'table' }),
    );
  });

  it('should pass valid chartType through', async () => {
    mockValidateAndExecute.mockReturnValue({
      code: 0,
      data: { columns: [], rows: [], rowCount: 0, truncated: false, chartType: 'bar', sql: 'SELECT 1 LIMIT 200' },
      message: 'ok',
    });

    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 1', chartType: 'bar' }),
    });

    expect(res.status).toBe(200);
    expect(mockValidateAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: 'bar' }),
    );
  });

  it('should fallback to table for invalid chartType', async () => {
    mockValidateAndExecute.mockReturnValue({
      code: 0,
      data: { columns: [], rows: [], rowCount: 0, truncated: false, chartType: 'table', sql: 'SELECT 3 LIMIT 200' },
      message: 'ok',
    });

    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 3', chartType: 'scatter' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data?.chartType).toBe('table');
    expect(mockValidateAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: 'table' }),
    );
  });

  // ---- SQL validation failure ----

  it('should return 403 when SQL validation fails', async () => {
    mockValidateAndExecute.mockReturnValue({
      code: 403,
      data: null,
      message: '仅允许 SELECT 查询',
    });

    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'DROP TABLE inventory_items' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe(403);
    expect(body.data).toBeNull();
  });

  // ---- SQL execution errors ----

  it('should return 500 for SQL syntax errors', async () => {
    mockValidateAndExecute.mockReturnValue({
      code: 500,
      data: null,
      message: 'SQL 语法错误，请调整查询语句',
    });

    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT INVALID SYNTAX' }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe(500);
    expect(body.message).toContain('SQL');
  });

  it('should pass chartConfig through to the service', async () => {
    mockValidateAndExecute.mockReturnValue({
      code: 0,
      data: { columns: [], rows: [], rowCount: 0, truncated: false, chartType: 'bar', sql: 'SELECT 4 LIMIT 200' },
      message: 'ok',
    });

    const chartConfig = { xKey: 'sku', yKey: 'quantity', xLabel: 'SKU', yLabel: '数量' };
    const res = await fetch(`${baseUrl}/api/inventory/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 4', chartType: 'bar', chartConfig }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockValidateAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({ chartConfig }),
    );
  });
});
