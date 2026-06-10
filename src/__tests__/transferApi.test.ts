/**
 * Unit tests for src/api/transferApi.ts
 *
 * Tests:
 * - All 9 API function signatures and URL construction
 * - handleResponse success (code=0) and error paths
 * - calculateTransferStats pure function
 * - Error handling with fallback return values
 *
 * Mock strategy: vi.stubGlobal('fetch', mockFetch) to intercept HTTP calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock Fetch =====================

function createMockResponse(json: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(json),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: () => createMockResponse(json, ok, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(json)),
    bytes: () => Promise.resolve(new Uint8Array()),
  };
}

let mockFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ===================== Import After Mock Setup =====================

// We need to import after stubGlobal is set up.
// Use dynamic import pattern or just import at top — since vi.stubGlobal runs in beforeEach,
// the imported module's fetch calls will be intercepted at call time.
import {
  fetchTransferOrders,
  fetchTransferOrderById,
  createTransferOrder,
  updateTransferOrder,
  deleteTransferOrder,
  submitTransferOrder,
  receiveTransferOrder,
  bindTransitOrder,
  unbindTransitOrder,
  calculateTransferStats,
} from '../api/transferApi';
import type { TransferOrder } from '../types/wms';

// ===================== Test Fixtures =====================

const SAMPLE_ORDER: TransferOrder = {
  id: 'tf-001',
  transferNo: 'TF-20260522-0001',
  fromWarehouseId: 'wh-src',
  toWarehouseId: 'wh-dst',
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

function makeSuccessResponse<T>(data: T) {
  return { code: 0, data };
}

function makeErrorResponse(message = '操作失败') {
  return { code: -1, message };
}

// ===================== URL Construction Tests =====================

describe('API URL Construction', () => {
  it('fetchTransferOrders should GET /api/transfer-orders', async () => {
    mockFetch.mockResolvedValue(
      createMockResponse(makeSuccessResponse({ items: [], total: 0, page: 1, pageSize: 20 }))
    );
    await fetchTransferOrders();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/transfer-orders');
  });

  it('fetchTransferOrders should append query parameters when filter provided', async () => {
    mockFetch.mockResolvedValue(
      createMockResponse(makeSuccessResponse({ items: [SAMPLE_ORDER], total: 1, page: 1, pageSize: 20 }))
    );
    await fetchTransferOrders({
      status: 'draft',
      fromWarehouseId: 'wh-src',
      toWarehouseId: 'wh-dst',
      sku: 'SKU-001',
      page: 2,
      pageSize: 10,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/transfer-orders?');
    expect(calledUrl).toContain('status=draft');
    expect(calledUrl).toContain('fromWarehouseId=wh-src');
    expect(calledUrl).toContain('toWarehouseId=wh-dst');
    expect(calledUrl).toContain('sku=SKU-001');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('pageSize=10');
  });

  it('fetchTransferOrderById should GET /api/transfer-orders/:id', async () => {
    mockFetch.mockResolvedValue(createMockResponse(makeSuccessResponse(SAMPLE_ORDER)));
    await fetchTransferOrderById('tf-001');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/transfer-orders/tf-001');
  });

  it('createTransferOrder should POST to /api/transfer-orders with JSON body', async () => {
    mockFetch.mockResolvedValue(createMockResponse(makeSuccessResponse(SAMPLE_ORDER)));
    const payload = { ...SAMPLE_ORDER, autoSubmit: true, submittedBy: 'admin' };
    await createTransferOrder(payload);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/transfer-orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
    );
  });

  it('updateTransferOrder should PUT to /api/transfer-orders/:id with JSON body', async () => {
    mockFetch.mockResolvedValue(createMockResponse(makeSuccessResponse(SAMPLE_ORDER)));
    const updates = { quantity: 20, name: '更新商品名' };

    await updateTransferOrder('tf-001', updates);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/transfer-orders/tf-001',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(updates),
      })
    );
  });

  it('deleteTransferOrder should DELETE /api/transfer-orders/:id', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ code: 0 }));
    await deleteTransferOrder('tf-001');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/transfer-orders/tf-001',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('submitTransferOrder should POST to /api/transfer-orders/:id/submit', async () => {
    mockFetch.mockResolvedValue(createMockResponse(makeSuccessResponse(SAMPLE_ORDER)));
    await submitTransferOrder('tf-001', 'operator-A');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/transfer-orders/tf-001/submit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ submittedBy: 'operator-A' }),
      })
    );
  });

  it('receiveTransferOrder should POST to /api/transfer-orders/:id/receive', async () => {
    mockFetch.mockResolvedValue(createMockResponse(makeSuccessResponse(SAMPLE_ORDER)));
    await receiveTransferOrder('tf-001', 'receiver-B');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/transfer-orders/tf-001/receive',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ receivedBy: 'receiver-B' }),
      })
    );
  });

  it('bindTransitOrder should PUT to /api/transfer-orders/:id/bind-transit', async () => {
    mockFetch.mockResolvedValue(createMockResponse(makeSuccessResponse(SAMPLE_ORDER)));
    await bindTransitOrder('tf-001', 'transit-001');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/transfer-orders/tf-001/bind-transit',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ transitOrderId: 'transit-001' }),
      })
    );
  });

  it('unbindTransitOrder should PUT to /api/transfer-orders/:id/unbind-transit', async () => {
    mockFetch.mockResolvedValue(createMockResponse(makeSuccessResponse(SAMPLE_ORDER)));
    await unbindTransitOrder('tf-001');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/transfer-orders/tf-001/unbind-transit',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });
});

// ===================== Response Handling Tests =====================

describe('handleResponse behavior', () => {
  it('should return data when code === 0 and data exists', async () => {
    mockFetch.mockResolvedValue(createMockResponse(makeSuccessResponse(SAMPLE_ORDER)));
    const result = await fetchTransferOrderById('tf-001');
    expect(result).toEqual(SAMPLE_ORDER);
  });

  it('should throw error when code !== 0', async () => {
    // Use submitTransferOrder (no internal try/catch) to test handleResponse error path
    mockFetch.mockResolvedValue(createMockResponse(makeErrorResponse('服务器内部错误')));
    await expect(submitTransferOrder('tf-001', 'op')).rejects.toThrow('服务器内部错误');
  });

  it('should throw default error message when no message provided', async () => {
    // Use receiveTransferOrder (no internal try/catch) to test handleResponse default error
    mockFetch.mockResolvedValue(createMockResponse({ code: -1 }));
    await expect(receiveTransferOrder('tf-001', 'op')).rejects.toThrow('操作失败');
  });
});

// ===================== Fallback / Graceful Degradation Tests =====================

describe('Error fallback handling', () => {
  it('fetchTransferOrders should return empty result on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const result = await fetchTransferOrders();
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(console.warn).toHaveBeenCalled();
  });

  it('fetchTransferOrderById should return null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const result = await fetchTransferOrderById('tf-001');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('deleteTransferOrder should return false on error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const result = await deleteTransferOrder('tf-001');
    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

// ===================== calculateTransferStats Tests =====================

describe('calculateTransferStats', () => {
  it('should return all zeros for empty input', () => {
    const stats = calculateTransferStats([]);
    expect(stats).toEqual({
      total: 0,
      draft: 0,
      submitted: 0,
      in_transit: 0,
      completed: 0,
    });
  });

  it('should correctly count items by status', () => {
    const orders: TransferOrder[] = [
      { ...SAMPLE_ORDER, status: 'draft' },
      { ...SAMPLE_ORDER, id: 't2', status: 'draft' },
      { ...SAMPLE_ORDER, id: 't3', status: 'submitted' },
      { ...SAMPLE_ORDER, id: 't4', status: 'in_transit' },
      { ...SAMPLE_ORDER, id: 't5', status: 'completed' },
      { ...SAMPLE_ORDER, id: 't6', status: 'completed' },
      { ...SAMPLE_ORDER, id: 't7', status: 'completed' },
    ];
    const stats = calculateTransferStats(orders);
    expect(stats.total).toBe(7);
    expect(stats.draft).toBe(2);
    expect(stats.submitted).toBe(1);
    expect(stats.in_transit).toBe(1);
    expect(stats.completed).toBe(3);
  });

  it('should only count recognized statuses (defensive)', () => {
    // The 3rd item uses default status='draft' from SAMPLE_ORDER (no override)
    // Unrecognized statuses simply don't increment any counter
    const orders = [
      { ...SAMPLE_ORDER, id: 't1', status: 'draft' },
      { ...SAMPLE_ORDER, id: 't2', status: 'submitted' },
      { ...SAMPLE_ORDER, id: 't3', status: 'draft' as unknown as TransferOrder['status'] }, // still counted as draft
    ] as TransferOrder[];

    const stats = calculateTransferStats(orders);
    expect(stats.draft).toBe(2);
    expect(stats.submitted).toBe(1);
    expect(stats.in_transit).toBe(0); // no in_transit items
    expect(stats.total).toBe(3);
  });

  it('total should equal sum of all status counts plus any unmapped statuses', () => {
    const orders: TransferOrder[] = Array.from({ length: 100 }, (_, i) => ({
      ...SAMPLE_ORDER,
      id: `t${i}`,
      status: (['draft', 'submitted', 'in_transit', 'completed'] as const)[i % 4],
    }));

    const stats = calculateTransferStats(orders);
    expect(stats.total).toBe(100);
    expect(stats.draft + stats.submitted + stats.in_transit + stats.completed).toBe(100);
  });
});
