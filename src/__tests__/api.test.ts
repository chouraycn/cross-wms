/**
 * Unit tests for src/services/api.ts
 *
 * Tests the generic `request()` function, error handling,
 * and all exported API functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock global fetch before importing api module
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
import * as api from '../services/api';

const BASE_URL = 'http://localhost:3001';

/** Helper: create a successful fetch response */
function mockSuccessResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({ code: 0, data, message: 'ok' }),
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: () => ({}) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

/** Helper: create an error fetch response */
function mockErrorResponse(status: number, errorBody: { error?: string; message?: string }): Response {
  return {
    ok: false,
    status,
    statusText: status === 404 ? 'Not Found' : 'Bad Request',
    json: () => Promise.resolve(errorBody),
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: () => ({}) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===================== request() generic tests =====================

describe('api.request (generic)', () => {
  it('should make a GET request with correct URL and headers', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([{ id: '1' }]));

    const result = await api.getWarehouses();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/warehouses`);
    expect(opts.method).toBe('GET');
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(opts.body).toBeUndefined();
    expect(result).toEqual([{ id: '1' }]);
  });

  it('should make a POST request with JSON body', async () => {
    const warehouse = { id: 'w1', name: 'Test Warehouse', country: 'US', city: 'NYC', totalVolume: 100, usedVolume: 0, totalItems: 50, usedItems: 0, status: 'normal' as const, address: '123 Main St', manager: 'John', phone: '555-0100', createdAt: '2024-01-01' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(warehouse));

    await api.createWarehouse(warehouse);

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe(JSON.stringify(warehouse));
  });

  it('should extract .data from API response envelope', async () => {
    const items = [{ id: '1', sku: 'SKU001' }];
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(items));

    const result = await api.getInventoryItems();

    expect(result).toEqual(items);
  });

  it('should fall back to full JSON when .data is absent', async () => {
    const directData = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(directData),
      headers: new Headers(),
      redirected: false,
      type: 'basic' as ResponseType,
      url: '',
      clone: () => ({}) as Response,
      body: null,
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const result = await api.getWarehouses();

    expect(result).toEqual(directData);
  });

  it('should throw Error with error message from API response', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(400, { error: 'Insufficient stock' }));

    await expect(api.createOutboundRecord({} as any)).rejects.toThrow('Insufficient stock');
  });

  it('should throw Error with statusText when API response has no error field', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(500, {}));

    await expect(api.getWarehouses()).rejects.toThrow('API error 500');
  });

  it('should throw Error with statusText when JSON parsing fails on error', async () => {
    const errorResponse: Partial<Response> = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('Invalid JSON')),
      headers: new Headers(),
    };
    mockFetch.mockResolvedValueOnce(errorResponse as Response);

    await expect(api.getWarehouses()).rejects.toThrow('Internal Server Error');
  });
});

// ===================== Warehouse API =====================

describe('Warehouse API', () => {
  it('getWarehouses() should fetch /api/warehouses', async () => {
    const warehouses = [{ id: 'w1', name: 'WH1' }];
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(warehouses));

    const result = await api.getWarehouses();

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/warehouses`);
    expect(result).toEqual(warehouses);
  });

  it('createWarehouse() should POST to /api/warehouses', async () => {
    const wh = { id: 'w2', name: 'New WH' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(wh));

    const result = await api.createWarehouse(wh as any);

    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    expect(result).toEqual(wh);
  });

  it('updateWarehouse() should PUT to /api/warehouses/:id', async () => {
    const wh = { id: 'w1', name: 'Updated' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(wh));

    await api.updateWarehouse('w1', wh as any);

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/warehouses/w1`);
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
  });

  it('deleteWarehouse() should DELETE /api/warehouses/:id', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(null));

    await api.deleteWarehouse('w1');

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/warehouses/w1`);
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

// ===================== Inventory API =====================

describe('Inventory API', () => {
  it('getInventoryItems() without warehouseId should fetch /api/inventory', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

    await api.getInventoryItems();

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inventory`);
  });

  it('getInventoryItems() with warehouseId should add query param', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

    await api.getInventoryItems('wh-1');

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inventory?warehouseId=wh-1`);
  });

  it('createInventoryItem() should POST to /api/inventory', async () => {
    const item = { id: 'i1', sku: 'SKU001' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(item));

    const result = await api.createInventoryItem(item as any);

    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    expect(result).toEqual(item);
  });

  it('updateInventoryItem() should PUT to /api/inventory/:id', async () => {
    const item = { id: 'i1', sku: 'SKU001' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(item));

    await api.updateInventoryItem('i1', item as any);

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inventory/i1`);
  });

  it('deleteInventoryItem() should DELETE /api/inventory/:id', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(null));

    await api.deleteInventoryItem('i1');

    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

// ===================== Transit Orders API =====================

describe('Transit Orders API', () => {
  it('getTransitOrders() without status should fetch /api/transit-orders', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

    await api.getTransitOrders();

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/transit-orders`);
  });

  it('getTransitOrders() with status should add query param', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

    await api.getTransitOrders('in_transit');

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/transit-orders?status=in_transit`);
  });

  it('createTransitOrder() should POST to /api/transit-orders', async () => {
    const order = { id: 't1', trackingNo: 'TRK001' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(order));

    const result = await api.createTransitOrder(order as any);

    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    expect(result).toEqual(order);
  });
});

// ===================== Inbound Records API =====================

describe('Inbound Records API', () => {
  it('getInboundRecords() without warehouseId should fetch /api/inbound-records', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

    await api.getInboundRecords();

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inbound-records`);
  });

  it('getInboundRecords() with warehouseId should add query param', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

    await api.getInboundRecords('wh-1');

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inbound-records?warehouseId=wh-1`);
  });

  it('createInboundRecord() should POST to /api/inbound-records', async () => {
    const record = { id: 'ib1', sku: 'SKU001' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(record));

    await api.createInboundRecord(record as any);

    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('updateInboundRecord() should PUT to /api/inbound-records/:id', async () => {
    const record = { id: 'ib1', status: 'completed' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(record));

    await api.updateInboundRecord('ib1', record as any);

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inbound-records/ib1`);
  });

  it('deleteInboundRecord() should DELETE /api/inbound-records/:id', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(null));

    await api.deleteInboundRecord('ib1');

    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

// ===================== Outbound Records API =====================

describe('Outbound Records API', () => {
  it('getOutboundRecords() without warehouseId should fetch /api/outbound-records', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

    await api.getOutboundRecords();

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/outbound-records`);
  });

  it('getOutboundRecords() with warehouseId should add query param', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

    await api.getOutboundRecords('wh-1');

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/outbound-records?warehouseId=wh-1`);
  });

  it('createOutboundRecord() should POST to /api/outbound-records', async () => {
    const record = { id: 'ob1', sku: 'SKU001' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(record));

    await api.createOutboundRecord(record as any);

    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });
});

// ===================== User Skills API =====================

describe('User Skills API', () => {
  it('getUserSkills() should fetch /api/user-skills', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

    await api.getUserSkills();

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/user-skills`);
  });

  it('createUserSkill() should POST to /api/user-skills', async () => {
    const skill = { id: 's1', name: 'Test Skill' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(skill));

    await api.createUserSkill(skill as any);

    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('updateUserSkill() should PUT to /api/user-skills/:id', async () => {
    const skill = { id: 's1', name: 'Updated' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(skill));

    await api.updateUserSkill('s1', skill as any);

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/user-skills/s1`);
  });

  it('deleteUserSkill() should DELETE /api/user-skills/:id', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(null));

    await api.deleteUserSkill('s1');

    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

// ===================== Builtin Status Patches API =====================

describe('Builtin Status Patches API', () => {
  it('getBuiltinPatches() should fetch /api/builtin-status-patches', async () => {
    const patches = { skill1: 'enabled' };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(patches));

    const result = await api.getBuiltinPatches();

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/builtin-status-patches`);
    expect(result).toEqual(patches);
  });

  it('setBuiltinPatch() should PUT to /api/builtin-status-patches', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(null));

    await api.setBuiltinPatch('skill1', 'enabled');

    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ skillId: 'skill1', status: 'enabled' });
  });

  it('removeBuiltinPatch() should DELETE /api/builtin-status-patches/:skillId', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(null));

    await api.removeBuiltinPatch('skill1');

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/builtin-status-patches/skill1`);
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

// ===================== App Settings API =====================

describe('App Settings API', () => {
  it('getAppSettings() should fetch /api/app-settings/default', async () => {
    const settings = { warningThreshold: 0.8, fullThreshold: 0.95, refreshInterval: 30 };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(settings));

    const result = await api.getAppSettings();

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/app-settings/default`);
    expect(result).toEqual(settings);
  });

  it('getAppSettings() should return null on error', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(404, { error: 'Not found' }));

    const result = await api.getAppSettings();

    expect(result).toBeNull();
  });

  it('updateAppSettings() should PUT to /api/app-settings/default', async () => {
    const settings = { warningThreshold: 0.8, fullThreshold: 0.95, refreshInterval: 30 };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse(null));

    await api.updateAppSettings(settings as any);

    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
  });
});

// ===================== Migration API =====================

describe('Migration API', () => {
  it('migrate() should POST to /api/migrate', async () => {
    const payload: api.MigratePayload = { warehouses: [{ id: 'w1' }] };
    mockFetch.mockResolvedValueOnce(mockSuccessResponse({ success: true }));

    await api.migrate(payload);

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/migrate`);
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(payload);
  });
});
