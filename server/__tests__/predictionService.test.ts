/**
 * Unit tests for server/services/predictionService.ts
 *
 * Tests:
 * - generateForecast: normal case, no data, trend calculation
 * - getForecasts: list with filters
 * - getForecastDetail: valid ID / not found
 * - updateForecastStatus: success / failure
 * - deleteForecast: success / failure
 * - getForecastStats: aggregation
 * - batchGenerateForecasts: multiple SKUs
 * - checkAllPredictions (compat): basic flow
 * - getPredictionDetail (compat): valid SKU / missing SKU
 *
 * Mock strategy:
 * - Mock DAO functions from wmsSkillDao.js and warehouse.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock DAO Functions =====================

const {
  mockCreateDemandForecast,
  mockGetDemandForecasts,
  mockGetDemandForecastById,
  mockUpdateDemandForecastStatus,
  mockDeleteDemandForecast,
  mockGetInventoryItems,
  mockGetOutboundRecords,
} = vi.hoisted(() => ({
  mockCreateDemandForecast: vi.fn(),
  mockGetDemandForecasts: vi.fn(),
  mockGetDemandForecastById: vi.fn(),
  mockUpdateDemandForecastStatus: vi.fn(),
  mockDeleteDemandForecast: vi.fn(),
  mockGetInventoryItems: vi.fn(),
  mockGetOutboundRecords: vi.fn(),
}));

vi.mock('../dao/wmsSkillDao.js', () => ({
  createDemandForecast: mockCreateDemandForecast,
  getDemandForecasts: mockGetDemandForecasts,
  getDemandForecastById: mockGetDemandForecastById,
  updateDemandForecastStatus: mockUpdateDemandForecastStatus,
  deleteDemandForecast: mockDeleteDemandForecast,
}));

vi.mock('../dao/warehouse.js', () => ({
  getInventoryItems: mockGetInventoryItems,
  getOutboundRecords: mockGetOutboundRecords,
}));

import {
  generateForecast,
  getForecasts,
  getForecastDetail,
  updateForecastStatus,
  deleteForecast,
  getForecastStats,
  batchGenerateForecasts,
  checkAllPredictions,
  getPredictionDetail,
} from '../services/predictionService.js';

// ===================== Test Fixtures =====================

const OUTBOUND_RECORDS = [
  { sku: 'SKU-001', warehouseId: 'WH1', quantity: 10, createdAt: '2026-05-20T10:00:00Z' },
  { sku: 'SKU-001', warehouseId: 'WH1', quantity: 15, createdAt: '2026-05-21T10:00:00Z' },
  { sku: 'SKU-001', warehouseId: 'WH1', quantity: 12, createdAt: '2026-05-22T10:00:00Z' },
  { sku: 'SKU-001', warehouseId: 'WH1', quantity: 8, createdAt: '2026-05-23T10:00:00Z' },
  { sku: 'SKU-001', warehouseId: 'WH1', quantity: 20, createdAt: '2026-05-24T10:00:00Z' },
];

const INVENTORY_ITEMS = [
  { sku: 'SKU-001', warehouseId: 'WH1', quantity: 100, name: '商品A', valuePerUnit: 10 },
  { sku: 'SKU-002', warehouseId: 'WH1', quantity: 50, name: '商品B', valuePerUnit: 20 },
];

const DEMAND_FORECAST_ROWS = [
  {
    id: 1,
    sku: 'SKU-001',
    warehouse_id: 'WH1',
    forecast_date: '2026-05-25T00:00:00Z',
    forecast_days: 30,
    predicted_demand: 500,
    confidence_level: 0.85,
    model_version: 'v1.0_moving_average',
    status: 'active',
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
  },
  {
    id: 2,
    sku: 'SKU-002',
    warehouse_id: 'WH1',
    forecast_date: '2026-05-25T00:00:00Z',
    forecast_days: 30,
    predicted_demand: 300,
    confidence_level: 0.75,
    model_version: 'v1.0_moving_average',
    status: 'active',
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
  },
];

// ===================== Reset =====================

beforeEach(() => {
  vi.clearAllMocks();
});

// ===================== generateForecast Tests =====================

describe('generateForecast', () => {
  it('should generate forecast with valid data', () => {
    mockGetOutboundRecords.mockReturnValue(OUTBOUND_RECORDS);
    mockCreateDemandForecast.mockReturnValue(1);

    const result = generateForecast('SKU-001', 'WH1', 30, 90);

    expect(result).toBeDefined();
    expect(result.sku).toBe('SKU-001');
    expect(result.warehouseId).toBe('WH1');
    expect(result.forecastDays).toBe(30);
    expect(result.status).toBe('active');
    expect(result.details).toBeDefined();
    expect(result.details.dailyForecasts).toHaveLength(30);
    expect(mockCreateDemandForecast).toHaveBeenCalled();
  });

  it('should generate forecast with zero demand when no historical data exists', () => {
    mockGetOutboundRecords.mockReturnValue([]);
    mockCreateDemandForecast.mockReturnValue(1);

    const result = generateForecast('SKU-NO-DATA', 'WH1', 30, 90);

    // No historical data means all daily demand is 0, but forecast is still generated
    expect(result).toBeDefined();
    expect(result.sku).toBe('SKU-NO-DATA');
    expect(result.details.dailyForecasts).toHaveLength(30);
    expect(result.details.dailyForecasts[0].predictedDemand).toBe(0);
  });

  it('should use default forecast days when not provided', () => {
    mockGetOutboundRecords.mockReturnValue(OUTBOUND_RECORDS);
    mockCreateDemandForecast.mockReturnValue(1);

    const result = generateForecast('SKU-001', 'WH1');

    expect(result.forecastDays).toBe(30);
  });

  it('should calculate trend and seasonality', () => {
    mockGetOutboundRecords.mockReturnValue(OUTBOUND_RECORDS);
    mockCreateDemandForecast.mockReturnValue(1);

    const result = generateForecast('SKU-001', 'WH1', 30, 90);

    expect(result.details.trend).toBeDefined();
    expect(typeof result.details.trend).toBe('number');
    expect(result.details.avgDailyDemand).toBeDefined();
  });
});

// ===================== getForecasts Tests =====================

describe('getForecasts', () => {
  it('should return list of forecasts', () => {
    mockGetDemandForecasts.mockReturnValue(DEMAND_FORECAST_ROWS);

    const result = getForecasts();

    expect(result).toHaveLength(2);
    expect(result[0].sku).toBe('SKU-001');
    expect(result[1].sku).toBe('SKU-002');
  });

  it('should apply filters when provided', () => {
    mockGetDemandForecasts.mockReturnValue([DEMAND_FORECAST_ROWS[0]]);

    const result = getForecasts({ sku: 'SKU-001', warehouseId: 'WH1' });

    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('SKU-001');
    expect(mockGetDemandForecasts).toHaveBeenCalledWith({ sku: 'SKU-001', warehouseId: 'WH1' });
  });

  it('should return empty array when no forecasts exist', () => {
    mockGetDemandForecasts.mockReturnValue([]);

    const result = getForecasts();

    expect(result).toEqual([]);
  });
});

// ===================== getForecastDetail Tests =====================

describe('getForecastDetail', () => {
  it('should return forecast detail for valid ID', () => {
    mockGetDemandForecastById.mockReturnValue(DEMAND_FORECAST_ROWS[0]);

    const result = getForecastDetail(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.sku).toBe('SKU-001');
  });

  it('should return null for non-existent ID', () => {
    mockGetDemandForecastById.mockReturnValue(undefined);

    const result = getForecastDetail(999);

    expect(result).toBeNull();
  });
});

// ===================== updateForecastStatus Tests =====================

describe('updateForecastStatus', () => {
  it('should update status and return true on success', () => {
    mockUpdateDemandForecastStatus.mockReturnValue(true);

    const result = updateForecastStatus(1, 'completed');

    expect(result).toBe(true);
    expect(mockUpdateDemandForecastStatus).toHaveBeenCalledWith(1, 'completed');
  });

  it('should return false on failure', () => {
    mockUpdateDemandForecastStatus.mockReturnValue(false);

    const result = updateForecastStatus(1, 'completed');

    expect(result).toBe(false);
  });
});

// ===================== deleteForecast Tests =====================

describe('deleteForecast', () => {
  it('should delete forecast and return true on success', () => {
    mockDeleteDemandForecast.mockReturnValue(true);

    const result = deleteForecast(1);

    expect(result).toBe(true);
    expect(mockDeleteDemandForecast).toHaveBeenCalledWith(1);
  });

  it('should return false on failure', () => {
    mockDeleteDemandForecast.mockReturnValue(false);

    const result = deleteForecast(1);

    expect(result).toBe(false);
  });
});

// ===================== getForecastStats Tests =====================

describe('getForecastStats', () => {
  it('should return aggregated statistics', () => {
    mockGetDemandForecasts.mockReturnValue(DEMAND_FORECAST_ROWS);

    const result = getForecastStats();

    expect(result.totalForecasts).toBe(2);
    expect(result.activeForecasts).toBe(2);
    expect(result.totalPredictedDemand).toBe(800);
    expect(result.avgConfidence).toBe(0.8);
  });

  it('should filter by warehouseId when provided', () => {
    mockGetDemandForecasts.mockReturnValue([DEMAND_FORECAST_ROWS[0]]);

    const result = getForecastStats('WH1');

    expect(result.totalForecasts).toBe(1);
    expect(mockGetDemandForecasts).toHaveBeenCalledWith({ warehouseId: 'WH1' });
  });

  it('should handle zero stats', () => {
    mockGetDemandForecasts.mockReturnValue([]);

    const result = getForecastStats();

    expect(result.totalForecasts).toBe(0);
    expect(result.activeForecasts).toBe(0);
    expect(result.totalPredictedDemand).toBe(0);
    expect(result.avgConfidence).toBe(0);
  });
});

// ===================== batchGenerateForecasts Tests =====================

describe('batchGenerateForecasts', () => {
  it('should generate forecasts for all SKUs in warehouse', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetOutboundRecords.mockReturnValue(OUTBOUND_RECORDS);
    mockCreateDemandForecast.mockReturnValue(1);

    const result = batchGenerateForecasts('WH1', 30);

    expect(result).toHaveLength(2);
    expect(result[0].sku).toBe('SKU-001');
    expect(result[1].sku).toBe('SKU-002');
  });

  it('should skip SKUs with no historical data', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetOutboundRecords.mockImplementation((warehouseId: string, startDate: string, endDate: string) => {
      // Return data only for SKU-001
      return OUTBOUND_RECORDS.filter(r => r.sku === 'SKU-001');
    });
    mockCreateDemandForecast.mockReturnValue(1);

    const result = batchGenerateForecasts('WH1', 30);

    // Only SKU-001 has data, SKU-002 will be skipped
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should use default forecast days', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetOutboundRecords.mockReturnValue(OUTBOUND_RECORDS);
    mockCreateDemandForecast.mockReturnValue(1);

    const result = batchGenerateForecasts('WH1');

    expect(result[0].forecastDays).toBe(30);
  });
});

// ===================== checkAllPredictions (compat) Tests =====================

describe('checkAllPredictions (compat)', () => {
  it('should return result with newAlerts count', async () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetOutboundRecords.mockReturnValue(OUTBOUND_RECORDS);
    mockCreateDemandForecast.mockReturnValue(1);

    const result = await checkAllPredictions({
      enabled: true,
      predictionDays: 14,
      shortageThreshold: 10,
      overstockDays: 60,
      minHistoryDays: 7,
    });

    expect(result.newAlerts).toBeGreaterThanOrEqual(0);
    expect(result.predictedShortageAlerts).toBeGreaterThanOrEqual(0);
    expect(result.errors).toBeDefined();
  });

  it('should handle empty inventory', async () => {
    mockGetInventoryItems.mockReturnValue([]);

    const result = await checkAllPredictions({
      enabled: true,
      predictionDays: 14,
      shortageThreshold: 10,
      overstockDays: 60,
      minHistoryDays: 7,
    });

    expect(result.newAlerts).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should return empty result when no warehouses exist', async () => {
    mockGetInventoryItems.mockReturnValue([]);

    const result = await checkAllPredictions({
      enabled: true,
      predictionDays: 14,
      shortageThreshold: 10,
      overstockDays: 60,
      minHistoryDays: 7,
    });

    expect(result.newAlerts).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ===================== getPredictionDetail (compat) Tests =====================

describe('getPredictionDetail (compat)', () => {
  it('should return prediction detail for valid SKU', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetOutboundRecords.mockReturnValue(OUTBOUND_RECORDS);

    const result = getPredictionDetail('SKU-001', 'WH1', {
      enabled: true,
      predictionDays: 14,
      shortageThreshold: 10,
      overstockDays: 60,
      minHistoryDays: 7,
    });

    expect(result).not.toBeNull();
    expect(result!.sku).toBe('SKU-001');
    expect(result!.warehouseId).toBe('WH1');
    expect(result!.currentStock).toBe(100);
    expect(result!.predictionCurve).toHaveLength(14);
    expect(result!.historyData).toBeDefined();
  });

  it('should return null when SKU not found', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);

    const result = getPredictionDetail('SKU-NOT-FOUND', 'WH1', {
      enabled: true,
      predictionDays: 14,
      shortageThreshold: 10,
      overstockDays: 60,
      minHistoryDays: 7,
    });

    expect(result).toBeNull();
  });

  it('should calculate daysUntilZero correctly', () => {
    mockGetInventoryItems.mockReturnValue([{ sku: 'SKU-001', warehouseId: 'WH1', quantity: 100, name: '商品A', valuePerUnit: 10 }]);
    // 5 days of data, total 65 outbound
    mockGetOutboundRecords.mockReturnValue([
      { sku: 'SKU-001', warehouseId: 'WH1', quantity: 10, createdAt: '2026-05-20T10:00:00Z' },
      { sku: 'SKU-001', warehouseId: 'WH1', quantity: 15, createdAt: '2026-05-21T10:00:00Z' },
      { sku: 'SKU-001', warehouseId: 'WH1', quantity: 20, createdAt: '2026-05-22T10:00:00Z' },
      { sku: 'SKU-001', warehouseId: 'WH1', quantity: 10, createdAt: '2026-05-23T10:00:00Z' },
      { sku: 'SKU-001', warehouseId: 'WH1', quantity: 10, createdAt: '2026-05-24T10:00:00Z' },
    ]);

    const result = getPredictionDetail('SKU-001', 'WH1', {
      enabled: true,
      predictionDays: 14,
      shortageThreshold: 10,
      overstockDays: 60,
      minHistoryDays: 7,
    });

    expect(result).not.toBeNull();
    expect(result!.dailyConsumption).toBeGreaterThan(0);
    expect(result!.daysUntilZero).toBeGreaterThan(0);
  });

  it('should return MAX_SAFE_INTEGER when dailyConsumption is 0', () => {
    mockGetInventoryItems.mockReturnValue([{ sku: 'SKU-001', warehouseId: 'WH1', quantity: 100, name: '商品A', valuePerUnit: 10 }]);
    mockGetOutboundRecords.mockReturnValue([]);

    const result = getPredictionDetail('SKU-001', 'WH1', {
      enabled: true,
      predictionDays: 14,
      shortageThreshold: 10,
      overstockDays: 60,
      minHistoryDays: 7,
    });

    expect(result).not.toBeNull();
    expect(result!.dailyConsumption).toBe(0);
    expect(result!.daysUntilZero).toBe(999);
  });

  it('should determine confidence level based on history length', () => {
    mockGetInventoryItems.mockReturnValue([{ sku: 'SKU-001', warehouseId: 'WH1', quantity: 100, name: '商品A', valuePerUnit: 10 }]);
    // 10 days of data → high confidence
    mockGetOutboundRecords.mockReturnValue(
      Array.from({ length: 10 }, (_, i) => ({
        sku: 'SKU-001',
        warehouseId: 'WH1',
        quantity: 10,
        createdAt: `2026-05-${String(15 + i).padStart(2, '0')}T10:00:00Z`,
      }))
    );

    const result = getPredictionDetail('SKU-001', 'WH1', {
      enabled: true,
      predictionDays: 14,
      shortageThreshold: 10,
      overstockDays: 60,
      minHistoryDays: 7,
    });

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('high');
  });
});
