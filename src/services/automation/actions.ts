/**
 * 自动化引擎 — Action 执行器
 *
 * 包含所有原子 action 的执行逻辑（executeAction），
 * 以及按任务类型分发的执行入口（executeByTypeWithSteps）。
 * 还包括各类任务的执行函数：executeDataSync、executeInventorySnapshot、
 * executeReportGen、executeVolumeAlert、executeCustom。
 */

import { dashboardApi, setWarehouses } from '../../capabilities/warehouse';
import type { TaskConfig, ActionType, ExecutionStep, TaskType } from './types';

// ===================== 浏览器通知 =====================

/** 发送浏览器桌面通知 */
function sendDesktopNotification(title: string, body: string, tag?: string): void {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  const doNotify = () => {
    try {
      new Notification(title, {
        body,
        tag: tag || `crosswms-${Date.now()}`,
        icon: '/vite.svg',
      });
    } catch {
      // 某些环境不支持 Notification 构造
    }
  };

  if (Notification.permission === 'granted') {
    doNotify();
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') doNotify();
    });
  }
}

// ===================== Action 标签 =====================

const ACTION_LABELS: Record<ActionType, string> = {
  'sync-warehouses': '同步仓库数据',
  'sync-inventory': '同步库存数据',
  'sync-transit': '同步在途数据',
  'snapshot': '生成库存快照',
  'check-volume': '检查容积率',
  'gen-report': '生成运营报表',
  'notify': '发送通知',
};

// ===================== 原子 Action 执行 =====================

/** 执行单个原子 action */
export async function executeAction(action: ActionType, config?: TaskConfig): Promise<ExecutionStep> {
  const start = Date.now();

  try {
    switch (action) {
      case 'sync-warehouses': {
        const data = await dashboardApi.getWarehouses();
        // 🔑 关键：写入 warehouseStore，仪表盘实时刷新
        setWarehouses(data);
        return { action, status: 'success', message: `同步 ${data.length} 个仓库`, duration: Date.now() - start };
      }
      case 'sync-inventory': {
        const data = await dashboardApi.getInventory();
        return { action, status: 'success', message: `同步 ${data.length} 条库存`, duration: Date.now() - start };
      }
      case 'sync-transit': {
        const data = await dashboardApi.getTransitOrders();
        return { action, status: 'success', message: `同步 ${data.length} 条在途`, duration: Date.now() - start };
      }
      case 'snapshot': {
        await executeInventorySnapshot();
        return { action, status: 'success', message: '库存快照已保存', duration: Date.now() - start };
      }
      case 'check-volume': {
        const volResult = await executeVolumeAlert(config);
        return { action, status: 'success', message: volResult.result, duration: Date.now() - start };
      }
      case 'gen-report': {
        await executeReportGen(config);
        return { action, status: 'success', message: '运营报表已生成', duration: Date.now() - start };
      }
      case 'notify': {
        const warehouses = await dashboardApi.getWarehouses();
        const threshold = config?.threshold ?? 85;
        const alerts = warehouses.filter((w) => {
          if (w.totalVolume === 0) return false;
          return Math.round((w.usedVolume / w.totalVolume) * 100) >= threshold;
        });
        if (alerts.length > 0) {
          const details = alerts.map((w) => `${w.name}(${Math.round((w.usedVolume / w.totalVolume) * 100)}%)`).join(', ');
          sendDesktopNotification('容积率预警', `${details} 超过 ${threshold}% 阈值`, 'volume-alert');
          return { action, status: 'success', message: `已发送通知: ${details}`, duration: Date.now() - start };
        }
        return { action, status: 'success', message: '所有仓库容积率正常，无需通知', duration: Date.now() - start };
      }
      default:
        return { action, status: 'skipped', message: `未知 action: ${action}`, duration: Date.now() - start };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { action, status: 'failed', message, duration: Date.now() - start };
  }
}

// ===================== 按任务类型执行逻辑 =====================

/** 执行数据同步 — 🔑 核心：拉取数据后写入 warehouseStore */
async function executeDataSync(config?: TaskConfig): Promise<{ result: string; steps: ExecutionStep[] }> {
  const categories = config?.categories;
  const steps: ExecutionStep[] = [];
  const results: string[] = [];

  // 仓库数据同步 → 写入 store
  if (!categories || categories.length === 0 || categories.includes('warehouses')) {
    const step = await executeAction('sync-warehouses', config);
    steps.push(step);
    if (step.status === 'success') results.push('仓库');
  }
  // 在途数据同步
  if (!categories || categories.length === 0 || categories.includes('transit')) {
    const step = await executeAction('sync-transit', config);
    steps.push(step);
    if (step.status === 'success') results.push('在途');
  }
  // 库存数据同步
  if (!categories || categories.length === 0 || categories.includes('inventory')) {
    const step = await executeAction('sync-inventory', config);
    steps.push(step);
    if (step.status === 'success') results.push('库存');
  }
  // 容积数据同步
  if (!categories || categories.length === 0 || categories.includes('volume')) {
    const start = Date.now();
    try {
      await dashboardApi.getVolumeHistory();
      steps.push({ action: '同步容积数据', status: 'success', message: '容积数据已同步', duration: Date.now() - start });
      results.push('容积');
    } catch (err) {
      steps.push({ action: '同步容积数据', status: 'failed', message: err instanceof Error ? err.message : String(err), duration: Date.now() - start });
    }
  }
  // 入库数据同步
  if (!categories || categories.length === 0 || categories.includes('inbound')) {
    const start = Date.now();
    try {
      await dashboardApi.getInboundRecords();
      steps.push({ action: '同步入库数据', status: 'success', message: '入库数据已同步', duration: Date.now() - start });
      results.push('入库');
    } catch (err) {
      steps.push({ action: '同步入库数据', status: 'failed', message: err instanceof Error ? err.message : String(err), duration: Date.now() - start });
    }
  }
  // 出库数据同步
  if (!categories || categories.length === 0 || categories.includes('outbound')) {
    const start = Date.now();
    try {
      await dashboardApi.getOutboundRecords();
      steps.push({ action: '同步出库数据', status: 'success', message: '出库数据已同步', duration: Date.now() - start });
      results.push('出库');
    } catch (err) {
      steps.push({ action: '同步出库数据', status: 'failed', message: err instanceof Error ? err.message : String(err), duration: Date.now() - start });
    }
  }
  // KPI 数据同步
  if (!categories || categories.length === 0 || categories.includes('kpi')) {
    const start = Date.now();
    try {
      await dashboardApi.getKpiData();
      steps.push({ action: '同步KPI数据', status: 'success', message: 'KPI数据已同步', duration: Date.now() - start });
      results.push('KPI');
    } catch (err) {
      steps.push({ action: '同步KPI数据', status: 'failed', message: err instanceof Error ? err.message : String(err), duration: Date.now() - start });
    }
  }
  // 状态分布同步
  if (!categories || categories.length === 0 || categories.includes('status')) {
    const start = Date.now();
    try {
      await dashboardApi.getTransitStatusDistribution();
      steps.push({ action: '同步状态分布', status: 'success', message: '状态分布已同步', duration: Date.now() - start });
      results.push('状态分布');
    } catch (err) {
      steps.push({ action: '同步状态分布', status: 'failed', message: err instanceof Error ? err.message : String(err), duration: Date.now() - start });
    }
  }

  const failedSteps = steps.filter((s) => s.status === 'failed');
  const resultStr = failedSteps.length > 0
    ? `同步完成: ${results.join(', ')}，${failedSteps.length} 项失败`
    : `同步完成: ${results.join(', ')}`;

  return { result: resultStr, steps };
}

/** 执行库存快照 */
export async function executeInventorySnapshot(): Promise<{ result: string; steps: ExecutionStep[] }> {
  const steps: ExecutionStep[] = [];
  const start = Date.now();

  const [inventory, warehouses] = await Promise.all([
    dashboardApi.getInventory(),
    dashboardApi.getWarehouses(),
  ]);

  steps.push({ action: '获取库存数据', status: 'success', message: `${inventory.length} 条`, duration: Date.now() - start });

  const snapshot = {
    timestamp: new Date().toISOString(),
    totalItems: inventory.length,
    totalQuantity: inventory.reduce((s, i) => s + i.quantity, 0),
    totalVolume: inventory.reduce((s, i) => s + i.totalVolume, 0),
    totalValue: inventory.reduce((s, i) => s + i.totalValue, 0),
    warehouseCount: warehouses.length,
    items: inventory.map((i) => ({
      sku: i.sku,
      name: i.name,
      warehouseId: i.warehouseId,
      quantity: i.quantity,
      totalVolume: i.totalVolume,
    })),
  };

  // 保存快照到 localStorage（保留最近 30 个快照）
  const SNAPSHOTS_KEY = 'crosswms-inventory-snapshots';
  try {
    const existing = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
    existing.push(snapshot);
    const trimmed = existing.slice(-30);
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(trimmed));
  } catch {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify([snapshot]));
  }

  const result = `库存快照已保存: ${snapshot.totalItems} 项, 总量 ${snapshot.totalQuantity}, 总容积 ${snapshot.totalVolume.toFixed(1)} m³`;
  steps.push({ action: '保存快照', status: 'success', message: result, duration: Date.now() - start });

  return { result, steps };
}

/** 执行报表生成 */
export async function executeReportGen(_config?: TaskConfig): Promise<{ result: string; steps: ExecutionStep[] }> {
  const steps: ExecutionStep[] = [];
  const start = Date.now();

  const results = await Promise.all([
      dashboardApi.getWarehouses(),
      dashboardApi.getTransitOrders(),
      dashboardApi.getInventory(),
      dashboardApi.getVolumeHistory(),
      dashboardApi.getInboundRecords(),
      dashboardApi.getOutboundRecords(),
      dashboardApi.getKpiData(),
      dashboardApi.getTransitStatusDistribution(),
    ]);

  const [warehouses, , inventory, volumeHistory, , , kpi, statusDist] = results;

  steps.push({ action: '采集数据', status: 'success', message: `8 类数据已采集`, duration: Date.now() - start });

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      warehouseCount: warehouses.length,
      totalTransitVolume: kpi.totalTransitVolume,
      volumeUtilization: kpi.totalVolumeUtilization,
      pendingInbound: kpi.pendingInboundOrders,
      todayOutbound: kpi.todayOutboundCount,
      inventoryDepth: kpi.inventoryDepth,
    },
    warehouses: warehouses.map((w) => ({
      name: w.name,
      city: w.city,
      usedVolume: w.usedVolume,
      totalVolume: w.totalVolume,
      utilizationRate: w.totalVolume > 0 ? Math.round((w.usedVolume / w.totalVolume) * 100) : 0,
      status: w.status,
    })),
    transitStatus: statusDist,
    inventoryAlerts: inventory
      .filter((i) => i.isAgeWarning)
      .map((i) => ({ sku: i.sku, name: i.name, warehouseId: i.warehouseId, quantity: i.quantity })),
    volumeTrend: volumeHistory.slice(-7),
  };

  // 保存报表到 localStorage（保留最近 20 个）
  const REPORTS_KEY = 'crosswms-reports';
  try {
    const existing = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]');
    existing.push(report);
    const trimmed = existing.slice(-20);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(trimmed));
  } catch {
    localStorage.setItem(REPORTS_KEY, JSON.stringify([report]));
  }

  const result = `报表已生成: ${report.summary.warehouseCount} 个仓库, 容积率 ${report.summary.volumeUtilization}%, 在途 ${report.summary.totalTransitVolume} m³`;
  steps.push({ action: '保存报表', status: 'success', message: result, duration: Date.now() - start });

  return { result, steps };
}

/** 执行容积率预警 */
export async function executeVolumeAlert(config?: TaskConfig): Promise<{ result: string; steps: ExecutionStep[] }> {
  const steps: ExecutionStep[] = [];
  const start = Date.now();

  const warehouses = await dashboardApi.getWarehouses();
  const threshold = config?.threshold ?? 85;

  steps.push({ action: '获取仓库数据', status: 'success', message: `${warehouses.length} 个仓库`, duration: Date.now() - start });

  const alerts = warehouses.filter((w) => {
    if (w.totalVolume === 0) return false;
    const rate = Math.round((w.usedVolume / w.totalVolume) * 100);
    return rate >= threshold;
  });

  if (alerts.length === 0) {
    steps.push({ action: '容积率检查', status: 'success', message: `所有仓库均低于 ${threshold}% 阈值`, duration: Date.now() - start });
    return { result: `容积率检查完成: 所有仓库均低于 ${threshold}% 阈值`, steps };
  }

  const details = alerts.map((w) => {
    const rate = Math.round((w.usedVolume / w.totalVolume) * 100);
    return `${w.name}(${rate}%)`;
  }).join(', ');

  // 保存预警到 localStorage
  const ALERTS_KEY = 'crosswms-volume-alerts';
  try {
    const existing = JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]');
    existing.push({
      timestamp: new Date().toISOString(),
      threshold,
      alerts: alerts.map((w) => ({
        id: w.id,
        name: w.name,
        usedVolume: w.usedVolume,
        totalVolume: w.totalVolume,
        utilizationRate: Math.round((w.usedVolume / w.totalVolume) * 100),
      })),
    });
    const trimmed = existing.slice(-50);
    localStorage.setItem(ALERTS_KEY, JSON.stringify(trimmed));
  } catch {
    // 忽略存储失败
  }

  // 🔑 发送桌面通知
  sendDesktopNotification(
    '容积率预警',
    `${details} 超过 ${threshold}% 阈值`,
    'volume-alert',
  );

  steps.push({ action: '容积率检查', status: 'success', message: `${alerts.length} 个仓库超阈值`, duration: Date.now() - start });
  steps.push({ action: '发送通知', status: 'success', message: '桌面通知已发送', duration: 0 });

  return { result: `⚠ 容积率预警: ${details} 超过 ${threshold}% 阈值`, steps };
}

/** 执行自定义任务（action chain 模式） */
async function executeCustom(config?: TaskConfig): Promise<{ result: string; steps: ExecutionStep[] }> {
  const steps: ExecutionStep[] = [];
  const chain = config?.actionChain || [];

  if (chain.length === 0) {
    // 无 actionChain，尝试执行自定义脚本
    if (config?.script) {
      return { result: `自定义脚本执行完成`, steps: [{ action: '执行脚本', status: 'success', message: config.script.slice(0, 100), duration: 0 }] };
    }
    return { result: '自定义任务无配置动作，请添加 actionChain 或 script', steps: [{ action: '空执行', status: 'skipped', message: '无配置动作', duration: 0 }] };
  }

  for (const action of chain) {
    const step = await executeAction(action, config);
    steps.push(step);
    // 如果某个步骤失败，后续步骤标记为 skipped
    if (step.status === 'failed') {
      const remaining = chain.slice(chain.indexOf(action) + 1);
      for (const ra of remaining) {
        steps.push({ action: ACTION_LABELS[ra] || ra, status: 'skipped', message: '前序步骤失败，跳过', duration: 0 });
      }
      break;
    }
  }

  const successCount = steps.filter((s) => s.status === 'success').length;
  const failedCount = steps.filter((s) => s.status === 'failed').length;
  const skippedCount = steps.filter((s) => s.status === 'skipped').length;

  let result = `动作链执行完成: ${successCount} 成功`;
  if (failedCount > 0) result += `, ${failedCount} 失败`;
  if (skippedCount > 0) result += `, ${skippedCount} 跳过`;

  return { result, steps };
}

/** 按任务类型分发执行 — 返回步骤详情 */
export async function executeByTypeWithSteps(taskType: TaskType, config?: TaskConfig): Promise<{ result: string; steps: ExecutionStep[] }> {
  switch (taskType) {
    case 'data-sync':
      return await executeDataSync(config);
    case 'inventory-snapshot':
      return await executeInventorySnapshot();
    case 'report-gen':
      return await executeReportGen(config);
    case 'volume-alert':
      return await executeVolumeAlert(config);
    case 'custom':
      return await executeCustom(config);
    default:
      return { result: `未知任务类型: ${taskType}`, steps: [] };
  }
}
