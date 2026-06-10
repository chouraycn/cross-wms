/**
 * Alert Service
 *
 * 异常预警扫描服务，负责自动扫描并创建预警记录。
 * 支持三种预警类型：低库存、临期商品、呆滞库存。
 */

import Database from 'better-sqlite3';
import type { AlertThresholds, AlertCheckResult, WmsAlert } from '../models/wms-skill.js';

// ===================== 默认阈值配置 =====================

/** alertService 仅使用规则驱动的阈值字段，不包含预测参数 */
type RuleThresholds = Required<Pick<AlertThresholds, 'lowStock' | 'expiryDays' | 'stagnantDays'>>;

const DEFAULT_THRESHOLDS: RuleThresholds = {
  lowStock: 10,
  expiryDays: 30,
  stagnantDays: 90,
};

// ===================== 核心函数 =====================

/**
 * 执行完整预警扫描
 * @param db 数据库实例
 * @param thresholds 阈值配置（可选）
 * @returns 扫描结果
 */
export async function checkAllAlerts(
  db: Database.Database,
  thresholds?: AlertThresholds
): Promise<AlertCheckResult> {
  const config: Required<AlertThresholds> = {
    lowStock: thresholds?.lowStock ?? DEFAULT_THRESHOLDS.lowStock,
    expiryDays: thresholds?.expiryDays ?? DEFAULT_THRESHOLDS.expiryDays,
    stagnantDays: thresholds?.stagnantDays ?? DEFAULT_THRESHOLDS.stagnantDays,
  };

  const result: AlertCheckResult = {
    newAlerts: 0,
    lowStockAlerts: 0,
    expiryAlerts: 0,
    stagnantAlerts: 0,
    predictedShortageAlerts: 0,
    predictedOverstockAlerts: 0,
    errors: [],
  };

  try {
    // 1. 低库存检测
    const lowStockResult = await checkLowStock(db, config.lowStock);
    result.lowStockAlerts = lowStockResult.count;
    result.newAlerts += lowStockResult.count;
  } catch (err) {
    result.errors.push(`低库存检测失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    // 2. 临期预警
    const expiryResult = await checkExpiry(db, config.expiryDays);
    result.expiryAlerts = expiryResult.count;
    result.newAlerts += expiryResult.count;
  } catch (err) {
    result.errors.push(`临期预警失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    // 3. 呆滞库存预警
    const stagnantResult = await checkStagnant(db, config.stagnantDays);
    result.stagnantAlerts = stagnantResult.count;
    result.newAlerts += stagnantResult.count;
  } catch (err) {
    result.errors.push(`呆滞库存预警失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

// ===================== 低库存检测 =====================

/**
 * 检测低库存商品
 * @param db 数据库实例
 * @param threshold 低库存阈值
 * @returns 新增预警数量
 */
async function checkLowStock(
  db: Database.Database,
  threshold: number
): Promise<{ count: number }> {
  // 查询低库存且未存在活跃预警的商品
  const lowStockItems = db.prepare(`
    SELECT 
      ii.sku,
      ii.warehouse_id,
      ii.quantity,
      w.name as warehouse_name
    FROM inventory_items ii
    LEFT JOIN warehouses w ON ii.warehouse_id = w.id
    WHERE ii.quantity <= ?
      AND ii.sku NOT IN (
        SELECT sku FROM wms_alerts 
        WHERE alert_type = 'low_stock' 
          AND status = 'active' 
          AND sku IS NOT NULL
      )
  `).all(threshold) as Array<{
    sku: string;
    warehouse_id: string;
    quantity: number;
    warehouse_name: string;
  }>;

  let count = 0;

  for (const item of lowStockItems) {
    try {
      // 根据库存数量确定严重程度
      let severity: WmsAlert['severity'] = 'medium';
      if (item.quantity === 0) {
        severity = 'critical';
      } else if (item.quantity <= 3) {
        severity = 'high';
      }

      // 创建预警记录
      const stmt = db.prepare(`
        INSERT INTO wms_alerts (
          warehouse_id,
          alert_type,
          severity,
          sku,
          message,
          triggered_at,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), 'active', datetime('now'), datetime('now'))
      `);

      stmt.run(
        item.warehouse_id,
        'low_stock',
        severity,
        item.sku,
        `[低库存] SKU ${item.sku} 库存仅剩 ${item.quantity} 件（仓库: ${item.warehouse_name || item.warehouse_id}）`
      );

      count++;
    } catch (err) {
      console.error(`创建低库存预警失败 (SKU: ${item.sku}):`, err);
    }
  }

  return { count };
}

// ===================== 临期预警 =====================

/**
 * 检测临期商品
 * @param db 数据库实例
 * @param expiryDays 临期天数阈值
 * @returns 新增预警数量
 */
async function checkExpiry(
  db: Database.Database,
  expiryDays: number
): Promise<{ count: number }> {
  // 查询临期且未存在活跃预警的商品
  const expiryItems = db.prepare(`
    SELECT 
      ii.sku,
      ii.warehouse_id,
      ii.expiry_date,
      w.name as warehouse_name
    FROM inventory_items ii
    LEFT JOIN warehouses w ON ii.warehouse_id = w.id
    WHERE ii.expiry_date IS NOT NULL
      AND ii.expiry_date BETWEEN date('now') AND date('now', '+' || ? || ' days')
      AND ii.sku NOT IN (
        SELECT sku FROM wms_alerts 
        WHERE alert_type = 'expiry' 
          AND status = 'active' 
          AND sku IS NOT NULL
      )
  `).all(expiryDays) as Array<{
    sku: string;
    warehouse_id: string;
    expiry_date: string;
    warehouse_name: string;
  }>;

  let count = 0;

  for (const item of expiryItems) {
    try {
      // 根据到期日期确定严重程度
      let severity: WmsAlert['severity'] = 'medium';
      const expiryDate = new Date(item.expiry_date);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 7) {
        severity = 'critical';
      } else if (daysUntilExpiry <= 14) {
        severity = 'high';
      }

      // 创建预警记录
      const stmt = db.prepare(`
        INSERT INTO wms_alerts (
          warehouse_id,
          alert_type,
          severity,
          sku,
          message,
          triggered_at,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), 'active', datetime('now'), datetime('now'))
      `);

      stmt.run(
        item.warehouse_id,
        'expiry',
        severity,
        item.sku,
        `[临期预警] SKU ${item.sku} 将于 ${item.expiry_date} 到期（仓库: ${item.warehouse_name || item.warehouse_id}）`
      );

      count++;
    } catch (err) {
      console.error(`创建临期预警失败 (SKU: ${item.sku}):`, err);
    }
  }

  return { count };
}

// ===================== 呆滞库存预警 =====================

/**
 * 检测呆滞库存
 * @param db 数据库实例
 * @param stagnantDays 呆滞天数阈值（无出库记录）
 * @returns 新增预警数量
 */
async function checkStagnant(
  db: Database.Database,
  stagnantDays: number
): Promise<{ count: number }> {
  // 查询呆滞库存（updated_at 早于阈值天数，且无出库记录）
  const stagnantItems = db.prepare(`
    SELECT 
      ii.sku,
      ii.warehouse_id,
      ii.updated_at,
      w.name as warehouse_name
    FROM inventory_items ii
    LEFT JOIN warehouses w ON ii.warehouse_id = w.id
    WHERE ii.updated_at < datetime('now', '-' || ? || ' days')
      AND ii.sku NOT IN (
        SELECT DISTINCT sku 
        FROM inventory_transactions 
        WHERE transaction_type = 'out' 
          AND created_at > datetime('now', '-' || ? || ' days')
      )
      AND ii.sku NOT IN (
        SELECT sku FROM wms_alerts 
        WHERE alert_type = 'stagnant' 
          AND status = 'active' 
          AND sku IS NOT NULL
      )
  `).all(stagnantDays, stagnantDays) as Array<{
    sku: string;
    warehouse_id: string;
    updated_at: string;
    warehouse_name: string;
  }>;

  let count = 0;

  for (const item of stagnantItems) {
    try {
      // 呆滞天数越长，严重程度越高
      const updatedAt = new Date(item.updated_at);
      const now = new Date();
      const daysSinceUpdate = Math.ceil((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));

      let severity: WmsAlert['severity'] = 'medium';
      if (daysSinceUpdate >= stagnantDays * 2) {
        severity = 'critical';
      } else if (daysSinceUpdate >= stagnantDays * 1.5) {
        severity = 'high';
      }

      // 创建预警记录
      const stmt = db.prepare(`
        INSERT INTO wms_alerts (
          warehouse_id,
          alert_type,
          severity,
          sku,
          message,
          triggered_at,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), 'active', datetime('now'), datetime('now'))
      `);

      stmt.run(
        item.warehouse_id,
        'stagnant',
        severity,
        item.sku,
        `[呆滞库存] SKU ${item.sku} 已 ${daysSinceUpdate} 天无变动（仓库: ${item.warehouse_name || item.warehouse_id}）`
      );

      count++;
    } catch (err) {
      console.error(`创建呆滞库存预警失败 (SKU: ${item.sku}):`, err);
    }
  }

  return { count };
}

// AlertThresholds 和 AlertCheckResult 类型已从 ../models/wms-skill.js 导入
// 此处保留 re-export 以保持向后兼容
export type { AlertThresholds, AlertCheckResult } from '../models/wms-skill.js';
