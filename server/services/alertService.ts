/**
 * Alert Service
 *
 * 库存预警服务，监控库存状态并生成预警。
 * 支持低库存预警、过期预警、滞销预警等。
 *
 * v10.0: 改为使用 DAO 层，彻底弃用 SQLite 直接查询
 */

import type { Alert, AlertType, AlertSeverity } from '../types/alert.js';
import { logger } from '../logger.js';
import { ipcClient } from '../ipcClient.js';
import {
  createAlert,
  getAlerts,
  getAlertById,
  resolveAlert as daoResolveAlert,
  deleteAlert as daoDeleteAlert,
  cleanResolvedAlerts as daoCleanResolvedAlerts,
} from '../dao/wmsSkillDao.js';
import { getInventoryItems } from '../dao/warehouse.js';
import type { WmsAlert } from '../models/wms-skill.js';

// ===================== 常量定义 =====================

/** 默认低库存阈值 */
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

/** 默认过期预警天数 */
const DEFAULT_EXPIRY_WARNING_DAYS = 7;

/** 默认滞销天数 */
const DEFAULT_STAGNANT_DAYS = 30;

// ===================== 工具函数 =====================

/**
 * 获取当前时间戳（ISO 格式）
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * WmsAlert → Alert 类型转换
 */
function toAlert(wms: WmsAlert): Alert {
  return {
    id: wms.id ?? 0,
    alertType: wms.alertType as AlertType,
    severity: wms.severity as AlertSeverity,
    sku: wms.sku ?? '',
    warehouseId: wms.warehouseId,
    message: wms.message,
    status: wms.status,
    createdAt: wms.createdAt ?? now(),
    resolvedAt: wms.resolvedAt ?? null,
  };
}

/**
 * 生成预警消息
 */
function generateAlertMessage(type: AlertType, params: Record<string, unknown>): string {
  switch (type) {
    case 'low_stock':
      return `商品 ${params.sku} 库存低于阈值，当前库存: ${params.currentStock}，阈值: ${params.threshold}`;
    case 'out_of_stock':
      return `商品 ${params.sku} 已断货`;
    case 'expiry':
      return `商品 ${params.sku} 即将过期，过期日期: ${params.expiryDate}`;
    case 'stagnant':
      return `商品 ${params.sku} 已滞销 ${params.days} 天`;
    case 'overstock':
      return `商品 ${params.sku} 库存积压，当前库存: ${params.currentStock}`;
    default:
      return `库存预警: ${params.sku}`;
  }
}

// ===================== 核心函数 =====================

/**
 * 扫描库存并生成预警
 *
 * 流程：
 * 1. 查询所有库存项
 * 2. 检查各项预警条件
 * 3. 生成预警记录
 *
 * @param warehouseId 仓库 ID（可选）
 * @returns 生成的预警列表
 */
interface InventoryItemView {
  sku: string;
  name: string;
  warehouseId: string;
  quantity: number;
  expiryDate?: string;
  updatedAt: string;
}

function toItemView(item: Record<string, unknown>): InventoryItemView {
  return {
    sku: String(item.sku ?? ''),
    name: String(item.name ?? ''),
    warehouseId: String(item.warehouseId ?? ''),
    quantity: Number(item.quantity ?? 0),
    expiryDate: item.expiryDate ? String(item.expiryDate) : undefined,
    updatedAt: String(item.updatedAt ?? ''),
  };
}

export function scanAndGenerateAlerts(warehouseId?: string): Alert[] {
  // 查询库存项（使用 DAO）
  const items = getInventoryItems(warehouseId).map(toItemView);

  const alerts: Alert[] = [];

  for (const item of items) {
    // 1. 低库存预警
    if (item.quantity > 0 && item.quantity <= DEFAULT_LOW_STOCK_THRESHOLD) {
      const alertId = createAlert({
        alertType: 'low_stock',
        severity: item.quantity <= 5 ? 'high' : 'medium',
        sku: item.sku,
        warehouseId: item.warehouseId,
        message: generateAlertMessage('low_stock', {
          sku: item.sku,
          currentStock: item.quantity,
          threshold: DEFAULT_LOW_STOCK_THRESHOLD,
        }),
        status: 'active',
      });

      alerts.push({
        id: alertId,
        alertType: 'low_stock',
        severity: item.quantity <= 5 ? 'high' : 'medium',
        sku: item.sku,
        warehouseId: item.warehouseId,
        message: generateAlertMessage('low_stock', {
          sku: item.sku,
          currentStock: item.quantity,
          threshold: DEFAULT_LOW_STOCK_THRESHOLD,
        }),
        status: 'active',
        createdAt: now(),
        resolvedAt: null,
      });
    }

    // 2. 断货预警（映射为 low_stock）
    if (item.quantity === 0) {
      const alertId = createAlert({
        alertType: 'low_stock',
        severity: 'critical',
        sku: item.sku,
        warehouseId: item.warehouseId,
        message: generateAlertMessage('out_of_stock', { sku: item.sku }),
        status: 'active',
      });

      alerts.push({
        id: alertId,
        alertType: 'out_of_stock',
        severity: 'high',
        sku: item.sku,
        warehouseId: item.warehouseId,
        message: generateAlertMessage('out_of_stock', { sku: item.sku }),
        status: 'active',
        createdAt: now(),
        resolvedAt: null,
      });
    }

    // 3. 过期预警
    if (item.expiryDate) {
      const expiryDate = new Date(item.expiryDate);
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + DEFAULT_EXPIRY_WARNING_DAYS);

      if (expiryDate <= warningDate) {
        const isExpired = expiryDate < new Date();
        const alertId = createAlert({
          alertType: 'expiry',
          severity: isExpired ? 'high' : 'medium',
          sku: item.sku,
          warehouseId: item.warehouseId,
          message: generateAlertMessage('expiry', {
            sku: item.sku,
            expiryDate: item.expiryDate,
          }),
          status: 'active',
        });

        alerts.push({
          id: alertId,
          alertType: 'expiry',
          severity: isExpired ? 'high' : 'medium',
          sku: item.sku,
          warehouseId: item.warehouseId,
          message: generateAlertMessage('expiry', {
            sku: item.sku,
            expiryDate: item.expiryDate,
          }),
          status: 'active',
          createdAt: now(),
          resolvedAt: null,
        });
      }
    }

    // 4. 滞销预警
    const lastUpdate = new Date(item.updatedAt);
    const stagnantDate = new Date();
    stagnantDate.setDate(stagnantDate.getDate() - DEFAULT_STAGNANT_DAYS);

    if (lastUpdate < stagnantDate && item.quantity > 0) {
      const days = Math.floor(
        (new Date().getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const alertId = createAlert({
        alertType: 'stagnant',
        severity: 'low',
        sku: item.sku,
        warehouseId: item.warehouseId,
        message: generateAlertMessage('stagnant', { sku: item.sku, days }),
        status: 'active',
      });

      alerts.push({
        id: alertId,
        alertType: 'stagnant',
        severity: 'low',
        sku: item.sku,
        warehouseId: item.warehouseId,
        message: generateAlertMessage('stagnant', { sku: item.sku, days }),
        status: 'active',
        createdAt: now(),
        resolvedAt: null,
      });
    }
  }

  logger.info(`[Alert] 生成 ${alerts.length} 条预警`);

  if (alerts.length > 0) {
    sendAlertNotifications(alerts).catch((err) => {
      logger.debug('[Alert] System notification failed (may not running in Swift app):', err);
    });
  }

  return alerts;
}

/**
 * 通过 IPC 发送系统预警通知
 */
async function sendAlertNotifications(alerts: Alert[]): Promise<void> {
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' || a.severity === 'high');
  const otherAlerts = alerts.filter((a) => a.severity === 'medium' || a.severity === 'low');

  if (criticalAlerts.length > 0) {
    const title = `⚠️ 库存紧急预警：${criticalAlerts.length} 条`;
    const body = criticalAlerts
      .slice(0, 3)
      .map((a) => `• ${a.sku}: ${a.message}`)
      .join('\n');

    await ipcClient.notify(title, body, {
      sound: 'Sosumi',
      priority: 'timeSensitive',
    });
  } else if (otherAlerts.length > 0) {
    const title = `📦 库存预警：${alerts.length} 条新预警`;
    const body = otherAlerts
      .slice(0, 3)
      .map((a) => `• ${a.sku}: ${a.message}`)
      .join('\n');

    await ipcClient.notify(title, body, {
      sound: 'Glass',
      priority: 'active',
    });
  }
}

/**
 * 获取预警列表
 *
 * @param filters 筛选条件
 * @returns 预警列表
 */
export function getAlertList(filters?: {
  alertType?: AlertType;
  severity?: AlertSeverity;
  status?: string;
  warehouseId?: string;
  sku?: string;
}): Alert[] {
  const alerts = getAlerts();

  if (!filters) return alerts.map(toAlert);

  return alerts
    .filter((a) => {
      if (filters.alertType && a.alertType !== filters.alertType) return false;
      if (filters.severity && a.severity !== filters.severity) return false;
      if (filters.status && a.status !== filters.status) return false;
      if (filters.warehouseId && a.warehouseId !== filters.warehouseId) return false;
      if (filters.sku && a.sku !== filters.sku) return false;
      return true;
    })
    .map(toAlert);
}

/**
 * 获取预警详情
 *
 * @param alertId 预警 ID
 * @returns 预警详情
 */
export function getAlertDetail(alertId: number): Alert | null {
  const alert = getAlertById(alertId);
  return alert ? toAlert(alert) : null;
}

/**
 * 解决预警
 *
 * @param alertId 预警 ID
 * @returns 是否解决成功
 */
export function resolveAlert(alertId: number): boolean {
  return daoResolveAlert(alertId, 'resolved');
}

/**
 * 删除预警
 *
 * @param alertId 预警 ID
 * @returns 是否删除成功
 */
export function removeAlert(alertId: number): boolean {
  return daoDeleteAlert(alertId);
}

/**
 * 获取预警统计
 *
 * @param warehouseId 仓库 ID（可选）
 * @returns 预警统计信息
 */
export function getAlertStats(warehouseId?: string): {
  totalAlerts: number;
  activeAlerts: number;
  highSeverityAlerts: number;
  byType: Record<AlertType, number>;
} {
  const alerts = getAlertList(warehouseId ? { warehouseId } : undefined);
  const activeAlerts = alerts.filter((a) => a.status === 'active');

  const byType: Record<AlertType, number> = {
    low_stock: 0,
    out_of_stock: 0,
    expiry: 0,
    stagnant: 0,
    overstock: 0,
  };

  for (const alert of activeAlerts) {
    byType[alert.alertType] = (byType[alert.alertType] || 0) + 1;
  }

  return {
    totalAlerts: alerts.length,
    activeAlerts: activeAlerts.length,
    highSeverityAlerts: activeAlerts.filter((a) => a.severity === 'high').length,
    byType,
  };
}

/**
 * 清理已解决的预警
 *
 * @param days 保留天数（默认 30 天）
 * @returns 清理的预警数量
 */
export function cleanResolvedAlerts(days: number = 30): number {
  const count = daoCleanResolvedAlerts(days);
  logger.info(`[Alert] 清理 ${count} 条已解决预警`);
  return count;
}

// ===================== 兼容导出 =====================

import type { AlertCheckResult, AlertThresholds } from '../models/wms-skill.js';

/**
 * 检查所有预警（兼容旧 API）
 * @deprecated 使用 scanAndGenerateAlerts() 替代
 */
export async function checkAllAlerts(thresholds?: AlertThresholds): Promise<AlertCheckResult> {
  const lowStockThreshold = thresholds?.lowStock ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const alerts = scanAndGenerateAlerts();

  let lowStockAlerts = 0;
  let expiryAlerts = 0;
  let stagnantAlerts = 0;

  for (const alert of alerts) {
    switch (alert.alertType) {
      case 'low_stock':
      case 'out_of_stock':
        lowStockAlerts++;
        break;
      case 'expiry':
        expiryAlerts++;
        break;
      case 'stagnant':
        stagnantAlerts++;
        break;
    }
  }

  return {
    newAlerts: alerts.length,
    lowStockAlerts,
    expiryAlerts,
    stagnantAlerts,
    predictedShortageAlerts: 0,
    predictedOverstockAlerts: 0,
    errors: [],
  };
}
