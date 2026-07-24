/**
 * 自动化引擎 — 主入口
 *
 * 串联所有引擎组件（executor + eventBus + notifier + DAO），
 * 实现定时轮询 + Webhook 事件双触发。
 *
 * 用法：
 *   import { startEngine, stopEngine } from './engine.js';
 *   const { stop } = await startEngine(30_000);
 *   // 关闭时
 *   stop();   // 或 stopEngine();
 */

import { executeAutomation, type ExecutionResult } from './executor.js';
import eventBus, {
  emitAutomationEvent,
  AutomationEventType,
  type AutomationEventPayload,
} from './eventBus.js';
import { initNotifier, destroyNotifier } from './notifier.js';
import {
  getActiveAutomationsByTriggerType,
  getAutomationById,
  createRun,
  updateRun,
  updateAutomation,
  type AutomationData,
} from '../dao/automationDao.js';
import {
  startSkillSnapshotCron,
  stopSkillSnapshotCron,
  triggerManualRefresh,
  startHotReload,
  stopHotReload,
  getDefaultConfig,
  type ScheduledRefreshHandle,
  type SkillSnapshotConfig,
  type HotReloadConfig,
  DEFAULT_SNAPSHOT_INTERVAL_MS,
} from './skills/index.js';
import { logger } from '../logger.js';

// ===================== 内部状态 =====================

/** 正在执行的 automationId 集合（防止并发） */
const runningAutomations = new Set<string>();

/** 上次执行时间戳（用于轮询判断，Map<automationId, timestampMs>） */
const lastExecutionTimes = new Map<string, number>();

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** 技能定时快照句柄 */
let skillSnapshotHandle: ScheduledRefreshHandle | null = null;

/** 热重载停止函数 */
let hotReloadStop: (() => void) | null = null;

// ===================== 轮询判断 =====================

/**
 * 判断自动化是否到期需要执行
 *
 * 逻辑：
 *   - 从未执行过（lastRunAt 为 null）→ 到期（首次运行）
 *   - 已执行过 → 根据 executionPolicy.intervalMinutes 判断是否到期
 *   - intervalMinutes 不存在时默认 60 分钟
 */
function isAutomationDue(automation: {
  id: string;
  lastRunAt: string | null;
  executionPolicy?: Record<string, unknown> | null;
}): boolean {
  const { lastRunAt, executionPolicy } = automation;

  // 首次运行
  if (!lastRunAt) return true;

  const lastRun = new Date(lastRunAt).getTime();
  if (Number.isNaN(lastRun)) return true;

  const intervalMinutes =
    typeof executionPolicy?.intervalMinutes === 'number'
      ? executionPolicy.intervalMinutes
      : 60;
  const intervalMs = intervalMinutes * 60_000;

  return Date.now() - lastRun >= intervalMs;
}

// ===================== 核心执行 =====================

/**
 * 执行自动化并记录结果
 *
 * - 创建 automation_run（status: 'running'）
 * - 发布 AUTOMATION_STARTED 事件
 * - 调用 executor 执行
 * - 成功 → 发布 AUTOMATION_COMPLETED，更新 run 状态
 * - 失败 → 发布 AUTOMATION_FAILED，更新 run 状态
 * - 更新 automation 的 lastRunAt 和 runCount
 *
 * @returns 执行结果，如果跳过（并发中）则返回 null
 */
export async function executeAndRecord(
  automation: AutomationData,
  triggerSource: string,
): Promise<ExecutionResult | null> {
  const automationId = automation.id;

  if (runningAutomations.has(automationId)) {
    logger.warn(`[Engine] 自动化 ${automationId} 正在执行中，跳过此次触发`);
    return null;
  }

  runningAutomations.add(automationId);

  const startTime = Date.now();
  let runId: string | null = null;

  try {
    const run = createRun({
      automationId,
      taskType: automation.taskType,
      status: 'running',
      startedAt: new Date(startTime).toISOString(),
      completedAt: null,
      duration: null,
      result: null,
      steps: [],
      isRetry: false,
      triggerSource,
      triggerDetail: null,
      retryCount: 0,
    } as Parameters<typeof createRun>[0]);
    runId = run.id;

    emitAutomationEvent(AutomationEventType.AUTOMATION_STARTED, {
      automationId,
      taskType: automation.taskType,
      status: 'running',
      timestamp: new Date(startTime).toISOString(),
    } as AutomationEventPayload);

    const result: ExecutionResult = await executeAutomation(automation);

    const completedAt = new Date().toISOString();
    const duration = Date.now() - startTime;

    updateRun(runId, {
      status: result.success ? 'success' : 'failed',
      completedAt,
      duration,
      result: result.message,
      steps: result.steps as Parameters<typeof updateRun>[1]['steps'],
    });

    if (result.success) {
      emitAutomationEvent(AutomationEventType.AUTOMATION_COMPLETED, {
        automationId,
        taskType: automation.taskType,
        status: 'success',
        timestamp: completedAt,
        data: result.data,
      } as AutomationEventPayload);
    } else {
      emitAutomationEvent(AutomationEventType.AUTOMATION_FAILED, {
        automationId,
        taskType: automation.taskType,
        status: 'failed',
        timestamp: completedAt,
        error: result.message,
      } as AutomationEventPayload);
    }

    updateAutomation(automationId, {
      lastRunAt: completedAt,
      runCount: (automation.runCount ?? 0) + 1,
    });

    lastExecutionTimes.set(automationId, Date.now());

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Engine] executeAndRecord 意外错误 ${automationId}:`, err);

    const completedAt = new Date().toISOString();
    const duration = Date.now() - startTime;

    if (runId) {
      try {
        updateRun(runId, {
          status: 'failed',
          completedAt,
          duration,
          result: message,
          steps: [],
        });
      } catch { /* ignore */ }
    }

    try {
      emitAutomationEvent(AutomationEventType.AUTOMATION_FAILED, {
        automationId,
        taskType: automation.taskType,
        status: 'failed',
        timestamp: completedAt,
        error: message,
      } as AutomationEventPayload);
    } catch { /* ignore */ }

    return {
      success: false,
      message,
      steps: [],
      shouldNotify: true,
    };
  } finally {
    runningAutomations.delete(automationId);
  }
}

// ===================== 轮询 =====================

async function pollSchedules(): Promise<void> {
  try {
    const schedules = getActiveAutomationsByTriggerType('schedule');

    for (const automation of schedules) {
      if (!isAutomationDue(automation)) continue;

      executeAndRecord(automation, 'schedule').catch((err) => {
        logger.error(`[Engine] 调度执行异常 ${automation.id}:`, err);
      });
    }

    triggerManualRefresh(process.cwd()).catch((err) => {
      logger.error('[Engine] 技能状态刷新异常:', err);
    });
  } catch (err) {
    logger.error('[Engine] 轮询异常:', err);
  }
}

// ===================== Webhook 事件处理 =====================

function handleWebhookEvent(payload: AutomationEventPayload): void {
  const { automationId } = payload;
  if (!automationId) {
    logger.warn('[Engine] webhook 事件缺少 automationId');
    return;
  }

  const automation = getAutomationById(automationId);
  if (!automation) {
    logger.warn(`[Engine] webhook 事件：找不到自动化 ${automationId}`);
    return;
  }

  executeAndRecord(automation, 'webhook').catch((err) => {
    logger.error('[Engine] webhook 执行异常:', err);
  });
}

// ===================== 引擎启停 =====================

/**
 * 启动自动化引擎
 *
 * - 初始化通知器
 * - 启动技能定时快照
 * - 启动技能热重载
 * - 启动定时轮询（默认 30 秒）
 * - 监听 webhook:received 事件
 *
 * @param pollIntervalMs 轮询间隔（毫秒），默认 30000
 * @param hotReloadConfig 热重载配置（可选）
 * @returns { stop: () => void } 停止函数
 */
export async function startEngine(
  pollIntervalMs: number = 30_000,
  hotReloadConfig?: HotReloadConfig,
): Promise<{ stop: () => void }> {
  if (pollTimer !== null) {
    logger.warn('[Engine] 引擎已在运行中，跳过重复启动');
    return { stop: stopEngine };
  }

  logger.debug(`[Engine] 启动引擎，轮询间隔 ${pollIntervalMs}ms`);

  initNotifier();

  const snapshotConfig: SkillSnapshotConfig = {
    intervalMs: DEFAULT_SNAPSHOT_INTERVAL_MS,
    workspaceDir: process.cwd(),
  };
  skillSnapshotHandle = startSkillSnapshotCron(snapshotConfig);
  logger.debug(`[Engine] 技能定时快照已启动，间隔 ${DEFAULT_SNAPSHOT_INTERVAL_MS}ms`);

  const hrConfig = hotReloadConfig ?? await getDefaultConfig(process.cwd());
  hotReloadStop = await startHotReload(hrConfig);
  logger.debug('[Engine] 技能热重载已启动');

  void pollSchedules();
  pollTimer = setInterval(() => {
    void pollSchedules();
  }, pollIntervalMs);

  eventBus.on(AutomationEventType.WEBHOOK_RECEIVED, (payload: AutomationEventPayload) => {
    handleWebhookEvent(payload);
  });

  logger.debug('[Engine] 引擎启动完成');

  return { stop: stopEngine };
}

/**
 * 停止自动化引擎
 *
 * - 清除轮询定时器
 * - 停止技能热重载
 * - 停止技能定时快照
 * - 销毁通知器
 * - 清空内部状态
 */
export function stopEngine(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (hotReloadStop !== null) {
    hotReloadStop();
    hotReloadStop = null;
    logger.debug('[Engine] 技能热重载已停止');
  }

  if (skillSnapshotHandle !== null) {
    stopSkillSnapshotCron(skillSnapshotHandle);
    skillSnapshotHandle = null;
    logger.debug('[Engine] 技能定时快照已停止');
  }

  destroyNotifier();
  runningAutomations.clear();
  lastExecutionTimes.clear();

  logger.debug('[Engine] 引擎已停止');
}
