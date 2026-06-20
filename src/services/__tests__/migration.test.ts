import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock migrate API
const mockMigrate = vi.fn();
vi.mock('../api', () => ({
  migrate: (...args: any[]) => mockMigrate(...args),
}));

import { checkAndMigrate } from '../migration';

const MIGRATED_KEY = 'cdf-know-clow-migrated';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('checkAndMigrate', () => {
  it('should skip when already migrated', async () => {
    localStorage.setItem(MIGRATED_KEY, '1');
    const result = await checkAndMigrate();
    expect(result).toBe(true);
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it('should mark migrated when no data exists', async () => {
    const result = await checkAndMigrate();
    expect(result).toBe(true);
    expect(mockMigrate).not.toHaveBeenCalled();
    expect(localStorage.getItem(MIGRATED_KEY)).toBe('1');
  });

  it('should migrate data and mark success', async () => {
    localStorage.setItem('cdf-know-clow-warehouses', JSON.stringify([{ id: 'wh-1', name: '深圳仓' }]));
    localStorage.setItem('cdf-know-clow-inventory-items', JSON.stringify([{ id: 'inv-1', sku: 'SKU-001' }]));
    mockMigrate.mockResolvedValue({ success: true });

    const result = await checkAndMigrate();
    expect(result).toBe(true);
    expect(mockMigrate).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouses: [{ id: 'wh-1', name: '深圳仓' }],
        inventoryItems: [{ id: 'inv-1', sku: 'SKU-001' }],
      }),
    );
    expect(localStorage.getItem(MIGRATED_KEY)).toBe('1');
  });

  it('should return false on migration failure', async () => {
    localStorage.setItem('cdf-know-clow-warehouses', JSON.stringify([{ id: 'wh-1' }]));
    mockMigrate.mockRejectedValue(new Error('Migration failed'));

    const result = await checkAndMigrate();
    expect(result).toBe(false);
    expect(localStorage.getItem(MIGRATED_KEY)).toBeNull();
  });

  it('should skip corrupted localStorage data', async () => {
    localStorage.setItem('cdf-know-clow-warehouses', 'invalid json');
    localStorage.setItem('cdf-know-clow-inventory-items', JSON.stringify([{ id: 'inv-1' }]));
    mockMigrate.mockResolvedValue({ success: true });

    const result = await checkAndMigrate();
    expect(result).toBe(true);
    // Only valid data should be sent
    expect(mockMigrate).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItems: [{ id: 'inv-1' }],
      }),
    );
    // warehouses should not be in payload (corrupted)
    const payload = mockMigrate.mock.calls[0][0];
    expect(payload.warehouses).toBeUndefined();
  });

  it('should collect all key mappings', async () => {
    localStorage.setItem('cdf-know-clow-warehouses', JSON.stringify([]));
    localStorage.setItem('cdf-know-clow-inventory-items', JSON.stringify([]));
    localStorage.setItem('cdf-know-clow-transit-orders', JSON.stringify([]));
    localStorage.setItem('cdf-know-clow-user-skills', JSON.stringify([]));
    localStorage.setItem('cdf-know-clow-builtin-status-patches', JSON.stringify([]));
    localStorage.setItem('cdf-know-clow-settings', JSON.stringify([]));
    mockMigrate.mockResolvedValue({ success: true });

    await checkAndMigrate();
    const payload = mockMigrate.mock.calls[0][0];
    expect(Object.keys(payload)).toHaveLength(6);
    expect(payload.warehouses).toBeDefined();
    expect(payload.inventoryItems).toBeDefined();
    expect(payload.transitOrders).toBeDefined();
    expect(payload.userSkills).toBeDefined();
    expect(payload.builtinStatusPatches).toBeDefined();
    expect(payload.appSettings).toBeDefined();
  });

  it('should not retry migration after success', async () => {
    localStorage.setItem('cdf-know-clow-warehouses', JSON.stringify([{ id: 'wh-1' }]));
    mockMigrate.mockResolvedValue({ success: true });

    const result1 = await checkAndMigrate();
    expect(result1).toBe(true);
    expect(mockMigrate).toHaveBeenCalledTimes(1);

    // Second call should skip
    const result2 = await checkAndMigrate();
    expect(result2).toBe(true);
    expect(mockMigrate).toHaveBeenCalledTimes(1); // Not called again
  });
});
