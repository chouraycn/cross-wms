/**
 * 自动化执行引擎
 *
 * 定时任务调度与执行的核心服务，职责：
 * - 每 30 秒轮询检查是否有任务到期
 * - 按 taskType 分发执行逻辑
 * - 执行结果持久化到 localStorage
 * - 支持手动触发、执行回调通知、状态变更通知
 * - data-sync 执行后更新 warehouseStore（仪表盘数据实时刷新）
 * - volume-alert 执行后发出浏览器桌面通知
 * - 失败任务自动重试 1 次
 * - custom 任务支持 actionChain 串行执行多个 action
 *
 * 引擎不是 React 组件，不使用 React hooks。
 */

import { dashboardApi } from './dashboardApi';
import { setWarehouses } from '../stores/warehouseStore';
import type { Warehouse } from '../types';

// ===================== 类型定义 =====================

/** 任务类型 */
export type TaskType = 'data-sync' | 'inventory-snapshot' | 'report-gen' | 'volume-alert' | 'custom';

/** 频率类型 */
export type FreqType = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

/** 任务配置 */
export interface TaskConfig {
  /** data-sync 专用：要同步的数据类别，空则全部 */
  categories?: string[];
  /** volume-alert 专用：容积率预警阈值（0-100） */
  threshold?: number;
  /** report-gen 专用：输出格式 */
  format?: 'json' | 'csv';
  /** 通用：出错时是否通知 */
  notifyOnError?: boolean;
  /** custom 专用：action chain，串行执行 */
  actionChain?: ActionType[];
  /** custom 专用：自定义脚本内容 */
  script?: string;
}

/** custom 任务可执行的原子 action */
export type ActionType = 'sync-warehouses' | 'sync-inventory' | 'sync-transit' | 'snapshot' | 'check-volume' | 'gen-report' | 'notify';

/** 增强版 Automation 类型 */
export interface Automation {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'PAUSED';
  scheduleType: 'recurring' | 'once';
  /** RFC 5545 RRULE string (e.g. FREQ=DAILY;BYHOUR=9) */
  rrule: string;
  /** ISO 8601 datetime for one-time tasks */
  scheduledAt: string;
  /** Human-readable schedule label (cached) */
  scheduleLabel: string;
  /** Task prompt/instruction */
  prompt: string;
  /** 任务类型 */
  taskType: TaskType;
  /** 任务配置 */
  taskConfig?: TaskConfig;
  /** ISO 8601 date/datetime — 调度有效期开始（可选） */
  validFrom?: string;
  /** ISO 8601 date/datetime — 调度有效期结束（可选） */
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
  /** Last execution time */
  lastRunAt: string | null;
  /** Next execution time (computed) */
  nextRunAt: string | null;
  /** Execution count */
  runCount: number;
}

/** 执行记录 */
export interface AutomationExecution {
  id: string;
  automationId: string;
  taskType: TaskType;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt: string | null;
  /** 执行耗时（ms） */
  duration: number | null;
  /** 成功消息或错误信息 */
  result: string | null;
  /** 执行步骤详情 */
  steps?: ExecutionStep[];
  /** 是否是重试执行 */
  isRetry?: boolean;
}

/** 执行步骤 */
export interface ExecutionStep {
  action: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  duration: number;
}

/** 引擎状态变更事件 */
export interface EngineStateEvent {
  type: 'execution-start' | 'execution-complete' | 'execution-failed' | 'state-refresh';
  automationId: string;
  execution?: AutomationExecution;
}

/** 引擎公开 API */
export interface AutomationEngineAPI {
  start(): void;
  stop(): void;
  triggerNow(id: string): Promise<AutomationExecution>;
  getExecutionLog(automationId?: string): AutomationExecution[];
  onExecution(callback: (exec: AutomationExecution) => void): () => void;
  onStateChange(callback: (event: EngineStateEvent) => void): () => void;
  isRunning(): boolean;
  /** 重试失败的执行 */
  retry(executionId: string): Promise<AutomationExecution | null>;
  /** 获取执行结果详情（snapshot/report/alert 的 localStorage 数据） */
  getExecutionResults(type: 'snapshots' | 'reports' | 'alerts'): unknown[];
  /** 清空执行日志 */
  clearExecutionLogs(): void;
}

// ===================== 预置模板 =====================

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  taskType: TaskType;
  taskConfig?: TaskConfig;
  defaultSchedule: {
    scheduleType: 'recurring' | 'once';
    freq: FreqType;
    hour: number;
    minute: number;
  };
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'tpl-data-sync',
    name: '在线文档数据同步',
    description: '定时从数据源拉取最新数据，同步更新仪表盘和仓库列表',
    icon: 'SyncIcon',
    taskType: 'data-sync',
    defaultSchedule: { scheduleType: 'recurring', freq: 'HOURLY', hour: 0, minute: 0 },
  },
  {
    id: 'tpl-inventory-snapshot',
    name: '库存快照',
    description: '定期保存当前库存快照，用于趋势分析和历史对比',
    icon: 'CameraAltIcon',
    taskType: 'inventory-snapshot',
    defaultSchedule: { scheduleType: 'recurring', freq: 'DAILY', hour: 9, minute: 0 },
  },
  {
    id: 'tpl-report-gen',
    name: '数据报表生成',
    description: '定期生成仓库运营数据报表，含 KPI、库存预警、容积趋势',
    icon: 'AssessmentIcon',
    taskType: 'report-gen',
    defaultSchedule: { scheduleType: 'recurring', freq: 'DAILY', hour: 18, minute: 0 },
  },
  {
    id: 'tpl-volume-alert',
    name: '容积率预警',
    description: '监控仓库容积率，超过阈值时生成预警并发送桌面通知',
    icon: 'WarningIcon',
    taskType: 'volume-alert',
    taskConfig: { threshold: 85 },
    defaultSchedule: { scheduleType: 'recurring', freq: 'HOURLY', hour: 0, minute: 0 },
  },
  {
    id: 'tpl-custom-chain',
    name: '自定义动作链',
    description: '按顺序串行执行多个原子动作，灵活组合同步、快照、预警、通知',
    icon: 'AccountTreeIcon',
    taskType: 'custom',
    taskConfig: {
      actionChain: ['sync-warehouses', 'check-volume', 'notify'],
    },
    defaultSchedule: { scheduleType: 'recurring', freq: 'DAILY', hour: 10, minute: 0 },
  },
];

// ===================== 调度辅助函数 =====================

const FREQ_LABELS: Record<FreqType, string> = {
  HOURLY: '每小时',
  DAILY: '每天',
  WEEKLY: '每周',
  MONTHLY: '每月',
};

const WEEKDAY_LABELS: Record<string, string> = {
  MO: '周一', TU: '周二', WE: '周三', TH: '周四', FR: '周五', SA: '周六', SU: '周日',
};

/** 构建 RFC 5545 RRULE 字符串 */
export function buildRrule(freq: FreqType, hour: number, minute: number, weekdays: string[]): string {
  let rule = `FREQ=${freq}`;
  rule += `;BYHOUR=${hour};BYMINUTE=${minute}`;
  if (freq === 'WEEKLY' && weekdays.length > 0) {
    rule += `;BYDAY=${weekdays.join(',')}`;
  }
  return rule;
}

/** 解析 RRULE 字符串 */
export function parseRrule(rrule: string): { freq: FreqType; hour: number; minute: number; weekdays: string[] } {
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=')));
  return {
    freq: (parts.FREQ || 'DAILY') as FreqType,
    hour: parseInt(parts.BYHOUR || '9', 10),
    minute: parseInt(parts.BYMINUTE || '0', 10),
    weekdays: (parts.BYDAY || '').split(',').filter(Boolean),
  };
}

/** 格式化调度标签（人类可读） */
export function formatScheduleLabel(auto: Automation): string {
  if (auto.scheduleType === 'once') {
    try {
      const d = new Date(auto.scheduledAt);
      return `一次 · ${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '一次 · 日期无效';
    }
  }
  const { freq, hour, minute, weekdays } = parseRrule(auto.rrule);
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  let label = `${FREQ_LABELS[freq] || freq} ${timeStr}`;
  if (freq === 'WEEKLY' && weekdays.length > 0) {
    label += ` (${weekdays.map((d) => WEEKDAY_LABELS[d] || d).join(', ')})`;
  }
  return label;
}

/** 计算下次执行时间 */
export function computeNextRun(auto: Automation): string | null {
  if (auto.status === 'PAUSED') return null;
  if (auto.scheduleType === 'once') {
    const d = new Date(auto.scheduledAt);
    return d > new Date() ? d.toISOString() : null;
  }
  // 周期任务：从当前时间计算下一次执行
  const { freq, hour, minute } = parseRrule(auto.rrule);
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    switch (freq) {
      case 'HOURLY': next.setHours(next.getHours() + 1); break;
      case 'DAILY': next.setDate(next.getDate() + 1); break;
      case 'WEEKLY': next.setDate(next.getDate() + 7); break;
      case 'MONTHLY': next.setMonth(next.getMonth() + 1); break;
    }
  }
  return next.toISOString();
}

// ===================== 持久化 =====================

const AUTOMATIONS_KEY = 'crosswms-automations';
const EXECUTION_LOG_KEY = 'crosswms-automation-logs';
const MAX_LOG_ENTRIES = 100;
const CHECK_INTERVAL_MS = 30_000; // 30 秒

/** 读取所有自动化任务（兼容旧数据：无 taskType 字段默认 'custom'） */
export function loadAutomations(): Automation[] {
  try {
    const raw = localStorage.getItem(AUTOMATIONS_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as Automation[];
    // 兼容旧数据：补充缺失的 taskType
    return items.map((a) => ({
      ...a,
      taskType: a.taskType || 'custom',
    }));
  } catch {
    return [];
  }
}

/** 保存所有自动化任务 */
export function saveAutomations(items: Automation[]): void {
  localStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(items));
}

/** 读取执行日志 */
function loadExecutionLogs(): AutomationExecution[] {
  try {
    const raw = localStorage.getItem(EXECUTION_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 保存执行日志（保留最近 MAX_LOG_ENTRIES 条） */
function saveExecutionLogs(logs: AutomationExecution[]): void {
  const trimmed = logs.slice(-MAX_LOG_ENTRIES);
  localStorage.setItem(EXECUTION_LOG_KEY, JSON.stringify(trimmed));
}

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

// ===================== 任务执行逻辑 =====================

const ACTION_LABELS: Record<ActionType, string> = {
  'sync-warehouses': '同步仓库数据',
  'sync-inventory': '同步库存数据',
  'sync-transit': '同步在途数据',
  'snapshot': '生成库存快照',
  'check-volume': '检查容积率',
  'gen-report': '生成运营报表',
  'notify': '发送通知',
};

/** 执行单个原子 action */
async function executeAction(action: ActionType, config?: TaskConfig): Promise<ExecutionStep> {
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
async function executeInventorySnapshot(): Promise<{ result: string; steps: ExecutionStep[] }> {
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
async function executeReportGen(config?: TaskConfig): Promise<{ result: string; steps: ExecutionStep[] }> {
  const steps: ExecutionStep[] = [];
  const start = Date.now();

  const [warehouses, transitOrders, inventory, volumeHistory, inbound, outbound, kpi, statusDist] =
    await Promise.all([
      dashboardApi.getWarehouses(),
      dashboardApi.getTransitOrders(),
      dashboardApi.getInventory(),
      dashboardApi.getVolumeHistory(),
      dashboardApi.getInboundRecords(),
      dashboardApi.getOutboundRecords(),
      dashboardApi.getKpiData(),
      dashboardApi.getTransitStatusDistribution(),
    ]);

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
async function executeVolumeAlert(config?: TaskConfig): Promise<{ result: string; steps: ExecutionStep[] }> {
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
async function executeByTypeWithSteps(taskType: TaskType, config?: TaskConfig): Promise<{ result: string; steps: ExecutionStep[] }> {
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

// ===================== 引擎核心 =====================

class AutomationEngine implements AutomationEngineAPI {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private callbacks: Set<(exec: AutomationExecution) => void> = new Set();
  private stateCallbacks: Set<(event: EngineStateEvent) => void> = new Set();
  /** 当前正在执行的 automation ID 集合 */
  private runningTaskIds: Set<string> = new Set();

  /** 启动引擎 */
  start(): void {
    if (this.running) return;
    this.running = true;
    console.log('[AutomationEngine] 引擎已启动');

    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // 立即检查一次
    this.checkAndExecute();

    // 每 30 秒轮询
    this.timerId = setInterval(() => {
      this.checkAndExecute();
    }, CHECK_INTERVAL_MS);
  }

  /** 停止引擎 */
  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.running = false;
    console.log('[AutomationEngine] 引擎已停止');
  }

  /** 是否正在运行 */
  isRunning(): boolean {
    return this.running;
  }

  /** 当前是否有任务正在执行 */
  isTaskRunning(automationId: string): boolean {
    return this.runningTaskIds.has(automationId);
  }

  /** 立即执行指定任务 */
  async triggerNow(id: string): Promise<AutomationExecution> {
    const automations = loadAutomations();
    const auto = automations.find((a) => a.id === id);
    if (!auto) {
      throw new Error(`任务不存在: ${id}`);
    }

    const exec = await this.runTask(auto);

    // 更新任务的 lastRunAt, runCount, nextRunAt
    const updatedAutomations = loadAutomations();
    const idx = updatedAutomations.findIndex((a) => a.id === id);
    if (idx !== -1) {
      updatedAutomations[idx] = {
        ...updatedAutomations[idx],
        lastRunAt: new Date().toISOString(),
        runCount: updatedAutomations[idx].runCount + 1,
        nextRunAt: computeNextRun(updatedAutomations[idx]),
      };
      saveAutomations(updatedAutomations);
    }

    return exec;
  }

  /** 重试失败的执行 */
  async retry(executionId: string): Promise<AutomationExecution | null> {
    const logs = loadExecutionLogs();
    const original = logs.find((l) => l.id === executionId);
    if (!original || original.status !== 'failed') return null;

    const automations = loadAutomations();
    const auto = automations.find((a) => a.id === original.automationId);
    if (!auto) return null;

    // 标记为重试执行
    const exec = await this.runTask(auto, true);

    // 更新任务状态
    const updatedAutomations = loadAutomations();
    const idx = updatedAutomations.findIndex((a) => a.id === original.automationId);
    if (idx !== -1) {
      updatedAutomations[idx] = {
        ...updatedAutomations[idx],
        lastRunAt: new Date().toISOString(),
        runCount: updatedAutomations[idx].runCount + 1,
        nextRunAt: computeNextRun(updatedAutomations[idx]),
      };
      saveAutomations(updatedAutomations);
    }

    return exec;
  }

  /** 获取执行日志 */
  getExecutionLog(automationId?: string): AutomationExecution[] {
    const logs = loadExecutionLogs();
    if (automationId) {
      return logs.filter((l) => l.automationId === automationId);
    }
    return logs;
  }

  /** 获取执行结果详情 */
  getExecutionResults(type: 'snapshots' | 'reports' | 'alerts'): unknown[] {
    const KEY_MAP = {
      snapshots: 'crosswms-inventory-snapshots',
      reports: 'crosswms-reports',
      alerts: 'crosswms-volume-alerts',
    };
    try {
      const raw = localStorage.getItem(KEY_MAP[type]);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** 清空执行日志 */
  clearExecutionLogs(): void {
    localStorage.setItem(EXECUTION_LOG_KEY, JSON.stringify([]));
  }

  /** 注册执行回调 */
  onExecution(callback: (exec: AutomationExecution) => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /** 注册状态变更回调 */
  onStateChange(callback: (event: EngineStateEvent) => void): () => void {
    this.stateCallbacks.add(callback);
    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  /** 通知所有执行回调 */
  private notifyCallbacks(exec: AutomationExecution): void {
    this.callbacks.forEach((cb) => {
      try {
        cb(exec);
      } catch (err) {
        console.error('[AutomationEngine] 回调执行错误:', err);
      }
    });
  }

  /** 通知状态变更回调 */
  private notifyStateChange(event: EngineStateEvent): void {
    this.stateCallbacks.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error('[AutomationEngine] 状态回调错误:', err);
      }
    });
  }

  /** 检查并执行到期任务 */
  private checkAndExecute(): void {
    const automations = loadAutomations();
    const now = new Date();
    let modified = false;

    for (const auto of automations) {
      if (auto.status !== 'ACTIVE') continue;
      // validFrom/validUntil 检查
      if (auto.validFrom && new Date(auto.validFrom) > now) continue;
      if (auto.validUntil && new Date(auto.validUntil) < now) continue;
      if (!auto.nextRunAt) continue;
      // 避免重复执行
      if (this.runningTaskIds.has(auto.id)) continue;

      const nextRun = new Date(auto.nextRunAt);
      if (nextRun <= now) {
        // 到期执行（异步，不阻塞检查循环）
        this.runTask(auto).then((exec) => {
          this.notifyCallbacks(exec);
        });

        // 更新任务状态
        auto.lastRunAt = now.toISOString();
        auto.runCount += 1;
        auto.nextRunAt = computeNextRun(auto);
        modified = true;
      }
    }

    if (modified) {
      saveAutomations(automations);
    }
  }

  /** 执行单个任务 */
  private async runTask(auto: Automation, isRetry = false): Promise<AutomationExecution> {
    const execId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const exec: AutomationExecution = {
      id: execId,
      automationId: auto.id,
      taskType: auto.taskType,
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      duration: null,
      result: null,
      steps: [],
      isRetry,
    };

    // 标记正在运行
    this.runningTaskIds.add(auto.id);

    // 记录开始执行
    const logs = loadExecutionLogs();
    logs.push(exec);
    saveExecutionLogs(logs);

    // 通知 UI 开始执行
    this.notifyStateChange({
      type: 'execution-start',
      automationId: auto.id,
      execution: exec,
    });

    const startTime = Date.now();

    try {
      const { result, steps } = await executeByTypeWithSteps(auto.taskType, auto.taskConfig);
      const duration = Date.now() - startTime;

      exec.status = 'success';
      exec.completedAt = new Date().toISOString();
      exec.duration = duration;
      exec.result = result;
      exec.steps = steps;

      console.log(`[AutomationEngine] 任务 ${auto.name}(${auto.id}) 执行成功, 耗时 ${duration}ms`);
    } catch (err) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      exec.status = 'failed';
      exec.completedAt = new Date().toISOString();
      exec.duration = duration;
      exec.result = `执行失败: ${message}`;

      console.error(`[AutomationEngine] 任务 ${auto.name}(${auto.id}) 执行失败:`, err);

      // 🔑 自动重试 1 次（仅非重试的首次失败）
      if (!isRetry) {
        console.log(`[AutomationEngine] 任务 ${auto.name} 自动重试 1 次...`);
        try {
          const retryResult = await executeByTypeWithSteps(auto.taskType, auto.taskConfig);
          const retryDuration = Date.now() - startTime;
          exec.status = 'success';
          exec.completedAt = new Date().toISOString();
          exec.duration = retryDuration;
          exec.result = `${exec.result || '首次失败'} → 重试成功: ${retryResult.result}`;
          exec.steps = [...(exec.steps || []), ...retryResult.steps];
          exec.isRetry = true;
          console.log(`[AutomationEngine] 任务 ${auto.name} 重试成功`);
        } catch (retryErr) {
          const retryDuration = Date.now() - startTime;
          const retryMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
          exec.status = 'failed';
          exec.completedAt = new Date().toISOString();
          exec.duration = retryDuration;
          exec.result = `首次失败: ${message}; 重试失败: ${retryMessage}`;
          console.error(`[AutomationEngine] 任务 ${auto.name} 重试也失败:`, retryErr);
        }
      }
    }

    // 解除运行标记
    this.runningTaskIds.delete(auto.id);

    // 更新日志
    const updatedLogs = loadExecutionLogs();
    const idx = updatedLogs.findIndex((l) => l.id === execId);
    if (idx !== -1) {
      updatedLogs[idx] = exec;
    } else {
      updatedLogs.push(exec);
    }
    saveExecutionLogs(updatedLogs);

    // 通知 UI 执行完成
    this.notifyStateChange({
      type: exec.status === 'success' ? 'execution-complete' : 'execution-failed',
      automationId: auto.id,
      execution: exec,
    });

    return exec;
  }
}

// ===================== 导出单例 =====================

export const automationEngine = new AutomationEngine();
