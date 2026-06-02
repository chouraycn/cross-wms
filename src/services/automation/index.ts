/**
 * 自动化执行引擎 — Facade
 *
 * 定时任务调度与执行的核心服务，职责：
 * - 每 30 秒轮询检查是否有任务到期
 * - 按 taskType 分发执行逻辑（委托给 actions 模块）
 * - 执行结果持久化到 localStorage
 * - 支持手动触发、执行回调通知、状态变更通知
 * - 失败任务自动重试 1 次
 *
 * 本文件是 Facade 薄壳，核心执行逻辑在 actions.ts 中。
 */

import type {
  FreqType,
  Automation, AutomationExecution,
  EngineStateEvent, AutomationEngineAPI, AutomationTemplate,
} from './types';
import {
  AUTOMATIONS_KEY, EXECUTION_LOG_KEY, MAX_LOG_ENTRIES, CHECK_INTERVAL_MS,
} from './types';
import { executeByTypeWithSteps } from './actions';

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

// ===================== 预置模板 =====================

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
    // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
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

      // eslint-disable-next-line no-console
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
        // eslint-disable-next-line no-console
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
          // eslint-disable-next-line no-console
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

// ===================== 类型重导出 =====================

export type {
  TaskType, FreqType, TaskConfig, ActionType,
  Automation, AutomationExecution, ExecutionStep,
  EngineStateEvent, AutomationEngineAPI, AutomationTemplate,
} from './types';

// AUTOMATION_TEMPLATES is defined locally at line ~141
// who import from the barrel.
