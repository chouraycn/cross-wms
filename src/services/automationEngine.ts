/**
 * 自动化执行引擎
 *
 * 定时任务调度与执行的核心服务，职责：
 * - 每 30 秒轮询检查是否有任务到期
 * - 按 taskType 分发执行逻辑
 * - 执行结果持久化到 localStorage
 * - 支持手动触发、执行回调通知
 *
 * 引擎不是 React 组件，不使用 React hooks。
 */

import { dashboardApi } from './dashboardApi';

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
}

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
}

/** 引擎公开 API */
export interface AutomationEngineAPI {
  start(): void;
  stop(): void;
  triggerNow(id: string): Promise<AutomationExecution>;
  getExecutionLog(automationId?: string): AutomationExecution[];
  onExecution(callback: (exec: AutomationExecution) => void): () => void;
  isRunning(): boolean;
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
    description: '定时从腾讯文档拉取最新数据，更新仪表盘',
    icon: 'SyncIcon',
    taskType: 'data-sync',
    defaultSchedule: { scheduleType: 'recurring', freq: 'HOURLY', hour: 0, minute: 0 },
  },
  {
    id: 'tpl-inventory-snapshot',
    name: '库存快照',
    description: '定期保存当前库存快照，用于趋势分析',
    icon: 'CameraAltIcon',
    taskType: 'inventory-snapshot',
    defaultSchedule: { scheduleType: 'recurring', freq: 'DAILY', hour: 9, minute: 0 },
  },
  {
    id: 'tpl-report-gen',
    name: '数据报表生成',
    description: '定期生成仓库运营数据报表',
    icon: 'AssessmentIcon',
    taskType: 'report-gen',
    defaultSchedule: { scheduleType: 'recurring', freq: 'DAILY', hour: 18, minute: 0 },
  },
  {
    id: 'tpl-volume-alert',
    name: '容积率预警',
    description: '监控仓库容积率，超过阈值时生成预警',
    icon: 'WarningIcon',
    taskType: 'volume-alert',
    taskConfig: { threshold: 85 },
    defaultSchedule: { scheduleType: 'recurring', freq: 'HOURLY', hour: 0, minute: 0 },
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

// ===================== 任务执行逻辑 =====================

/** 执行数据同步（复用 useDataSync 的逻辑，但是纯 async 函数） */
async function executeDataSync(config?: TaskConfig): Promise<string> {
  const categories = config?.categories;
  // 如果指定了 categories，只同步对应数据；否则全部同步
  const results: string[] = [];

  if (!categories || categories.length === 0 || categories.includes('warehouses')) {
    await dashboardApi.getWarehouses();
    results.push('仓库');
  }
  if (!categories || categories.length === 0 || categories.includes('transit')) {
    await dashboardApi.getTransitOrders();
    results.push('在途');
  }
  if (!categories || categories.length === 0 || categories.includes('inventory')) {
    await dashboardApi.getInventory();
    results.push('库存');
  }
  if (!categories || categories.length === 0 || categories.includes('volume')) {
    await dashboardApi.getVolumeHistory();
    results.push('容积');
  }
  if (!categories || categories.length === 0 || categories.includes('inbound')) {
    await dashboardApi.getInboundRecords();
    results.push('入库');
  }
  if (!categories || categories.length === 0 || categories.includes('outbound')) {
    await dashboardApi.getOutboundRecords();
    results.push('出库');
  }
  if (!categories || categories.length === 0 || categories.includes('kpi')) {
    await dashboardApi.getKpiData();
    results.push('KPI');
  }
  if (!categories || categories.length === 0 || categories.includes('status')) {
    await dashboardApi.getTransitStatusDistribution();
    results.push('状态分布');
  }

  return `同步完成: ${results.join(', ')}`;
}

/** 执行库存快照 */
async function executeInventorySnapshot(): Promise<string> {
  const [inventory, warehouses] = await Promise.all([
    dashboardApi.getInventory(),
    dashboardApi.getWarehouses(),
  ]);

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

  return `库存快照已保存: ${snapshot.totalItems} 项, 总量 ${snapshot.totalQuantity}, 总容积 ${snapshot.totalVolume.toFixed(1)} m³`;
}

/** 执行报表生成 */
async function executeReportGen(config?: TaskConfig): Promise<string> {
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

  return `报表已生成: ${report.summary.warehouseCount} 个仓库, 容积率 ${report.summary.volumeUtilization}%, 在途 ${report.summary.totalTransitVolume} m³`;
}

/** 执行容积率预警 */
async function executeVolumeAlert(config?: TaskConfig): Promise<string> {
  const warehouses = await dashboardApi.getWarehouses();
  const threshold = config?.threshold ?? 85;

  const alerts = warehouses.filter((w) => {
    if (w.totalVolume === 0) return false;
    const rate = Math.round((w.usedVolume / w.totalVolume) * 100);
    return rate >= threshold;
  });

  if (alerts.length === 0) {
    return `容积率检查完成: 所有仓库均低于 ${threshold}% 阈值`;
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

  return `⚠ 容积率预警: ${details} 超过 ${threshold}% 阈值`;
}

/** 按任务类型分发执行 */
async function executeByType(taskType: TaskType, config?: TaskConfig): Promise<string> {
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
      return '自定义任务执行完成（无具体执行逻辑）';
    default:
      return `未知任务类型: ${taskType}`;
  }
}

// ===================== 引擎核心 =====================

class AutomationEngine implements AutomationEngineAPI {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private callbacks: Set<(exec: AutomationExecution) => void> = new Set();

  /** 启动引擎 */
  start(): void {
    if (this.running) return;
    this.running = true;
    console.log('[AutomationEngine] 引擎已启动');

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

  /** 获取执行日志 */
  getExecutionLog(automationId?: string): AutomationExecution[] {
    const logs = loadExecutionLogs();
    if (automationId) {
      return logs.filter((l) => l.automationId === automationId);
    }
    return logs;
  }

  /** 注册执行回调 */
  onExecution(callback: (exec: AutomationExecution) => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /** 通知所有回调 */
  private notifyCallbacks(exec: AutomationExecution): void {
    this.callbacks.forEach((cb) => {
      try {
        cb(exec);
      } catch (err) {
        console.error('[AutomationEngine] 回调执行错误:', err);
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
  private async runTask(auto: Automation): Promise<AutomationExecution> {
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
    };

    // 记录开始执行
    const logs = loadExecutionLogs();
    logs.push(exec);
    saveExecutionLogs(logs);

    const startTime = Date.now();

    try {
      const result = await executeByType(auto.taskType, auto.taskConfig);
      const duration = Date.now() - startTime;

      exec.status = 'success';
      exec.completedAt = new Date().toISOString();
      exec.duration = duration;
      exec.result = result;

      console.log(`[AutomationEngine] 任务 ${auto.name}(${auto.id}) 执行成功, 耗时 ${duration}ms`);
    } catch (err) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      exec.status = 'failed';
      exec.completedAt = new Date().toISOString();
      exec.duration = duration;
      exec.result = `执行失败: ${message}`;

      console.error(`[AutomationEngine] 任务 ${auto.name}(${auto.id}) 执行失败:`, err);
    }

    // 更新日志
    const updatedLogs = loadExecutionLogs();
    const idx = updatedLogs.findIndex((l) => l.id === execId);
    if (idx !== -1) {
      updatedLogs[idx] = exec;
    } else {
      updatedLogs.push(exec);
    }
    saveExecutionLogs(updatedLogs);

    return exec;
  }
}

// ===================== 导出单例 =====================

export const automationEngine = new AutomationEngine();
