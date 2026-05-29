/**
 * 容积率计算工具函数
 *
 * 统一提供两套计算基准：
 * - 件数基准（usedItems / totalItems）：用于仓库详情页、KpiCards、WarehouseKpiTable
 * - 体积基准（usedVolume / totalVolume）：用于总体 KPI、VolumeChart 趋势、仪表盘汇总
 *
 * 所有函数均采用防御性编程，处理 NaN / Infinity / 除零等边界情况。
 */

import type { Warehouse } from '../types';

/**
 * 基于件数计算单个仓库的容积利用率（百分比）
 *
 * 当 totalItems 不可用时，fallback 到 totalVolume 作为分母；
 * 当 usedItems 不可用时，fallback 到 usedVolume 作为分子。
 *
 * 用于：仓库详情页、KPI 卡片、仓库 KPI 表
 *
 * @param wh - 仓库对象
 * @returns 容积利用率百分比（0-100），保留 1 位小数
 */
export function calcUtilizationByItems(wh: Warehouse): number {
  const total =
    Number.isFinite(wh.totalItems) && wh.totalItems > 0
      ? wh.totalItems
      : Number.isFinite(wh.totalVolume)
        ? wh.totalVolume
        : 1;
  const used =
    Number.isFinite(wh.usedItems) && wh.usedItems >= 0
      ? wh.usedItems
      : Number.isFinite(wh.usedVolume)
        ? wh.usedVolume
        : 0;
  if (total <= 0) return 0;
  const ratio = used / total;
  if (!Number.isFinite(ratio)) return 0;
  return parseFloat((ratio * 100).toFixed(1));
}

/**
 * 基于体积计算单个仓库的容积利用率（百分比）
 *
 * 用于：总体 KPI、趋势图
 *
 * @param wh - 仓库对象
 * @returns 容积利用率百分比（0-100），保留 1 位小数
 */
export function calcUtilizationByVolume(wh: Warehouse): number {
  const total =
    Number.isFinite(wh.totalVolume) && wh.totalVolume > 0 ? wh.totalVolume : 1;
  const used =
    Number.isFinite(wh.usedVolume) && wh.usedVolume >= 0 ? wh.usedVolume : 0;
  if (total <= 0) return 0;
  const ratio = used / total;
  if (!Number.isFinite(ratio)) return 0;
  return parseFloat((ratio * 100).toFixed(1));
}

/**
 * 基于件数计算所有仓库的总体容积利用率（百分比）
 *
 * 汇总所有仓库的 totalItems 和 usedItems，然后计算 ratio。
 * 当 totalItems 不可用时，fallback 到 totalVolume。
 *
 * 用于：仪表盘 KPI 概览卡片（件数基准）
 *
 * @param warehouses - 仓库列表
 * @returns 总体容积利用率百分比（0-100），保留 1 位小数
 */
export function calcOverallByItems(warehouses: Warehouse[]): number {
  if (warehouses.length === 0) return 0;
  const totalItemsSum = warehouses.reduce(
    (s, w) =>
      s +
      (Number.isFinite(w.totalItems)
        ? w.totalItems
        : Number.isFinite(w.totalVolume)
          ? w.totalVolume
          : 0),
    0,
  );
  const usedItemsSum = warehouses.reduce(
    (s, w) =>
      s +
      (Number.isFinite(w.usedItems)
        ? w.usedItems
        : Number.isFinite(w.usedVolume)
          ? w.usedVolume
          : 0),
    0,
  );
  if (totalItemsSum <= 0) return 0;
  const ratio = usedItemsSum / totalItemsSum;
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(ratio * 1000) / 10;
}

/**
 * 基于体积计算所有仓库的总体容积利用率（百分比）
 *
 * 汇总所有仓库的 totalVolume 和 usedVolume，然后计算 ratio。
 *
 * 用于：总体 KPI、VolumeChart 趋势、仪表盘汇总
 *
 * @param warehouses - 仓库列表
 * @returns 总体容积利用率百分比（0-100），保留 1 位小数
 */
export function calcOverallByVolume(warehouses: Warehouse[]): number {
  if (warehouses.length === 0) return 0;
  const totalVolSum = warehouses.reduce(
    (s, w) => s + (Number.isFinite(w.totalVolume) ? w.totalVolume : 0),
    0,
  );
  const usedVolSum = warehouses.reduce(
    (s, w) => s + (Number.isFinite(w.usedVolume) ? w.usedVolume : 0),
    0,
  );
  if (totalVolSum <= 0) return 0;
  const ratio = usedVolSum / totalVolSum;
  if (!Number.isFinite(ratio)) return 0;
  return parseFloat((ratio * 100).toFixed(1));
}

/**
 * 获取容积率对应的颜色主题（支持自定义阈值）
 *
 * @param rate - 容积率百分比
 * @param warningThreshold - 预警阈值，默认 70
 * @param fullThreshold - 满仓阈值，默认 90
 * @returns MUI 颜色名称：'success' | 'warning' | 'error'
 */
export function getUtilizationColor(
  rate: number,
  warningThreshold = 70,
  fullThreshold = 90,
): 'success' | 'warning' | 'error' {
  if (rate < warningThreshold) return 'success';
  if (rate <= fullThreshold) return 'warning';
  return 'error';
}
