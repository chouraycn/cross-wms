/**
 * Prediction Service
 *
 * 需求预测服务，基于历史出库数据预测未来需求。
 * 核心算法：移动平均 + 趋势分析 + 季节性调整
 *
 * v10.0: 改为使用 DAO 层（wmsSkillDao.ts / warehouse.ts）获取数据。
 */

import type { DemandForecast, ForecastPeriod } from '../types/prediction.js';
import { logger } from '../logger.js';
import {
  createDemandForecast,
  getDemandForecasts,
  getDemandForecastById,
  updateDemandForecastStatus,
  deleteDemandForecast,
} from '../dao/wmsSkillDao.js';
import {
  getInventoryItems,
  getOutboundRecords,
} from '../dao/warehouse.js';

// ===================== 常量定义 =====================

/** 默认历史数据天数 */
const DEFAULT_HISTORY_DAYS = 90;

/** 默认预测天数 */
const DEFAULT_FORECAST_DAYS = 30;

/** 移动平均窗口大小 */
const MOVING_AVERAGE_WINDOW = 7;

/** 季节性周期（天） */
const SEASONALITY_PERIOD = 7;

// ===================== 工具函数 =====================

/**
 * 获取当前时间戳（ISO 格式）
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * 计算移动平均
 */
function movingAverage(data: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(data[i]);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < window; j++) {
      sum += data[i - j];
    }
    result.push(sum / window);
  }
  return result;
}

/**
 * 计算趋势（线性回归斜率）
 */
function calculateTrend(data: number[]): number {
  const n = data.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}

/**
 * 计算季节性因子
 */
function calculateSeasonality(data: number[], period: number): number[] {
  const seasonalFactors: number[] = new Array(period).fill(1);

  if (data.length < period * 2) {
    return seasonalFactors;
  }

  // 计算每个周期的平均值
  const periodAverages: number[] = [];
  for (let i = 0; i < period; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i; j < data.length; j += period) {
      sum += data[j];
      count++;
    }
    periodAverages.push(count > 0 ? sum / count : 1);
  }

  // 计算全局平均值
  const globalAverage = periodAverages.reduce((a, b) => a + b, 0) / period;

  // 计算季节性因子
  for (let i = 0; i < period; i++) {
    seasonalFactors[i] = globalAverage > 0 ? periodAverages[i] / globalAverage : 1;
  }

  return seasonalFactors;
}

// ===================== 核心函数 =====================

/**
 * 生成需求预测
 *
 * 流程：
 * 1. 获取历史出库数据
 * 2. 计算移动平均、趋势、季节性
 * 3. 生成未来预测
 * 4. 保存预测结果
 *
 * @param sku 商品 SKU
 * @param warehouseId 仓库 ID
 * @param forecastDays 预测天数
 * @param historyDays 历史数据天数
 * @returns 预测结果
 */
export function generateForecast(
  sku: string,
  warehouseId: string,
  forecastDays: number = DEFAULT_FORECAST_DAYS,
  historyDays: number = DEFAULT_HISTORY_DAYS
): DemandForecast {
  // 1. 获取历史出库数据
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - historyDays);
  const endDate = new Date();

  const records = getOutboundRecords(
    warehouseId,
    startDate.toISOString(),
    endDate.toISOString(),
  ).filter((r) => r.sku === sku);

  // 按日期聚合出库量
  const dailyMap = new Map<string, number>();
  for (const r of records) {
    const dateStr = r.createdAt.slice(0, 10);
    dailyMap.set(dateStr, (dailyMap.get(dateStr) ?? 0) + r.quantity);
  }

  // 构建完整的时间序列（填充缺失日期为 0）
  const dailyDemand: number[] = [];
  const dates: string[] = [];
  const currentDate = new Date(startDate);
  const today = new Date();

  while (currentDate <= today) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    dates.push(dateStr);
    dailyDemand.push(dailyMap.get(dateStr) ?? 0);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (dailyDemand.length === 0) {
    throw new Error(`商品 ${sku} 在历史期间无出库数据`);
  }

  // 2. 计算趋势
  const trend = calculateTrend(dailyDemand);

  // 3. 计算季节性因子
  const seasonality = calculateSeasonality(dailyDemand, SEASONALITY_PERIOD);

  // 4. 计算移动平均
  const smoothed = movingAverage(dailyDemand, MOVING_AVERAGE_WINDOW);

  // 5. 生成预测
  const lastValue = smoothed[smoothed.length - 1];
  const forecasts: Array<{ date: string; predictedDemand: number; confidence: number }> = [];

  for (let i = 1; i <= forecastDays; i++) {
    const forecastDate = new Date();
    forecastDate.setDate(forecastDate.getDate() + i);
    const dateStr = forecastDate.toISOString().slice(0, 10);

    // 基础预测 = 最后移动平均值 + 趋势
    let predicted = lastValue + trend * i;

    // 应用季节性调整
    const dayOfWeek = forecastDate.getDay();
    const seasonalFactor = seasonality[dayOfWeek] || 1;
    predicted *= seasonalFactor;

    // 确保非负
    predicted = Math.max(0, predicted);

    // 置信度随预测天数递减
    const confidence = Math.max(0.3, 1 - i * 0.02);

    forecasts.push({
      date: dateStr,
      predictedDemand: Math.round(predicted * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  // 6. 计算统计信息
  const totalPredictedDemand = forecasts.reduce((sum, f) => sum + f.predictedDemand, 0);
  const avgDailyDemand = dailyDemand.reduce((sum, d) => sum + d, 0) / dailyDemand.length;

  // 7. 保存预测结果（使用 DAO 层）
  const forecastId = createDemandForecast({
    sku,
    warehouseId,
    forecastDate: now(),
    forecastDays,
    predictedDemand: totalPredictedDemand,
    confidenceLevel: forecasts[0]?.confidence ?? 0.8,
    modelVersion: 'v1.0_moving_average',
    status: 'active',
  });

  return {
    id: forecastId,
    sku,
    warehouseId,
    forecastDate: now(),
    forecastDays,
    predictedDemand: totalPredictedDemand,
    confidenceLevel: forecasts[0]?.confidence ?? 0.8,
    modelVersion: 'v1.0_moving_average',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
    details: {
      dailyForecasts: forecasts,
      avgDailyDemand: Math.round(avgDailyDemand * 100) / 100,
      trend: Math.round(trend * 100) / 100,
      historyDays: dailyDemand.length,
    },
  };
}

/**
 * 获取预测列表
 *
 * @param filters 筛选条件
 * @returns 预测列表
 */
export function getForecasts(filters?: {
  sku?: string;
  warehouseId?: string;
  status?: string;
}): DemandForecast[] {
  const rows = getDemandForecasts(filters);
  return rows.map((row) => ({
    id: row.id as number,
    sku: row.sku as string,
    warehouseId: row.warehouse_id as string,
    forecastDate: row.forecast_date as string,
    forecastDays: row.forecast_days as number,
    predictedDemand: row.predicted_demand as number,
    confidenceLevel: row.confidence_level as number,
    modelVersion: row.model_version as string,
    status: row.status as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

/**
 * 获取预测详情
 *
 * @param forecastId 预测 ID
 * @returns 预测详情
 */
export function getForecastDetail(forecastId: number): DemandForecast | null {
  const row = getDemandForecastById(forecastId);
  if (!row) return null;
  return {
    id: row.id as number,
    sku: row.sku as string,
    warehouseId: row.warehouse_id as string,
    forecastDate: row.forecast_date as string,
    forecastDays: row.forecast_days as number,
    predictedDemand: row.predicted_demand as number,
    confidenceLevel: row.confidence_level as number,
    modelVersion: row.model_version as string,
    status: row.status as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 更新预测状态
 *
 * @param forecastId 预测 ID
 * @param status 新状态
 * @returns 是否更新成功
 */
export function updateForecastStatus(forecastId: number, status: string): boolean {
  return updateDemandForecastStatus(forecastId, status);
}

/**
 * 删除预测
 *
 * @param forecastId 预测 ID
 * @returns 是否删除成功
 */
export function deleteForecast(forecastId: number): boolean {
  return deleteDemandForecast(forecastId);
}

/**
 * 获取预测统计
 *
 * @param warehouseId 仓库 ID（可选）
 * @returns 预测统计信息
 */
export function getForecastStats(warehouseId?: string): {
  totalForecasts: number;
  activeForecasts: number;
  avgConfidence: number;
  totalPredictedDemand: number;
} {
  const forecasts = getForecasts(warehouseId ? { warehouseId } : undefined);

  const activeForecasts = forecasts.filter((f) => f.status === 'active');
  const totalPredictedDemand = activeForecasts.reduce((sum, f) => sum + f.predictedDemand, 0);
  const avgConfidence = activeForecasts.length > 0
    ? activeForecasts.reduce((sum, f) => sum + f.confidenceLevel, 0) / activeForecasts.length
    : 0;

  return {
    totalForecasts: forecasts.length,
    activeForecasts: activeForecasts.length,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    totalPredictedDemand: Math.round(totalPredictedDemand * 100) / 100,
  };
}

/**
 * 批量生成预测
 *
 * 为指定仓库的所有商品生成预测
 *
 * @param warehouseId 仓库 ID
 * @param forecastDays 预测天数
 * @returns 生成的预测列表
 */
export function batchGenerateForecasts(
  warehouseId: string,
  forecastDays: number = DEFAULT_FORECAST_DAYS
): DemandForecast[] {
  // 获取仓库中的所有 SKU
  const items = getInventoryItems(warehouseId);
  const skuSet = new Set<string>();
  for (const item of items) {
    if (item.sku) skuSet.add(item.sku as string);
  }

  const results: DemandForecast[] = [];

  for (const sku of skuSet) {
    try {
      const forecast = generateForecast(sku, warehouseId, forecastDays);
      results.push(forecast);
    } catch (e) {
      logger.warn(`[Prediction] 生成预测失败: sku=${sku}, error=${(e as Error).message}`);
    }
  }

  return results;
}

// ===================== 兼容导出 =====================

import type { AlertCheckResult, PredictionConfig, PredictionDetail } from '../models/wms-skill.js';

/**
 * 检查所有预测（兼容旧 API）
 * @deprecated 使用 batchGenerateForecasts() 替代
 */
export async function checkAllPredictions(config: PredictionConfig): Promise<AlertCheckResult> {
  // 获取所有仓库
  const items = getInventoryItems();
  const warehouseSet = new Set<string>();
  for (const item of items) {
    if (item.warehouseId) warehouseSet.add(item.warehouseId as string);
  }

  let newAlerts = 0;
  const errors: string[] = [];

  for (const warehouseId of warehouseSet) {
    try {
      const forecasts = batchGenerateForecasts(warehouseId, config.predictionDays);
      for (const f of forecasts) {
        if (f.predictedDemand > 0) {
          newAlerts++;
        }
      }
    } catch (e) {
      errors.push(`仓库 ${warehouseId}: ${(e as Error).message}`);
    }
  }

  return {
    newAlerts,
    lowStockAlerts: 0,
    expiryAlerts: 0,
    stagnantAlerts: 0,
    predictedShortageAlerts: newAlerts,
    predictedOverstockAlerts: 0,
    errors,
  };
}

/**
 * 获取预测详情（兼容旧 API）
 * @deprecated 使用 getForecastDetail() 替代
 */
export function getPredictionDetail(sku: string, warehouseId: string, _config: PredictionConfig): PredictionDetail | null {
  try {
    // 获取当前库存
    const items = getInventoryItems(warehouseId);
    const item = items.find((i) => i.sku === sku) as { quantity: number } | undefined;

    if (!item) return null;

    // 获取历史出库数据（最近 30 天）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const historyRecords = getOutboundRecords(
      warehouseId,
      thirtyDaysAgo.toISOString(),
    ).filter((r) => r.sku === sku);

    // 按日期聚合
    const dailyMap = new Map<string, number>();
    for (const r of historyRecords) {
      const dateStr = r.createdAt.slice(0, 10);
      dailyMap.set(dateStr, (dailyMap.get(dateStr) ?? 0) + r.quantity);
    }

    const history = Array.from(dailyMap.entries()).map(([date, outbound]) => ({ date, outbound }));
    history.sort((a, b) => a.date.localeCompare(b.date));

    // 计算日均消耗
    const totalOutbound = history.reduce((sum, h) => sum + h.outbound, 0);
    const dailyConsumption = history.length > 0 ? totalOutbound / history.length : 0;

    // 计算预测归零天数
    const daysUntilZero = dailyConsumption > 0
      ? Math.round(item.quantity / dailyConsumption)
      : 999;

    // 构建历史数据
    const historyData = history.map((h) => ({
      date: h.date,
      stock: item.quantity,
      outbound: h.outbound,
    }));

    // 构建预测曲线
    const predictionCurve: Array<{ date: string; predictedStock: number }> = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      predictionCurve.push({
        date: d.toISOString().slice(0, 10),
        predictedStock: Math.max(0, Math.round(item.quantity - dailyConsumption * i)),
      });
    }

    return {
      sku,
      warehouseId,
      currentStock: item.quantity,
      dailyConsumption: Math.round(dailyConsumption * 100) / 100,
      daysUntilZero,
      confidence: history.length >= 7 ? 'high' : history.length >= 3 ? 'medium' : 'low',
      historyData,
      predictionCurve,
      safetyStockLine: 10,
    };
  } catch (e) {
    logger.error(`[Prediction] 获取预测详情失败: sku=${sku}, warehouse=${warehouseId}`, e);
    return null;
  }
}
