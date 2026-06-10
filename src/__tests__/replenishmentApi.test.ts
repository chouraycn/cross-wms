/**
 * Unit tests for src/api/replenishmentApi.ts
 *
 * Tests:
 * - fetchReplenishmentSuggestions: success with filters, success without filters, fetch error → safe default
 * - generateReplenishmentSuggestions: success, fetch error → safe default
 * - updateSuggestionStatus: success, fetch error → null
 * - createTransferFromSuggestion: success, fetch error → null
 * - fetchSourceRecommendations: success, fetch error → empty array
 * - handleResponse (indirect): code=0 + data present → success, code≠0 → throws, data=null → throws
 *
 * Mock strategy:
 * - global.fetch is mocked via vi.fn()
 * - Each test constructs a mock Response object with json() returning ApiResponse<T>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  fetchReplenishmentSuggestions,
  generateReplenishmentSuggestions,
  updateSuggestionStatus,
  createTransferFromSuggestion,
  fetchSourceRecommendations,
} from '../api/replenishmentApi';

import type {
  ReplenishmentSuggestion,
  SourceRecommendation,
} from '../types/wms';

// ===================== Helpers =====================

function mockFetchResponse<T>(data: T, code: number = 0, message?: string) {
  const body = { code, data, message };
  return {
    ok: code === 0,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function mockFetchError() {
  return {
    ok: false,
    json: vi.fn().mockRejectedValue(new Error('Network error')),
  } as unknown as Response;
}

const BASE_URL = '/api/wms/replenishment';

// ===================== Test Fixtures =====================

const MOCK_SUGGESTION: ReplenishmentSuggestion = {
  id: 1,
  sku: 'SKU-001',
  warehouseId: 'wh-A',
  currentStock: 50,
  inTransitQty: 0,
  safetyStock: 10,
  dailyConsumption: 10,
  targetStock: 140,
  suggestedQty: 90,
  priority: 'medium',
  status: 'pending',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
};

const MOCK_PAGINATED = {
  items: [MOCK_SUGGESTION],
  total: 1,
  page: 1,
  pageSize: 20,
};

const MOCK_SOURCE_RECOMMENDATION: SourceRecommendation = {
  warehouseId: 'wh-B',
  warehouseName: '仓库B',
  surplus: 80,
  score: 2,
};

// ===================== Reset =====================

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ===================== fetchReplenishmentSuggestions Tests =====================

describe('fetchReplenishmentSuggestions', () => {
  it('should fetch suggestions without filters', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(MOCK_PAGINATED)
    );

    const result = await fetchReplenishmentSuggestions();

    expect(global.fetch).toHaveBeenCalledWith(BASE_URL);
    expect(result).toEqual(MOCK_PAGINATED);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should pass filters as URL query parameters', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(MOCK_PAGINATED)
    );

    await fetchReplenishmentSuggestions({
      status: 'pending',
      priority: 'critical',
      warehouseId: 'wh-A',
      sku: 'SKU',
      page: 2,
      pageSize: 10,
    });

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('status=pending');
    expect(calledUrl).toContain('priority=critical');
    expect(calledUrl).toContain('warehouseId=wh-A');
    expect(calledUrl).toContain('sku=SKU');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('pageSize=10');
  });

  it('should include includeStats parameter when set to true', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(MOCK_PAGINATED)
    );

    await fetchReplenishmentSuggestions({ includeStats: true });

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('includeStats=true');
  });

  it('should return safe default on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchReplenishmentSuggestions();

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('should throw when API returns non-zero code', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(null, 1, '服务器内部错误')
    );

    const result = await fetchReplenishmentSuggestions();

    // handleResponse throws → caught by try/catch → safe default
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});

// ===================== generateReplenishmentSuggestions Tests =====================

describe('generateReplenishmentSuggestions', () => {
  it('should POST to /generate and return created suggestions', async () => {
    const generateResult = { created: 2, suggestions: [MOCK_SUGGESTION] };
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(generateResult)
    );

    const result = await generateReplenishmentSuggestions({ coverDays: 14 });

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/generate`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(result.created).toBe(2);
    expect(result.suggestions).toHaveLength(1);
  });

  it('should send empty object body when no config provided', async () => {
    const generateResult = { created: 0, suggestions: [] };
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(generateResult)
    );

    await generateReplenishmentSuggestions();

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].body).toBe(JSON.stringify({}));
  });

  it('should return safe default on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await generateReplenishmentSuggestions();

    expect(result).toEqual({ created: 0, suggestions: [] });
  });
});

// ===================== updateSuggestionStatus Tests =====================

describe('updateSuggestionStatus', () => {
  it('should PUT to /:id/status and return updated suggestion', async () => {
    const updatedSuggestion = { ...MOCK_SUGGESTION, status: 'ignored' as const };
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(updatedSuggestion)
    );

    const result = await updateSuggestionStatus(1, 'ignored');

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/1/status`,
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ignored' }),
      })
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe('ignored');
  });

  it('should return null on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await updateSuggestionStatus(1, 'ignored');

    expect(result).toBeNull();
  });

  it('should return null when API returns error code', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(null, 1, '更新失败')
    );

    const result = await updateSuggestionStatus(1, 'ignored');

    // handleResponse throws → caught → null
    expect(result).toBeNull();
  });
});

// ===================== createTransferFromSuggestion Tests =====================

describe('createTransferFromSuggestion', () => {
  it('should POST to /:id/transfer and return suggestion with transferOrderId', async () => {
    const transferResult = {
      suggestion: { ...MOCK_SUGGESTION, status: 'confirmed' as const },
      transferOrderId: 'tf-new-001',
    };
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(transferResult)
    );

    const result = await createTransferFromSuggestion(1, {
      fromWarehouseId: 'wh-source',
      quantity: 90,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/1/transfer`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWarehouseId: 'wh-source', quantity: 90 }),
      })
    );
    expect(result).not.toBeNull();
    expect(result!.suggestion.status).toBe('confirmed');
    expect(result!.transferOrderId).toBe('tf-new-001');
  });

  it('should return null on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await createTransferFromSuggestion(1, {
      fromWarehouseId: 'wh-source',
      quantity: 10,
    });

    expect(result).toBeNull();
  });
});

// ===================== fetchSourceRecommendations Tests =====================

describe('fetchSourceRecommendations', () => {
  it('should GET /:id/sources and return recommendations', async () => {
    const recommendations = [MOCK_SOURCE_RECOMMENDATION];
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(recommendations)
    );

    const result = await fetchSourceRecommendations(1);

    expect(global.fetch).toHaveBeenCalledWith(`${BASE_URL}/1/sources`);
    expect(result).toHaveLength(1);
    expect(result[0].warehouseId).toBe('wh-B');
    expect(result[0].surplus).toBe(80);
  });

  it('should return empty array on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchSourceRecommendations(1);

    expect(result).toEqual([]);
  });
});

// ===================== handleResponse (indirect) Tests =====================

describe('handleResponse (indirect via API calls)', () => {
  it('should throw when API returns non-zero code', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 1, data: null, message: '操作失败' }),
    });

    // This will be caught by the try/catch in the API function
    const result = await updateSuggestionStatus(1, 'ignored');
    expect(result).toBeNull();
  });

  it('should throw when data is null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 0, data: null, message: '' }),
    });

    const result = await updateSuggestionStatus(1, 'ignored');
    expect(result).toBeNull();
  });

  it('should throw when data is undefined', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 0, data: undefined, message: '' }),
    });

    const result = await updateSuggestionStatus(1, 'ignored');
    expect(result).toBeNull();
  });

  it('should succeed when code is 0 and data is valid', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse(MOCK_SUGGESTION)
    );

    const result = await updateSuggestionStatus(1, 'pending');
    expect(result).not.toBeNull();
    expect(result!.sku).toBe('SKU-001');
  });

  it('should use default error message when message is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 500, data: null, message: '' }),
    });

    // handleResponse will throw "操作失败" (default message)
    const result = await fetchSourceRecommendations(1);
    expect(result).toEqual([]);
  });
});
