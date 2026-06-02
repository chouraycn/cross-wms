/**
 * 仓储能力模块 — Barrel Export
 *
 * 统一导出 warehouseCapabilityStore / dashboardApi / useWarehouseCapability
 * 外部消费者只需从此文件导入即可。
 */

// Store 层
export {
  type WarehouseCapabilityState,
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
} from './warehouseCapabilityStore';

// API 层
export {
  type DataSourceConfig,
  type DocMapping,
  DashboardApiService,
  dashboardApi,
} from './dashboardApi';

// Hook 层
export {
  type WarehouseCapabilityData,
  type UseWarehouseCapabilityOptions,
  useWarehouseCapability,
} from './useWarehouseCapability';
