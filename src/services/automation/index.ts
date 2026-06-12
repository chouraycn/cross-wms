/**
 * 自动化执行引擎 — Facade (API 驱动版)
 *
 * 定时任务调度与执行的核心服务，职责：
 * - 每 30 秒轮询检查是否有任务到期
 * - 按 taskType 分发执行逻辑（委托给 actions 模块）
 * - 执行结果通过 API 持久化到后端 SQLite
 * - 支持手动触发、执行回调通知、状态变更通知
 * - 失败任务自动重试 1 次
 *
 * 本文件是 Facade 薄壳，核心执行逻辑在 actions.ts 中。
 * v2.0: 从 localStorage 迁移到后端 REST API
 */

import type {
  FreqType,
  Automation, AutomationExecution,
  EngineStateEvent, AutomationEngineAPI, AutomationTemplate,
} from './types';
import {
  CHECK_INTERVAL_MS,
} from './types';
import { executeByTypeWithSteps } from './actions';
import {
  fetchAutomations,
  updateAutomationApi,
  fetchAllExecutions,
  clearExecutionLogs as clearExecutionLogsApi,
} from './api';

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
  {
    id: 'tpl-skill-audit',
    name: '定期检查技能安全',
    description: '定期对所有用户技能执行安全审查，发现恶意或可疑技能时发送桌面通知',
    icon: 'SecurityIcon',
    taskType: 'skill-audit',
    defaultSchedule: { scheduleType: 'recurring', freq: 'WEEKLY', hour: 9, minute: 0 },
  },
  {
    id: 'tpl-wms-alert-check',
    name: 'WMS 预警检查',
    description: '定期扫描低库存、临期商品、呆滞库存，自动创建预警记录',
    icon: 'NotificationsActiveIcon',
    taskType: 'wms-alert-check',
    taskConfig: {
      alertConfig: {
        lowStock: 10,
        expiryDays: 30,
        stagnantDays: 90,
        enableLowStock: true,
        enableExpiry: true,
        enableStagnant: true,
      },
    },
    defaultSchedule: { scheduleType: 'recurring', freq: 'DAILY', hour: 8, minute: 0 },
  },
  {
    id: 'tpl-wms-report-gen',
    name: 'WMS 报表生成',
    description: '定期生成库存、入库、出库报表，支持 CSV 和 JSON 格式导出',
    icon: 'AssessmentIcon',
    taskType: 'wms-report-gen',
    taskConfig: {
      reportConfig: {
        reportType: 'inventory',
        warehouseId: undefined,
        startDate: undefined,
        endDate: undefined,
        format: 'csv',
      },
    },
    defaultSchedule: { scheduleType: 'recurring', freq: 'WEEKLY', hour: 9, minute: 0 },
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
    const automations = await fetchAutomations();
    const auto = automations.find((a) => a.id === id);
    if (!auto) {
      throw new Error(`任务不存在: ${id}`);
    }

    const exec = await this.runTask(auto);

    // 更新任务的 lastRunAt, runCount, nextRunAt
    await updateAutomationApi(id, {
      lastRunAt: new Date().toISOString(),
      runCount: (auto.runCount || 0) + 1,
      nextRunAt: computeNextRun(auto),
    });

    return exec;
  }

  /** 重试失败的执行 */
  async retry(executionId: string): Promise<AutomationExecution | null> {
    const { data: logs } = await fetchAllExecutions(100, 0);
    const original = logs.find((l) => l.id === executionId);
    if (!original || original.status !== 'failed') return null;

    const automations = await fetchAutomations();
    const auto = automations.find((a) => a.id === original.automationId);
    if (!auto) return null;

    // 标记为重试执行
    const exec = await this.runTask(auto, true);

    // 更新任务状态
    await updateAutomationApi(original.automationId, {
      lastRunAt: new Date().toISOString(),
      runCount: (auto.runCount || 0) + 1,
      nextRunAt: computeNextRun(auto),
    });

    return exec;
  }

  /** 获取执行日志 */
  async getExecutionLog(automationId?: string): Promise<AutomationExecution[]> {
    const { data: logs } = await fetchAllExecutions(100, 0);
    if (automationId) {
      return logs.filter((l) => l.automationId === automationId);
    }
    return logs;
  }

  /** 获取执行结果详情 */
  getExecutionResults(type: 'snapshots' | 'reports' | 'alerts'): unknown[] {
    // v2.0: 执行结果不再存储在 localStorage，改为通过 API 获取
    // 临时返回空数组，后续可通过 /api/automation/executions 获取
    console.warn('[AutomationEngine] getExecutionResults 已废弃，请通过 API 获取执行结果');
    return [];
  }

  /** 清空执行日志 */
  async clearExecutionLogs(): Promise<void> {
    await clearExecutionLogsApi();
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
  private async checkAndExecute(): Promise<void> {
    try {
      const automations = await fetchAutomations();
      const now = new Date();

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
          }).catch((err) => {
            console.error('[AutomationEngine] 任务执行失败:', err);
          });

          // 更新任务状态（通过 API）
          await updateAutomationApi(auto.id, {
            lastRunAt: now.toISOString(),
            runCount: (auto.runCount || 0) + 1,
            nextRunAt: computeNextRun(auto),
          });
        }
      }
    } catch (err) {
      console.error('[AutomationEngine] 检查任务失败:', err);
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
  TriggerType, TriggerCondition, TriggerConditionGroup,
  EventTriggerConfig, WebhookConfig, ExecutionPolicy, NotificationConfig,
} from './types';
