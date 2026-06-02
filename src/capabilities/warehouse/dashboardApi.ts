/**
 * 仪表盘 API 服务层
 *
 * 封装所有仪表盘数据的 API 调用，支持三种数据源模式：
 * - mock: 使用本地 mock 数据（开发/演示模式）
 * - api: 从后端 API 获取数据
 * - tencent-docs: 从腾讯文档获取数据
 *
 * 所有方法都有 try-catch 保护，API 调用失败自动 fallback 到 mock 数据
 *
 * 从 src/services/dashboardApi.ts 迁移而来，更新了 import 路径
 */

import type {
  Warehouse,
  TransitOrder,
  InventoryItem,
  VolumeHistoryPoint,
  InboundRecord,
  OutboundRecord,
  KpiData,
} from '../../types';

import {
  mockWarehouses,
  mockTransitOrders,
  mockInventory,
  mockVolumeHistory,
  mockInboundRecords,
  mockOutboundRecords,
  kpiData as mockKpiData,
  transitStatusDistribution as mockTransitStatusDistribution,
} from '../../data/mockData';
import { calcOverallByVolume } from '../../utils/volumeCalculator';

import {
  isPyWebView,
  getSheetContent,
} from '../../services/tencentDocsApi';

// ===================== 配置接口 =====================

export interface DataSourceConfig {
  mode: 'mock' | 'api' | 'tencent-docs';
  apiBaseUrl?: string;
  docMappings?: DocMapping;
}

export interface DocMapping {
  warehouses?: string;      // 仓库数据文档 ID
  transitOrders?: string;   // 在途订单文档 ID
  inventory?: string;        // 库存数据文档 ID
  volumeHistory?: string;    // 容积历史文档 ID
  inboundRecords?: string;   // 入库记录文档 ID
  outboundRecords?: string;  // 出库记录文档 ID
  inboundTrend?: string;     // 入库趋势文档 ID
  outboundTrend?: string;    // 出库趋势文档 ID
}

// ===================== LocalStorage 持久化 =====================

const STORAGE_KEY = 'crosswms_datasource_config';

function loadConfigFromStorage(): Partial<DataSourceConfig> | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as Partial<DataSourceConfig>;
    }
  } catch (error) {
    console.warn('读取数据源配置失败:', error);
  }
  return null;
}

function saveConfigToStorage(config: DataSourceConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('保存数据源配置失败:', error);
  }
}

// ===================== API 服务类 =====================

export class DashboardApiService {
  private config: DataSourceConfig;

  constructor(config?: Partial<DataSourceConfig>) {
    // 优先从 localStorage 加载配置
    const storedConfig = loadConfigFromStorage();

    this.config = {
      mode: 'mock',
      apiBaseUrl: '/api',
      docMappings: {},
      ...config,
      ...storedConfig,  // localStorage 配置优先
    };
  }

  /**
   * 更新数据源配置并持久化到 localStorage
   */
  setConfig(config: Partial<DataSourceConfig>) {
    this.config = { ...this.config, ...config };
    saveConfigToStorage(this.config);
  }

  getConfig(): DataSourceConfig {
    return { ...this.config };
  }

  // ===================== 仓库数据 =====================

  async getWarehouses(): Promise<Warehouse[]> {
    if (this.config.mode === 'mock') {
      return mockWarehouses;
    }

    if (this.config.mode === 'tencent-docs') {
      try {
        return await this.fetchWarehousesFromDocs();
      } catch (error) {
        console.warn('从腾讯文档获取仓库数据失败，回退到 mock 数据:', error);
        return mockWarehouses;
      }
    }

    // API 模式
    try {
      const response = await this.fetchFromApi<Warehouse[]>('/warehouses');
      return response;
    } catch (error) {
      console.warn('从 API 获取仓库数据失败，回退到 mock 数据:', error);
      return mockWarehouses;
    }
  }

  private async fetchWarehousesFromDocs(): Promise<Warehouse[]> {
    if (!isPyWebView()) {
      throw new Error('腾讯文档模式仅在 pywebview 环境中可用');
    }

    const fileId = this.config.docMappings?.warehouses;
    if (!fileId) {
      throw new Error('未配置仓库数据文档 ID');
    }

    const result = await getSheetContent(fileId, 'default', 'A2:Z100');

    if (!result.gridData?.rows) {
      throw new Error('腾讯文档返回数据格式错误');
    }

    const warehouses: Warehouse[] = result.gridData.rows.map((row, index) => {
      const cells = row.values || [];
      return {
        id: cells[0]?.cellValue?.text || `wh-doc-${index}`,
        name: cells[1]?.cellValue?.text || '未知仓库',
        country: cells[2]?.cellValue?.text || '',
        city: cells[3]?.cellValue?.text || '',
        totalVolume: parseFloat(cells[4]?.cellValue?.text || '0'),
        usedVolume: parseFloat(cells[5]?.cellValue?.text || '0'),
        totalItems: parseInt(cells[6]?.cellValue?.text || '0', 10),
        usedItems: parseInt(cells[7]?.cellValue?.text || '0', 10),
        status: (cells[8]?.cellValue?.text as Warehouse['status']) || 'normal',
        address: cells[9]?.cellValue?.text || '',
        manager: cells[10]?.cellValue?.text || '',
        phone: cells[11]?.cellValue?.text || '',
        createdAt: cells[12]?.cellValue?.text || '',
      };
    });

    return warehouses.filter(w => w.id && w.name !== '未知仓库');
  }

  // ===================== 在途订单 =====================

  async getTransitOrders(): Promise<TransitOrder[]> {
    if (this.config.mode === 'mock') {
      return mockTransitOrders;
    }

    if (this.config.mode === 'tencent-docs') {
      try {
        return await this.fetchTransitOrdersFromDocs();
      } catch (error) {
        console.warn('从腾讯文档获取在途订单失败，回退到 mock 数据:', error);
        return mockTransitOrders;
      }
    }

    try {
      return await this.fetchFromApi<TransitOrder[]>('/transit-orders');
    } catch (error) {
      console.warn('从 API 获取在途订单失败，回退到 mock 数据:', error);
      return mockTransitOrders;
    }
  }

  private async fetchTransitOrdersFromDocs(): Promise<TransitOrder[]> {
    if (!isPyWebView()) {
      throw new Error('腾讯文档模式仅在 pywebview 环境中可用');
    }

    const fileId = this.config.docMappings?.transitOrders;
    if (!fileId) {
      throw new Error('未配置在途订单文档 ID');
    }

    const result = await getSheetContent(fileId, 'default', 'A2:Z200');

    if (!result.gridData?.rows) {
      throw new Error('腾讯文档返回数据格式错误');
    }

    return result.gridData.rows.map((row, index) => {
      const cells = row.values || [];
      return {
        id: cells[0]?.cellValue?.text || `tr-doc-${index}`,
        trackingNo: cells[1]?.cellValue?.text || '',
        fromWarehouseId: cells[2]?.cellValue?.text || '',
        toWarehouseId: cells[3]?.cellValue?.text || '',
        category: cells[4]?.cellValue?.text || '',
        weight: parseFloat(cells[5]?.cellValue?.text || '0'),
        volume: parseFloat(cells[6]?.cellValue?.text || '0'),
        transportMode: (cells[7]?.cellValue?.text as TransitOrder['transportMode']) || 'sea',
        estimatedArrival: cells[8]?.cellValue?.text || '',
        actualArrival: cells[9]?.cellValue?.text || undefined,
        status: (cells[10]?.cellValue?.text as TransitOrder['status']) || 'dispatched',
        createdAt: cells[11]?.cellValue?.text || '',
        statusHistory: [],
        carrier: cells[12]?.cellValue?.text || '',
        value: parseFloat(cells[13]?.cellValue?.text || '0'),
      };
    }).filter(order => !!order.id && !!order.trackingNo) as TransitOrder[];
  }

  // ===================== 库存数据 =====================

  async getInventory(): Promise<InventoryItem[]> {
    if (this.config.mode === 'mock') {
      return mockInventory;
    }

    if (this.config.mode === 'tencent-docs') {
      try {
        return await this.fetchInventoryFromDocs();
      } catch (error) {
        console.warn('从腾讯文档获取库存数据失败，回退到 mock 数据:', error);
        return mockInventory;
      }
    }

    try {
      return await this.fetchFromApi<InventoryItem[]>('/inventory');
    } catch (error) {
      console.warn('从 API 获取库存数据失败，回退到 mock 数据:', error);
      return mockInventory;
    }
  }

  private async fetchInventoryFromDocs(): Promise<InventoryItem[]> {
    if (!isPyWebView()) {
      throw new Error('腾讯文档模式仅在 pywebview 环境中可用');
    }

    const fileId = this.config.docMappings?.inventory;
    if (!fileId) {
      throw new Error('未配置库存数据文档 ID');
    }

    const result = await getSheetContent(fileId, 'default', 'A2:Z500');

    if (!result.gridData?.rows) {
      throw new Error('腾讯文档返回数据格式错误');
    }

    return result.gridData.rows.map((row, index) => {
      const cells = row.values || [];
      return {
        id: cells[0]?.cellValue?.text || `inv-doc-${index}`,
        sku: cells[1]?.cellValue?.text || '',
        name: cells[2]?.cellValue?.text || '',
        warehouseId: cells[3]?.cellValue?.text || '',
        quantity: parseInt(cells[4]?.cellValue?.text || '0', 10),
        volumePerUnit: parseFloat(cells[5]?.cellValue?.text || '0'),
        totalVolume: parseFloat(cells[6]?.cellValue?.text || '0'),
        inboundDate: cells[7]?.cellValue?.text || '',
        valuePerUnit: parseFloat(cells[8]?.cellValue?.text || '0'),
        totalValue: parseFloat(cells[9]?.cellValue?.text || '0'),
        category: cells[10]?.cellValue?.text || '',
        isAgeWarning: cells[11]?.cellValue?.text === 'true',
      };
    }).filter((item): item is InventoryItem => !!item.id);
  }

  // ===================== 容积历史 =====================

  async getVolumeHistory(): Promise<VolumeHistoryPoint[]> {
    if (this.config.mode === 'mock') {
      return mockVolumeHistory;
    }

    if (this.config.mode === 'tencent-docs') {
      try {
        return await this.fetchVolumeHistoryFromDocs();
      } catch (error) {
        console.warn('从腾讯文档获取容积历史失败，回退到 mock 数据:', error);
        return mockVolumeHistory;
      }
    }

    try {
      return await this.fetchFromApi<VolumeHistoryPoint[]>('/volume-history');
    } catch (error) {
      console.warn('从 API 获取容积历史失败，回退到 mock 数据:', error);
      return mockVolumeHistory;
    }
  }

  private async fetchVolumeHistoryFromDocs(): Promise<VolumeHistoryPoint[]> {
    if (!isPyWebView()) {
      throw new Error('腾讯文档模式仅在 pywebview 环境中可用');
    }

    const fileId = this.config.docMappings?.volumeHistory;
    if (!fileId) {
      throw new Error('未配置容积历史文档 ID');
    }

    const result = await getSheetContent(fileId, 'default', 'A2:B100');

    if (!result.gridData?.rows) {
      throw new Error('腾讯文档返回数据格式错误');
    }

    return result.gridData.rows.map((row) => {
      const cells = row.values || [];
      return {
        date: cells[0]?.cellValue?.text || '',
        utilizationRate: parseFloat(cells[1]?.cellValue?.text || '0'),
      };
    }).filter((point): point is VolumeHistoryPoint => !!point.date);
  }

  // ===================== 入库记录 =====================

  async getInboundRecords(): Promise<InboundRecord[]> {
    if (this.config.mode === 'mock') {
      return mockInboundRecords;
    }

    if (this.config.mode === 'tencent-docs') {
      try {
        return await this.fetchInboundRecordsFromDocs();
      } catch (error) {
        console.warn('从腾讯文档获取入库记录失败，回退到 mock 数据:', error);
        return mockInboundRecords;
      }
    }

    try {
      return await this.fetchFromApi<InboundRecord[]>('/inbound-records');
    } catch (error) {
      console.warn('从 API 获取入库记录失败，回退到 mock 数据:', error);
      return mockInboundRecords;
    }
  }

  private async fetchInboundRecordsFromDocs(): Promise<InboundRecord[]> {
    if (!isPyWebView()) {
      throw new Error('腾讯文档模式仅在 pywebview 环境中可用');
    }

    const fileId = this.config.docMappings?.inboundRecords;
    if (!fileId) {
      throw new Error('未配置入库记录文档 ID');
    }

    const result = await getSheetContent(fileId, 'default', 'A2:Z100');

    if (!result.gridData?.rows) {
      throw new Error('腾讯文档返回数据格式错误');
    }

    return result.gridData.rows.map((row, index) => {
      const cells = row.values || [];
      return {
        id: cells[0]?.cellValue?.text || `in-doc-${index}`,
        warehouseId: cells[1]?.cellValue?.text || '',
        sku: cells[2]?.cellValue?.text || '',
        name: cells[3]?.cellValue?.text || '',
        quantity: parseInt(cells[4]?.cellValue?.text || '0', 10),
        volume: parseFloat(cells[5]?.cellValue?.text || '0'),
        createdAt: cells[6]?.cellValue?.text || '',
        operator: cells[7]?.cellValue?.text || '',
        status: (cells[8]?.cellValue?.text as InboundRecord['status']) || 'pending',
      };
    }).filter((record): record is InboundRecord => !!record.id);
  }

  // ===================== 出库记录 =====================

  async getOutboundRecords(): Promise<OutboundRecord[]> {
    if (this.config.mode === 'mock') {
      return mockOutboundRecords;
    }

    if (this.config.mode === 'tencent-docs') {
      try {
        return await this.fetchOutboundRecordsFromDocs();
      } catch (error) {
        console.warn('从腾讯文档获取出库记录失败，回退到 mock 数据:', error);
        return mockOutboundRecords;
      }
    }

    try {
      return await this.fetchFromApi<OutboundRecord[]>('/outbound-records');
    } catch (error) {
      console.warn('从 API 获取出库记录失败，回退到 mock 数据:', error);
      return mockOutboundRecords;
    }
  }

  private async fetchOutboundRecordsFromDocs(): Promise<OutboundRecord[]> {
    if (!isPyWebView()) {
      throw new Error('腾讯文档模式仅在 pywebview 环境中可用');
    }

    const fileId = this.config.docMappings?.outboundRecords;
    if (!fileId) {
      throw new Error('未配置出库记录文档 ID');
    }

    const result = await getSheetContent(fileId, 'default', 'A2:Z100');

    if (!result.gridData?.rows) {
      throw new Error('腾讯文档返回数据格式错误');
    }

    return result.gridData.rows.map((row, index) => {
      const cells = row.values || [];
      return {
        id: cells[0]?.cellValue?.text || `out-doc-${index}`,
        warehouseId: cells[1]?.cellValue?.text || '',
        sku: cells[2]?.cellValue?.text || '',
        name: cells[3]?.cellValue?.text || '',
        quantity: parseInt(cells[4]?.cellValue?.text || '0', 10),
        volume: parseFloat(cells[5]?.cellValue?.text || '0'),
        createdAt: cells[6]?.cellValue?.text || '',
        operator: cells[7]?.cellValue?.text || '',
        destination: cells[8]?.cellValue?.text || '',
      };
    }).filter((record): record is OutboundRecord => !!record.id);
  }

  // ===================== KPI 数据 =====================

  async getKpiData(): Promise<KpiData> {
    if (this.config.mode === 'mock') {
      return mockKpiData;
    }

    if (this.config.mode === 'tencent-docs') {
      try {
        return await this.calculateKpiFromDocs();
      } catch (error) {
        console.warn('从腾讯文档计算 KPI 失败，回退到 mock 数据:', error);
        return mockKpiData;
      }
    }

    try {
      return await this.fetchFromApi<KpiData>('/kpi');
    } catch (error) {
      console.warn('从 API 获取 KPI 失败，回退到 mock 数据:', error);
      return mockKpiData;
    }
  }

  private async calculateKpiFromDocs(): Promise<KpiData> {
    const [transitOrders, inboundRecords, inventory, warehouses] = await Promise.all([
      this.fetchTransitOrdersFromDocs(),
      this.fetchInboundRecordsFromDocs(),
      this.fetchInventoryFromDocs(),
      this.fetchWarehousesFromDocs(),
    ]);

    const totalTransitVolume = parseFloat(
      transitOrders
        .filter(t => t.status !== 'arrived')
        .reduce((s, t) => s + t.volume, 0)
        .toFixed(1)
    );

    const totalVolumeUtilization = calcOverallByVolume(warehouses);

    const pendingInboundOrders = inboundRecords.filter(r => r.status === 'pending').length;

    const totalInventoryQty = inventory.reduce((s, item) => s + item.quantity, 0);
    const avgDailyOutbound = Math.max(1, Math.round(totalInventoryQty / 120));
    const inventoryDepth = parseFloat((totalInventoryQty / avgDailyOutbound).toFixed(0));

    return {
      totalTransitVolume,
      totalVolumeUtilization,
      pendingInboundOrders,
      todayOutboundCount: 6, // 需要真实数据
      inventoryDepth,
    };
  }

  // ===================== 在途状态分布 =====================

  async getTransitStatusDistribution() {
    if (this.config.mode === 'mock') {
      return mockTransitStatusDistribution;
    }

    if (this.config.mode === 'tencent-docs') {
      try {
        const transitOrders = await this.fetchTransitOrdersFromDocs();
        return this.calculateStatusDistribution(transitOrders);
      } catch (error) {
        console.warn('从腾讯文档计算状态分布失败，回退到 mock 数据:', error);
        return mockTransitStatusDistribution;
      }
    }

    try {
      return await this.fetchFromApi<typeof mockTransitStatusDistribution>('/transit-status-distribution');
    } catch (error) {
      console.warn('从 API 获取状态分布失败，回退到 mock 数据:', error);
      return mockTransitStatusDistribution;
    }
  }

  private calculateStatusDistribution(transitOrders: TransitOrder[]) {
    return [
      { name: '已发出', value: transitOrders.filter(t => t.status === 'dispatched').length, color: '#9CA3AF' },
      { name: '运输中', value: transitOrders.filter(t => t.status === 'in_transit').length, color: '#111827' },
      { name: '清关中', value: transitOrders.filter(t => t.status === 'customs').length, color: '#6B7280' },
      { name: '已到达', value: transitOrders.filter(t => t.status === 'arrived').length, color: '#D1D5DB' },
    ];
  }

  // ===================== 通用 API 请求方法 =====================

  private async fetchFromApi<T>(endpoint: string): Promise<T> {
    const baseUrl = this.config.apiBaseUrl || '/api/v1';
    const url = `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

// ===================== 导出单例 =====================

export const dashboardApi = new DashboardApiService();
