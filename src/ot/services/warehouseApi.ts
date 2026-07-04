/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Warehouse, InboundRecord, OutboundRecord, InventoryItem } from '../types';
import { mockInboundRecords, mockOutboundRecords, mockInventory } from '../data/mockData';

// ===================== 通用响应格式 =====================

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

// ===================== API 服务类 =====================

class WarehouseApiService {
  private baseUrl: string;

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  // ===================== 仓库详情 =====================

  async getWarehouseById(warehouseId: string): Promise<Warehouse | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/warehouses/${warehouseId}`);
      if (!resp.ok) return null;
      const json: ApiResponse<Warehouse> = await resp.json();
      return json.code === 0 && json.data ? json.data : null;
    } catch (error) {
      // console.warn('[WarehouseAPI] 获取仓库详情失败:', error);
      return null;
    }
  }

  // ===================== 入库记录 =====================

  async getInboundRecords(warehouseId?: string): Promise<InboundRecord[]> {
    try {
      const url = warehouseId
        ? `${this.baseUrl}/inbound?warehouseId=${encodeURIComponent(warehouseId)}`
        : `${this.baseUrl}/inbound`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: ApiResponse<any> = await resp.json();
      if (json.code !== 0 || !json.data) return [];
      // 兼容分页格式 { list: [...] } 或原始数组
      return json.data.list || json.data;
    } catch (error) {
      // console.warn('[WarehouseAPI] 获取入库记录失败，使用 mock 数据:', error);
      return warehouseId
        ? mockInboundRecords.filter(r => r.warehouseId === warehouseId)
        : mockInboundRecords;
    }
  }

  // ===================== 出库记录 =====================

  async getOutboundRecords(warehouseId?: string): Promise<OutboundRecord[]> {
    try {
      const url = warehouseId
        ? `${this.baseUrl}/outbound?warehouseId=${encodeURIComponent(warehouseId)}`
        : `${this.baseUrl}/outbound`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: ApiResponse<any> = await resp.json();
      if (json.code !== 0 || !json.data) return [];
      // 兼容分页格式 { list: [...] } 或原始数组
      return json.data.list || json.data;
    } catch (error) {
      // console.warn('[WarehouseAPI] 获取出库记录失败，使用 mock 数据:', error);
      return warehouseId
        ? mockOutboundRecords.filter(r => r.warehouseId === warehouseId)
        : mockOutboundRecords;
    }
  }

  // ===================== 库存列表 =====================

  async getInventory(warehouseId?: string): Promise<InventoryItem[]> {
    try {
      const url = warehouseId
        ? `${this.baseUrl}/inventory?warehouseId=${encodeURIComponent(warehouseId)}`
        : `${this.baseUrl}/inventory`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: ApiResponse<any> = await resp.json();
      if (json.code !== 0 || !json.data) return [];
      // 兼容 { inventory: [...] } 或 { list: [...] } 或原始数组
      const data = json.data;
      return data.inventory || data.list || data;
    } catch (error) {
      // console.warn('[WarehouseAPI] 获取库存数据失败，使用 mock 数据:', error);
      return warehouseId
        ? mockInventory.filter(i => i.warehouseId === warehouseId)
        : mockInventory;
    }
  }
}

// ===================== 导出单例 =====================

export const warehouseApi = new WarehouseApiService();
export default warehouseApi;
