/**
 * 自动化引擎 — Action 执行器
 *
 * 后端版本的 action 执行逻辑，直接操作数据库（通过 server/db.ts 的 DAO 函数），
 * 不再依赖浏览器环境。支持 data-sync、inventory-snapshot、report-gen、
 * volume-alert、skill-chain、custom 六种任务类型。
 */

import { initDb } from '../db.js';
import {
  getWarehouses,
  getInventoryItems,
  getTransitOrders,
  getInboundRecords,
  getOutboundRecords,
} from '../dao/warehouse.js';
import { checkAllPredictions } from '../services/predictionService.js';
import { generateSuggestions } from '../services/replenishmentService.js';

// ===================== 类型定义 =====================

export interface ExecutionStep {
  action: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  duration: number;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: unknown;
  steps: ExecutionStep[];
  shouldNotify: boolean;
}

// ===================== 辅助函数 =====================

/** 记录步骤耗时并把步骤加入数组 */
function recordStep(
  steps: ExecutionStep[],
  action: string,
  status: 'success' | 'failed' | 'skipped',
  message: string,
  start: number,
): void {
  steps.push({
    action,
    status,
    message,
    duration: Date.now() - start,
  });
}

/** 检查是否超时 */
function checkTimeout(startTime: number, automation: any): void {
  const executionPolicy = automation.executionPolicy;
  const timeoutMs =
    typeof executionPolicy?.timeoutMs === 'number'
      ? executionPolicy.timeoutMs
      : 30000;
  if (Date.now() - startTime > timeoutMs) {
    throw new Error(`执行超时（超过 ${timeoutMs}ms）`);
  }
}

/** 判断是否需要发送通知 */
function resolveShouldNotify(
  automation: any,
  hasFailure: boolean,
): boolean {
  const cfg = automation.notificationConfig;
  if (!cfg) return false;
  if (hasFailure && cfg.onFailure) return true;
  if (!hasFailure && cfg.onSuccess) return true;
  return false;
}

// ===================== 按任务类型执行实现 =====================

/** data-sync：从数据库读取数据，返回同步结果 */
async function executeDataSync(
  automation: any,
  startTime: number,
  steps: ExecutionStep[],
): Promise<unknown> {
  const categories: string[] | undefined =
    automation.taskConfig?.categories as string[] | undefined;

  const result: Record<string, unknown> = {};

  // 仓库数据
  if (!categories || categories.length === 0 || categories.includes('warehouses')) {
    const t = Date.now();
    try {
      checkTimeout(startTime, automation);
      const warehouses = getWarehouses();
      result.warehouses = warehouses;
      recordStep(steps, '同步仓库数据', 'success', `同步 ${warehouses.length} 个仓库`, t);
    } catch (err) {
      recordStep(steps, '同步仓库数据', 'failed', err instanceof Error ? err.message : String(err), t);
    }
  }

  // 库存数据
  if (!categories || categories.length === 0 || categories.includes('inventory')) {
    const t = Date.now();
    try {
      checkTimeout(startTime, automation);
      const inventory = getInventoryItems();
      result.inventory = inventory;
      recordStep(steps, '同步库存数据', 'success', `同步 ${inventory.length} 条库存`, t);
    } catch (err) {
      recordStep(steps, '同步库存数据', 'failed', err instanceof Error ? err.message : String(err), t);
    }
  }

  // 在途数据
  if (!categories || categories.length === 0 || categories.includes('transit')) {
    const t = Date.now();
    try {
      checkTimeout(startTime, automation);
      const transit = getTransitOrders();
      result.transit = transit;
      recordStep(steps, '同步在途数据', 'success', `同步 ${transit.length} 条在途`, t);
    } catch (err) {
      recordStep(steps, '同步在途数据', 'failed', err instanceof Error ? err.message : String(err), t);
    }
  }

  // 入库数据
  if (!categories || categories.length === 0 || categories.includes('inbound')) {
    const t = Date.now();
    try {
      checkTimeout(startTime, automation);
      const inbound = getInboundRecords();
      result.inbound = inbound;
      recordStep(steps, '同步入库数据', 'success', `同步 ${inbound.length} 条入库记录`, t);
    } catch (err) {
      recordStep(steps, '同步入库数据', 'failed', err instanceof Error ? err.message : String(err), t);
    }
  }

  // 出库数据
  if (!categories || categories.length === 0 || categories.includes('outbound')) {
    const t = Date.now();
    try {
      checkTimeout(startTime, automation);
      const outbound = getOutboundRecords();
      result.outbound = outbound;
      recordStep(steps, '同步出库数据', 'success', `同步 ${outbound.length} 条出库记录`, t);
    } catch (err) {
      recordStep(steps, '同步出库数据', 'failed', err instanceof Error ? err.message : String(err), t);
    }
  }

  return result;
}

/** inventory-snapshot：读取当前库存，返回快照 */
async function executeInventorySnapshot(
  automation: any,
  startTime: number,
  steps: ExecutionStep[],
): Promise<unknown> {
  const t = Date.now();
  try {
    checkTimeout(startTime, automation);
    const items = getInventoryItems();
    const totalQuantity = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const totalVolume = items.reduce((sum, i) => sum + (Number(i.totalVolume) || 0), 0);
    const totalValue = items.reduce((sum, i) => sum + (Number(i.totalValue) || 0), 0);

    // 按 warehouseId 分组统计
    const byWarehouse: Record<string, { count: number; quantity: number; volume: number; value: number }> = {};
    for (const item of items) {
      const wid = String(item.warehouseId ?? 'unknown');
      if (!byWarehouse[wid]) {
        byWarehouse[wid] = { count: 0, quantity: 0, volume: 0, value: 0 };
      }
      byWarehouse[wid].count += 1;
      byWarehouse[wid].quantity += Number(item.quantity) || 0;
      byWarehouse[wid].volume += Number(item.totalVolume) || 0;
      byWarehouse[wid].value += Number(item.totalValue) || 0;
    }

    const summary = {
      totalItems: items.length,
      totalQuantity,
      totalVolume,
      totalValue,
      warehouseCount: Object.keys(byWarehouse).length,
      byWarehouse,
    };

    recordStep(steps, '生成库存快照', 'success', `快照生成完成: ${items.length} 项`, t);

    return {
      timestamp: new Date().toISOString(),
      items: items.map((i) => ({
        sku: i.sku,
        name: i.name,
        warehouseId: i.warehouseId,
        quantity: i.quantity,
        totalVolume: i.totalVolume,
        totalValue: i.totalValue,
      })),
      summary,
    };
  } catch (err) {
    recordStep(steps, '生成库存快照', 'failed', err instanceof Error ? err.message : String(err), t);
    return null;
  }
}

/** report-gen：生成运营报表数据 */
async function executeReportGen(
  automation: any,
  startTime: number,
  steps: ExecutionStep[],
): Promise<unknown> {
  const t = Date.now();

  try {
    checkTimeout(startTime, automation);

    const warehouses = getWarehouses();
    const inventory = getInventoryItems();
    const transit = getTransitOrders();
    const inbound = getInboundRecords();
    const outbound = getOutboundRecords();

    // 计算指标
    const totalWarehouses = warehouses.length;
    const totalInventoryItems = inventory.length;
    const totalInventoryQuantity = inventory.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const totalInventoryVolume = inventory.reduce((s, i) => s + (Number(i.totalVolume) || 0), 0);
    const totalInventoryValue = inventory.reduce((s, i) => s + (Number(i.totalValue) || 0), 0);
    const totalTransitOrders = transit.length;
    const totalTransitVolume = transit.reduce((s, o) => s + (Number(o.volume) || 0), 0);
    const totalTransitValue = transit.reduce((s, o) => s + (Number(o.value) || 0), 0);
    const totalInboundRecords = inbound.length;
    const totalOutboundRecords = outbound.length;

    // 容积率
    const warehouseUtilization = warehouses.map((w) => {
      const rate = w.totalVolume > 0 ? Math.round((w.usedVolume / w.totalVolume) * 100) : 0;
      return {
        id: w.id,
        name: w.name,
        usedVolume: w.usedVolume,
        totalVolume: w.totalVolume,
        utilizationRate: rate,
        status: w.status,
      };
    });

    // 库龄预警
    const ageAlerts = inventory
      .filter((i) => i.isAgeWarning === true)
      .map((i) => ({
        sku: i.sku,
        name: i.name,
        warehouseId: i.warehouseId,
        quantity: i.quantity,
        inboundDate: i.inboundDate,
      }));

    const data = {
      summary: {
        totalWarehouses,
        totalInventoryItems,
        totalInventoryQuantity,
        totalInventoryVolume,
        totalInventoryValue,
        totalTransitOrders,
        totalTransitVolume,
        totalTransitValue,
        totalInboundRecords,
        totalOutboundRecords,
        avgVolumeUtilization:
          warehouseUtilization.length > 0
            ? Math.round(
                warehouseUtilization.reduce((s, w) => s + w.utilizationRate, 0) /
                  warehouseUtilization.length,
              )
            : 0,
      },
      warehouseUtilization,
      ageAlerts,
      transitBreakdown: transit.map((o) => ({
        trackingNo: o.trackingNo,
        from: o.fromWarehouseId,
        to: o.toWarehouseId,
        status: o.status,
        volume: o.volume,
        estimatedArrival: o.estimatedArrival,
      })),
    };

    recordStep(steps, '生成运营报表', 'success', `报表生成完成`, t);

    return {
      generatedAt: new Date().toISOString(),
      period: 'current',
      data,
    };
  } catch (err) {
    recordStep(steps, '生成运营报表', 'failed', err instanceof Error ? err.message : String(err), t);
    return null;
  }
}

/** volume-alert：检查所有仓库容积率，返回预警信息 */
async function executeVolumeAlert(
  automation: any,
  startTime: number,
  steps: ExecutionStep[],
): Promise<unknown> {
  const t = Date.now();

  try {
    checkTimeout(startTime, automation);

    const warehouses = getWarehouses();

    const threshold: number =
      typeof automation.taskConfig?.threshold === 'number'
        ? automation.taskConfig.threshold
        : 80;

    recordStep(steps, '获取仓库数据', 'success', `${warehouses.length} 个仓库`, t);

    const checkStart = Date.now();
    const alertList: Array<{
      id: string;
      name: string;
      usedVolume: number;
      totalVolume: number;
      utilizationRate: number;
      threshold: number;
    }> = [];

    for (const w of warehouses) {
      if (w.totalVolume === 0) continue;
      const rate = Math.round((w.usedVolume / w.totalVolume) * 100);
      if (rate >= threshold) {
        alertList.push({
          id: w.id,
          name: w.name,
          usedVolume: w.usedVolume,
          totalVolume: w.totalVolume,
          utilizationRate: rate,
          threshold,
        });
      }
    }

    if (alertList.length === 0) {
      recordStep(steps, '容积率检查', 'success', `所有仓库均低于 ${threshold}% 阈值`, checkStart);
    } else {
      const details = alertList.map((a) => `${a.name}(${a.utilizationRate}%)`).join(', ');
      recordStep(steps, '容积率检查', 'success', `${alertList.length} 个仓库超阈值: ${details}`, checkStart);
    }

    return {
      alerts: alertList,
      checkedAt: new Date().toISOString(),
      threshold,
      totalWarehouses: warehouses.length,
    };
  } catch (err) {
    recordStep(steps, '容积率检查', 'failed', err instanceof Error ? err.message : String(err), t);
    return null;
  }
}

/** inventory-prediction：智能库存预测扫描 */
async function executeInventoryPrediction(
  automation: any,
  startTime: number,
  steps: ExecutionStep[],
): Promise<unknown> {
  const t = Date.now();
  try {
    checkTimeout(startTime, automation);
    const db = initDb();

    // 从 taskConfig 读取预测配置
    const taskConfig = (automation.taskConfig ?? {}) as Record<string, unknown>;
    const predictionConfig = {
      enabled: taskConfig.enablePrediction !== false,
      predictionDays: typeof taskConfig.predictionDays === 'number' ? taskConfig.predictionDays : 14,
      shortageThreshold: typeof taskConfig.shortageThreshold === 'number' ? taskConfig.shortageThreshold : 10,
      overstockDays: typeof taskConfig.overstockDays === 'number' ? taskConfig.overstockDays : 60,
      minHistoryDays: typeof taskConfig.minHistoryDays === 'number' ? taskConfig.minHistoryDays : 7,
    };

    const result = await checkAllPredictions(predictionConfig);

    const totalPredicted = result.predictedShortageAlerts + result.predictedOverstockAlerts;
    if (totalPredicted === 0) {
      recordStep(steps, '智能预测扫描', 'success', '未发现新的预测预警', t);
    } else {
      const parts: string[] = [];
      if (result.predictedShortageAlerts > 0) {
        parts.push(`${result.predictedShortageAlerts} 条预测短缺`);
      }
      if (result.predictedOverstockAlerts > 0) {
        parts.push(`${result.predictedOverstockAlerts} 条预测积压`);
      }
      recordStep(steps, '智能预测扫描', 'success', `发现 ${parts.join('、')} 预警`, t);
    }

    return { ...result, checkedAt: new Date().toISOString(), config: predictionConfig };
  } catch (err) {
    recordStep(steps, '智能预测扫描', 'failed', err instanceof Error ? err.message : String(err), t);
    return null;
  }
}

/** replenishment-suggestion：智能补货建议生成 */
async function executeReplenishmentSuggestion(
  automation: any,
  startTime: number,
  steps: ExecutionStep[],
): Promise<unknown> {
  const t = Date.now();
  try {
    checkTimeout(startTime, automation);

    // 从 taskConfig 读取补货配置
    const taskConfig = (automation.taskConfig ?? {}) as Record<string, unknown>;
    const replenishmentConfig = {
      coverDays: typeof taskConfig.coverDays === 'number' ? taskConfig.coverDays : 14,
      enableAutoGenerate: taskConfig.enableAutoGenerate !== false,
      minHistoryDays: typeof taskConfig.minHistoryDays === 'number' ? taskConfig.minHistoryDays : 7,
    };

    const result = generateSuggestions(replenishmentConfig);

    if (result.created === 0) {
      recordStep(steps, '生成补货建议', 'success', '未发现新的补货需求', t);
    } else {
      recordStep(steps, '生成补货建议', 'success', `${result.created} 条建议`, t);
    }

    return { ...result, generatedAt: new Date().toISOString(), config: replenishmentConfig };
  } catch (err) {
    recordStep(steps, '生成补货建议', 'failed', err instanceof Error ? err.message : String(err), t);
    return null;
  }
}

/** skill-chain：调用技能链执行端点 */
async function executeSkillChain(
  automation: any,
  startTime: number,
  steps: ExecutionStep[],
): Promise<unknown> {
  const t = Date.now();
  const taskConfig = automation.taskConfig as Record<string, unknown> | undefined;
  const chainId = taskConfig?.chainId as string | undefined;

  if (!chainId) {
    recordStep(steps, '执行技能链', 'failed', '未配置技能链 ID', t);
    return null;
  }

  try {
    checkTimeout(startTime, automation);

    // 后端对后端的内部调用，使用 localhost
    const res = await fetch(
      `http://localhost:3001/api/skill-chains/${encodeURIComponent(chainId)}/execute`,
      { method: 'POST' },
    );

    if (!res.ok) {
      const errText = await res.text();
      recordStep(steps, '执行技能链', 'failed', `HTTP ${res.status}: ${errText}`, t);
      return { chainId, status: 'failed', error: errText };
    }

    const data = await res.json();
    recordStep(steps, '执行技能链', 'success', `技能链 ${chainId} 已触发`, t);
    return { chainId, status: 'success', data };
  } catch (err) {
    recordStep(steps, '执行技能链', 'failed', err instanceof Error ? err.message : String(err), t);
    return null;
  }
}

/** custom：执行自定义 action chain */
async function executeCustom(
  automation: any,
  startTime: number,
  steps: ExecutionStep[],
): Promise<unknown> {
  const t = Date.now();
  const taskConfig = automation.taskConfig as Record<string, unknown> | undefined;
  const actionChain = taskConfig?.actionChain as string[] | undefined;

  if (!actionChain || actionChain.length === 0) {
    recordStep(steps, '自定义任务', 'skipped', '无配置动作', t);
    return null;
  }

  const actionResults: Record<string, unknown> = {};

  for (const action of actionChain) {
    const at = Date.now();
    try {
      checkTimeout(startTime, automation);

      switch (action) {
        case 'sync-warehouses': {
          const warehouses = getWarehouses();
          actionResults.warehouses = warehouses;
          recordStep(steps, '同步仓库数据', 'success', `${warehouses.length} 个仓库`, at);
          break;
        }
        case 'sync-inventory': {
          const inventory = getInventoryItems();
          actionResults.inventory = inventory;
          recordStep(steps, '同步库存数据', 'success', `${inventory.length} 条库存`, at);
          break;
        }
        case 'sync-transit': {
          const transit = getTransitOrders();
          actionResults.transit = transit;
          recordStep(steps, '同步在途数据', 'success', `${transit.length} 条在途`, at);
          break;
        }
        case 'snapshot': {
          // 内联执行快照：读取库存数据并生成摘要
          const items = getInventoryItems();
          actionResults.snapshot = {
            timestamp: new Date().toISOString(),
            totalItems: items.length,
            totalQuantity: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
            totalVolume: items.reduce((s, i) => s + (Number(i.totalVolume) || 0), 0),
            totalValue: items.reduce((s, i) => s + (Number(i.totalValue) || 0), 0),
          };
          recordStep(steps, '生成库存快照', 'success', `${items.length} 项`, at);
          break;
        }
        case 'check-volume': {
          const warehouses = getWarehouses();
          const threshold = typeof taskConfig?.threshold === 'number' ? taskConfig.threshold : 80;
          const alertList = warehouses
            .filter((w) => w.totalVolume > 0)
            .filter((w) => Math.round((w.usedVolume / w.totalVolume) * 100) >= threshold);
          actionResults.volumeCheck = {
            threshold,
            alertCount: alertList.length,
            alerts: alertList.map((w) => ({
              id: w.id,
              name: w.name,
              utilizationRate: Math.round((w.usedVolume / w.totalVolume) * 100),
            })),
          };
          recordStep(steps, '检查容积率', 'success', `${alertList.length} 个仓库超阈值`, at);
          break;
        }
        case 'gen-report': {
          // 生成简化报表
          const warehouses = getWarehouses();
          const inventory = getInventoryItems();
          actionResults.report = {
            generatedAt: new Date().toISOString(),
            warehouseCount: warehouses.length,
            inventoryCount: inventory.length,
            totalQuantity: inventory.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
          };
          recordStep(steps, '生成运营报表', 'success', '报表已生成', at);
          break;
        }
        case 'notify': {
          // 通知不在 executor 直接触发，由 notifier.ts 处理
          recordStep(steps, '发送通知', 'success', '已标记通知（由 notifier 处理）', at);
          break;
        }
        default: {
          recordStep(steps, action, 'skipped', `未知 action: ${action}`, at);
          break;
        }
      }
    } catch (err) {
      recordStep(steps, action, 'failed', err instanceof Error ? err.message : String(err), at);
    }
  }

  return actionResults;
}

// ===================== 重试辅助 =====================

/** 计算退避延迟 */
function computeBackoffDelay(
  intervalMs: number,
  attempt: number,
  backoff: 'fixed' | 'exponential',
): number {
  if (backoff === 'exponential') {
    return intervalMs * Math.pow(2, attempt - 1);
  }
  return intervalMs;
}

// ===================== 主入口 =====================

/**
 * 执行一次自动化任务（内部实现，不含重试）
 */
async function executeOnce(automation: any, startTime: number): Promise<{
  data: unknown;
  steps: ExecutionStep[];
}> {
  const steps: ExecutionStep[] = [];
  let data: unknown = null;
  const taskType = automation.taskType as string;

  try {
    switch (taskType) {
      case 'data-sync':
        data = await executeDataSync(automation, startTime, steps);
        break;
      case 'inventory-snapshot':
        data = await executeInventorySnapshot(automation, startTime, steps);
        break;
      case 'report-gen':
        data = await executeReportGen(automation, startTime, steps);
        break;
      case 'volume-alert':
        data = await executeVolumeAlert(automation, startTime, steps);
        break;
      case 'inventory-prediction':
        data = await executeInventoryPrediction(automation, startTime, steps);
        break;
      case 'replenishment-suggestion':
        data = await executeReplenishmentSuggestion(automation, startTime, steps);
        break;
      case 'skill-chain':
        data = await executeSkillChain(automation, startTime, steps);
        break;
      case 'custom':
        data = await executeCustom(automation, startTime, steps);
        break;
      default: {
        steps.push({
          action: `未知任务类型: ${taskType}`,
          status: 'skipped',
          message: `不支持的任务类型: ${taskType}`,
          duration: Date.now() - startTime,
        });
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps.push({
      action: '执行自动化',
      status: 'failed',
      message,
      duration: Date.now() - startTime,
    });
  }

  return { data, steps };
}

/**
 * 执行自动化任务（含执行策略重试）
 *
 * @param automation - 自动化数据对象（AutomationData），包含 executionPolicy
 * @returns 执行结果，包含成功/失败状态、步骤详情、数据、通知标志
 */
export async function executeAutomation(automation: any): Promise<ExecutionResult> {
  const startTime = Date.now();

  // 读取执行策略
  const executionPolicy = automation.executionPolicy as Record<string, unknown> | null | undefined;
  const retry = (executionPolicy?.retry ?? {}) as Record<string, unknown>;
  const maxAttempts: number = typeof retry?.maxAttempts === 'number' && retry.maxAttempts > 0
    ? retry.maxAttempts
    : 1;
  const intervalMs: number = typeof retry?.intervalMs === 'number'
    ? retry.intervalMs
    : 5_000;
  const backoff: 'fixed' | 'exponential' =
    retry?.backoff === 'exponential' ? 'exponential' : 'fixed';

  const allSteps: ExecutionStep[] = [];
  let lastData: unknown = null;
  let lastFailureSteps: ExecutionStep[] | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();

    // 超时检查（每次尝试前）
    const timeoutMs: number =
      typeof executionPolicy?.timeoutMs === 'number'
        ? executionPolicy.timeoutMs
        : 30_000;

    if (Date.now() - startTime > timeoutMs && attempt > 1) {
      allSteps.push({
        action: `重试 ${attempt}/${maxAttempts}`,
        status: 'skipped',
        message: `总执行时间已超 ${timeoutMs}ms，跳过重试`,
        duration: 0,
      });
      break;
    }

    const { data, steps } = await executeOnce({ ...automation, executionPolicy: { timeoutMs } }, attemptStart);

    allSteps.push(...steps);

    const hasFailure = steps.some((s) => s.status === 'failed');
    if (!hasFailure) {
      // 成功 — 直接返回
      const totalDuration = Date.now() - startTime;
      return {
        success: true,
        message: `执行完成: ${allSteps.length} 个步骤, 全部成功 (${totalDuration}ms)${attempt > 1 ? ` (重试${attempt - 1}次)` : ''}`,
        data,
        steps: allSteps,
        shouldNotify: resolveShouldNotify(automation, false),
      };
    }

    // 记录失败
    lastData = data;
    lastFailureSteps = steps;

    if (attempt < maxAttempts) {
      const delay = computeBackoffDelay(intervalMs, attempt, backoff);
      allSteps.push({
        action: `等待重试 ${attempt + 1}/${maxAttempts}`,
        status: 'skipped',
        message: `${backoff === 'exponential' ? '指数退避' : '固定间隔'} ${delay}ms`,
        duration: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // 所有重试均失败
  const totalDuration = Date.now() - startTime;
  const failedSteps = allSteps.filter((s) => s.status === 'failed');
  const failedMsgs = failedSteps.map((s) => `${s.action}: ${s.message}`).join('; ');

  return {
    success: false,
    message: `执行失败 (${maxAttempts}次尝试): ${allSteps.length} 个步骤, ${failedSteps.length} 个失败 — ${failedMsgs}`,
    data: lastData,
    steps: allSteps,
    shouldNotify: resolveShouldNotify(automation, true),
  };
}

export default executeAutomation;
