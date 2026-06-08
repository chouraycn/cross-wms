/**
 * Unit tests for src/capabilities/warehouse/warehouseCapabilityStore.ts
 *
 * Tests: read operations (synchronous), write operations (async with API mock),
 * subscribe/notify mechanism, getWarehouseFullView, initFromApi, error dispatching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Polyfill window/CustomEvent/dispatchEvent for non-jsdom test environment
// (warehouseCapabilityStore uses window.dispatchEvent for error reporting)
if (typeof globalThis.window === 'undefined') {
  // Minimal CustomEvent polyfill
  class CustomEventPolyfill<T = unknown> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type, init);
      this.detail = init?.detail as T;
    }
  }
  globalThis.dispatchEvent = vi.fn();
  Object.assign(globalThis, { CustomEvent: CustomEventPolyfill, window: globalThis });
}

// Mock the api module before importing the store
vi.mock('../services/api', () => ({
  getWarehouses: vi.fn(),
  createWarehouse: vi.fn(),
  updateWarehouse: vi.fn(),
  deleteWarehouse: vi.fn(),
  getTransitOrders: vi.fn(),
  createTransitOrder: vi.fn(),
  updateTransitOrder: vi.fn(),
  deleteTransitOrder: vi.fn(),
  getInventoryItems: vi.fn(),
  createInventoryItem: vi.fn(),
  updateInventoryItem: vi.fn(),
  deleteInventoryItem: vi.fn(),
}));

import * as api from '../services/api';
import {
  subscribeCapability,
  subscribeWarehouses,
  getWarehouses,
  getWarehouseById,
  getWarehouseFullView,
  setWarehouses,
  addWarehouse,
  updateWarehouse,
  removeWarehouse,
  resetWarehouses,
  getTransitOrders,
  setTransitOrders,
  addTransitOrder,
  updateTransitOrder,
  removeTransitOrder,
  resetTransitOrders,
  getInventoryItems,
  setInventoryItems,
  addInventoryItem,
  updateInventoryItem,
  removeInventoryItem,
  resetInventoryItems,
  initFromApi,
} from '../capabilities/warehouse/warehouseCapabilityStore';

import type { Warehouse, TransitOrder, InventoryItem } from '../types';

// ====== Test fixtures ======

const mockWarehouse: Warehouse = {
  id: 'wh-1',
  name: 'Test Warehouse',
  country: 'US',
  city: 'NYC',
  totalVolume: 1000,
  usedVolume: 200,
  totalItems: 500,
  usedItems: 100,
  status: 'normal',
  address: '123 Main St',
  manager: 'John',
  phone: '555-0100',
  createdAt: '2024-01-01T00:00:00Z',
};

const mockTransitOrder: TransitOrder = {
  id: 'to-1',
  trackingNo: 'TRK-001',
  fromWarehouseId: 'wh-1',
  toWarehouseId: 'wh-2',
  category: 'Electronics',
  weight: 10,
  volume: 2,
  transportMode: 'sea',
  estimatedArrival: '2024-03-01',
  status: 'in_transit',
  createdAt: '2024-02-01T00:00:00Z',
  statusHistory: [],
  carrier: 'FedEx',
  value: 5000,
};

const mockInventoryItem: InventoryItem = {
  id: 'inv-1',
  sku: 'SKU-001',
  name: 'Test Item',
  warehouseId: 'wh-1',
  quantity: 100,
  volumePerUnit: 0.5,
  totalVolume: 50,
  inboundDate: '2024-01-15',
  valuePerUnit: 10,
  totalValue: 1000,
  category: 'Electronics',
  isAgeWarning: false,
};

// ====== Helpers ======

/** Reset module-level state by resetting all caches to empty */
function resetAllState(): void {
  resetWarehouses();
  resetTransitOrders();
  resetInventoryItems();
}

// ====== Tests ======

beforeEach(() => {
  resetAllState();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===================== Read Operations (sync) =====================

describe('Read operations', () => {
  it('getWarehouses() should return a snapshot copy', () => {
    setWarehouses([mockWarehouse]);

    const result = getWarehouses();
    expect(result).toEqual([mockWarehouse]);

    // Mutating the snapshot should not affect internal state
    result.push({} as Warehouse);
    expect(getWarehouses()).toHaveLength(1);
  });

  it('getWarehouseById() should find warehouse by id', () => {
    setWarehouses([mockWarehouse]);

    const found = getWarehouseById('wh-1');
    expect(found).toEqual(mockWarehouse);

    const notFound = getWarehouseById('nonexistent');
    expect(notFound).toBeUndefined();
  });

  it('getTransitOrders() should return a snapshot copy', () => {
    setTransitOrders([mockTransitOrder]);

    const result = getTransitOrders();
    expect(result).toEqual([mockTransitOrder]);
  });

  it('getInventoryItems() should return a snapshot copy', () => {
    setInventoryItems([mockInventoryItem]);

    const result = getInventoryItems();
    expect(result).toEqual([mockInventoryItem]);
  });

  it('getWarehouseFullView() should return warehouse with related data', () => {
    const wh2 = { ...mockWarehouse, id: 'wh-2' };
    const to2 = { ...mockTransitOrder, id: 'to-2', fromWarehouseId: 'wh-2' };
    const inv2 = { ...mockInventoryItem, id: 'inv-2', warehouseId: 'wh-2' };

    setWarehouses([mockWarehouse, wh2]);
    setTransitOrders([mockTransitOrder, to2]);
    setInventoryItems([mockInventoryItem, inv2]);

    const view = getWarehouseFullView('wh-1');

    expect(view.warehouse).toEqual(mockWarehouse);
    // TransitOrder with fromWarehouseId or toWarehouseId === 'wh-1'
    expect(view.transit).toEqual([mockTransitOrder]);
    // InventoryItem with warehouseId === 'wh-1'
    expect(view.inventory).toEqual([mockInventoryItem]);
  });

  it('getWarehouseFullView() should return undefined warehouse for unknown id', () => {
    const view = getWarehouseFullView('nonexistent');

    expect(view.warehouse).toBeUndefined();
    expect(view.transit).toEqual([]);
    expect(view.inventory).toEqual([]);
  });
});

// ===================== Write Operations (sync setters) =====================

describe('Sync write operations', () => {
  it('setWarehouses() should update cache and notify listeners', () => {
    const listener = vi.fn();
    const unsub = subscribeCapability(listener);

    setWarehouses([mockWarehouse]);

    // listener called once on subscribe + once on setWarehouses
    expect(listener).toHaveBeenCalledTimes(2);
    const lastCall = listener.mock.calls[1][0];
    expect(lastCall.warehouses).toEqual([mockWarehouse]);

    unsub();
  });

  it('resetWarehouses() should clear cache', () => {
    setWarehouses([mockWarehouse]);
    resetWarehouses();

    expect(getWarehouses()).toEqual([]);
  });

  it('setTransitOrders() should update cache and notify listeners', () => {
    const listener = vi.fn();
    const unsub = subscribeCapability(listener);

    setTransitOrders([mockTransitOrder]);

    const lastCall = listener.mock.calls[1][0];
    expect(lastCall.transitOrders).toEqual([mockTransitOrder]);

    unsub();
  });

  it('resetTransitOrders() should clear cache', () => {
    setTransitOrders([mockTransitOrder]);
    resetTransitOrders();

    expect(getTransitOrders()).toEqual([]);
  });

  it('setInventoryItems() should update cache and notify listeners', () => {
    const listener = vi.fn();
    const unsub = subscribeCapability(listener);

    setInventoryItems([mockInventoryItem]);

    const lastCall = listener.mock.calls[1][0];
    expect(lastCall.inventory).toEqual([mockInventoryItem]);

    unsub();
  });

  it('resetInventoryItems() should clear cache', () => {
    setInventoryItems([mockInventoryItem]);
    resetInventoryItems();

    expect(getInventoryItems()).toEqual([]);
  });
});

// ===================== Write Operations (async with API) =====================

describe('Async write operations - Warehouse', () => {
  it('addWarehouse() should call API and update cache', async () => {
    (api.createWarehouse as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockWarehouse);

    await addWarehouse(mockWarehouse);

    expect(api.createWarehouse).toHaveBeenCalledWith(mockWarehouse);
    expect(getWarehouses()).toEqual([mockWarehouse]);
  });

  it('addWarehouse() should dispatch cdf-know-clow-api-error on failure', async () => {
    const error = new Error('Network error');
    (api.createWarehouse as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(addWarehouse(mockWarehouse)).rejects.toThrow('Network error');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cdf-know-clow-api-error',
        detail: { action: 'addWarehouse', error },
      })
    );

    dispatchSpy.mockRestore();
  });

  it('updateWarehouse() should call API and update cache', async () => {
    setWarehouses([mockWarehouse]);
    const updated = { ...mockWarehouse, name: 'Updated WH' };
    (api.updateWarehouse as ReturnType<typeof vi.fn>).mockResolvedValueOnce(updated);

    await updateWarehouse(updated);

    expect(api.updateWarehouse).toHaveBeenCalledWith(mockWarehouse.id, updated);
    expect(getWarehouses()[0].name).toBe('Updated WH');
  });

  it('updateWarehouse() should dispatch error on failure', async () => {
    setWarehouses([mockWarehouse]);
    const error = new Error('Update failed');
    (api.updateWarehouse as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(updateWarehouse(mockWarehouse)).rejects.toThrow('Update failed');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cdf-know-clow-api-error',
        detail: { action: 'updateWarehouse', error },
      })
    );

    dispatchSpy.mockRestore();
  });

  it('removeWarehouse() should call API and remove from cache', async () => {
    setWarehouses([mockWarehouse]);
    (api.deleteWarehouse as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    await removeWarehouse('wh-1');

    expect(api.deleteWarehouse).toHaveBeenCalledWith('wh-1');
    expect(getWarehouses()).toEqual([]);
  });

  it('removeWarehouse() should dispatch error on failure', async () => {
    setWarehouses([mockWarehouse]);
    const error = new Error('Delete failed');
    (api.deleteWarehouse as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(removeWarehouse('wh-1')).rejects.toThrow('Delete failed');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cdf-know-clow-api-error',
        detail: { action: 'removeWarehouse', error },
      })
    );

    dispatchSpy.mockRestore();
  });
});

describe('Async write operations - Transit Orders', () => {
  it('addTransitOrder() should call API and update cache', async () => {
    (api.createTransitOrder as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockTransitOrder);

    await addTransitOrder(mockTransitOrder);

    expect(api.createTransitOrder).toHaveBeenCalledWith(mockTransitOrder);
    expect(getTransitOrders()).toEqual([mockTransitOrder]);
  });

  it('updateTransitOrder() should call API and update cache', async () => {
    setTransitOrders([mockTransitOrder]);
    const updated = { ...mockTransitOrder, status: 'arrived' as const };
    (api.updateTransitOrder as ReturnType<typeof vi.fn>).mockResolvedValueOnce(updated);

    await updateTransitOrder(updated);

    expect(getTransitOrders()[0].status).toBe('arrived');
  });

  it('removeTransitOrder() should call API and remove from cache', async () => {
    setTransitOrders([mockTransitOrder]);
    (api.deleteTransitOrder as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    await removeTransitOrder('to-1');

    expect(getTransitOrders()).toEqual([]);
  });

  it('addTransitOrder() should dispatch error on failure', async () => {
    const error = new Error('Transit API error');
    (api.createTransitOrder as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(addTransitOrder(mockTransitOrder)).rejects.toThrow('Transit API error');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cdf-know-clow-api-error',
        detail: { action: 'addTransitOrder', error },
      })
    );

    dispatchSpy.mockRestore();
  });
});

describe('Async write operations - Inventory', () => {
  it('addInventoryItem() should call API and update cache', async () => {
    (api.createInventoryItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockInventoryItem);

    await addInventoryItem(mockInventoryItem);

    expect(api.createInventoryItem).toHaveBeenCalledWith(mockInventoryItem);
    expect(getInventoryItems()).toEqual([mockInventoryItem]);
  });

  it('updateInventoryItem() should call API and update cache', async () => {
    setInventoryItems([mockInventoryItem]);
    const updated = { ...mockInventoryItem, quantity: 200 };
    (api.updateInventoryItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce(updated);

    await updateInventoryItem(updated);

    expect(getInventoryItems()[0].quantity).toBe(200);
  });

  it('removeInventoryItem() should call API and remove from cache', async () => {
    setInventoryItems([mockInventoryItem]);
    (api.deleteInventoryItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    await removeInventoryItem('inv-1');

    expect(getInventoryItems()).toEqual([]);
  });

  it('addInventoryItem() should dispatch error on failure', async () => {
    const error = new Error('Inventory API error');
    (api.createInventoryItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(addInventoryItem(mockInventoryItem)).rejects.toThrow('Inventory API error');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cdf-know-clow-api-error',
        detail: { action: 'addInventoryItem', error },
      })
    );

    dispatchSpy.mockRestore();
  });
});

// ===================== Subscribe / Notify =====================

describe('Subscribe / Notify mechanism', () => {
  it('subscribeCapability() should call listener immediately with current state', () => {
    const listener = vi.fn();

    const unsub = subscribeCapability(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    const state = listener.mock.calls[0][0];
    expect(state.warehouses).toEqual([]);
    expect(state.transitOrders).toEqual([]);
    expect(state.inventory).toEqual([]);

    unsub();
  });

  it('subscribeCapability() should notify on any data change', () => {
    const listener = vi.fn();
    const unsub = subscribeCapability(listener);

    // Clear the initial call
    listener.mockClear();

    setWarehouses([mockWarehouse]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].warehouses).toEqual([mockWarehouse]);

    setTransitOrders([mockTransitOrder]);
    expect(listener).toHaveBeenCalledTimes(2);

    setInventoryItems([mockInventoryItem]);
    expect(listener).toHaveBeenCalledTimes(3);

    unsub();
  });

  it('subscribeCapability() should not call listener after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = subscribeCapability(listener);

    listener.mockClear();

    unsub();
    setWarehouses([mockWarehouse]);

    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribeCapability() should support multiple listeners', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    const unsub1 = subscribeCapability(listener1);
    const unsub2 = subscribeCapability(listener2);

    listener1.mockClear();
    listener2.mockClear();

    setWarehouses([mockWarehouse]);

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it('subscribeCapability() listener error should not break other listeners', () => {
    let shouldThrow = false;
    const errorListener = vi.fn(() => {
      if (shouldThrow) throw new Error('Listener error');
    });
    const normalListener = vi.fn();

    const unsub1 = subscribeCapability(errorListener);
    const unsub2 = subscribeCapability(normalListener);

    errorListener.mockClear();
    normalListener.mockClear();

    // Enable throwing for the notifyAll() call only
    shouldThrow = true;

    // This should not throw despite errorListener throwing
    setWarehouses([mockWarehouse]);

    // errorListener was called and threw, but normalListener should still be called
    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(normalListener).toHaveBeenCalledTimes(1);

    shouldThrow = false;
    unsub1();
    unsub2();
  });

  it('subscribeWarehouses() should be a convenience wrapper for warehouse-only callback', () => {
    const callback = vi.fn();
    const unsub = subscribeWarehouses(callback);

    // Called immediately with empty array
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toEqual([]);

    callback.mockClear();

    setWarehouses([mockWarehouse]);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toEqual([mockWarehouse]);

    unsub();
  });
});

// ===================== initFromApi =====================

describe('initFromApi()', () => {
  it('should fetch all three data types in parallel and update cache', async () => {
    (api.getWarehouses as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockWarehouse]);
    (api.getTransitOrders as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockTransitOrder]);
    (api.getInventoryItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockInventoryItem]);

    await initFromApi();

    expect(api.getWarehouses).toHaveBeenCalled();
    expect(api.getTransitOrders).toHaveBeenCalled();
    expect(api.getInventoryItems).toHaveBeenCalled();

    expect(getWarehouses()).toEqual([mockWarehouse]);
    expect(getTransitOrders()).toEqual([mockTransitOrder]);
    expect(getInventoryItems()).toEqual([mockInventoryItem]);
  });

  it('should notify listeners after initialization', async () => {
    (api.getWarehouses as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockWarehouse]);
    (api.getTransitOrders as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (api.getInventoryItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const listener = vi.fn();
    const unsub = subscribeCapability(listener);

    listener.mockClear();

    await initFromApi();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].warehouses).toEqual([mockWarehouse]);

    unsub();
  });

  it('should not throw when API fails (error is caught internally)', async () => {
    (api.getWarehouses as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('API down'));

    // Should not throw — error is caught and logged internally
    await expect(initFromApi()).resolves.toBeUndefined();
  });
});
