/**
 * Trigger Engine
 * 触发器引擎 - 支持 5 种触发类型的统一调度系统
 *
 * 触发类型：
 * - schedule: 定时触发（cron 表达式）
 * - event: 事件触发（监听系统事件）
 * - webhook: Webhook 触发（外部 HTTP 请求）
 * - file_change: 文件变化触发（监听文件修改）
 * - threshold: 阈值触发（监控指标超过阈值）
 */

import type { Trigger, TriggerType, TriggerStats, TriggerExecutionResult, TriggerConditionGroup } from '../../src/services/automation/types.js';
import { getCronScheduler } from './cronScheduler.js';
import { getTriggerManager } from './triggerManager.js';
import { getEventListener } from './eventListener.js';
import { executeAndRecord } from './engine.js';
import { getAutomationById } from '../dao/automationDao.js';
import { logger } from '../logger.js';

// ===================== 触发器类型定义 =====================

export type ScheduleTriggerConfig = {
  cronExpression: string;
  timezone?: string;
};

export type EventTriggerConfig = {
  eventName: string;
  condition?: {
    operator: 'AND' | 'OR';
    conditions: Array<{
      field: string;
      operator: '<' | '>' | '<=' | '>=' | '==' | '!=' | 'contains' | 'in';
      value: string | number | boolean | string[];
    }>;
  };
  debounceMs?: number;
  triggerMode?: 'once' | 'every';
};

export type WebhookTriggerConfig = {
  webhookPath: string;
  secret?: string;
  method?: 'POST' | 'GET';
};

export type FileChangeTriggerConfig = {
  pathPattern: string;
  events?: ('add' | 'change' | 'unlink')[];
  ignorePattern?: string;
  debounceMs?: number;
};

export type ThresholdTriggerConfig = {
  metric: string;
  thresholdType: 'upper' | 'lower';
  thresholdValue: number;
  checkIntervalMs?: number;
  cooldownMs?: number;
};

// ===================== 触发器引擎类 =====================

class TriggerEngine {
  private readonly triggers = new Map<string, Trigger>();
  private readonly triggerStats = new Map<string, TriggerStats>();
  private readonly runningExecutions = new Map<string, Set<string>>(); // triggerId -> Set<automationId>
  private readonly lastTriggerTimes = new Map<string, number>(); // 用于防抖
  private isRunning = false;

  constructor() {
    // 初始化统计
  }

  // ========== 触发器注册 ==========

  /**
   * 注册触发器
   */
  registerTrigger(trigger: Trigger): boolean {
    if (this.triggers.has(trigger.id)) {
      logger.warn(`[TriggerEngine] 触发器 ${trigger.id} 已存在，将更新配置`);
    }

    this.triggers.set(trigger.id, trigger);

    // 初始化统计
    this.triggerStats.set(trigger.id, {
      triggerId: trigger.id,
      totalTriggers: 0,
      successTriggers: 0,
      failedTriggers: 0,
    });

    // 根据类型注册到对应的子系统
    if (trigger.enabled) {
      this.activateTrigger(trigger);
    }

    logger.info(`[TriggerEngine] 触发器 ${trigger.id} (${trigger.type}) 已注册`);
    return true;
  }

  /**
   * 注销触发器
   */
  unregisterTrigger(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return false;

    // 先停用触发器
    if (trigger.enabled) {
      this.deactivateTrigger(trigger);
    }

    this.triggers.delete(triggerId);
    this.triggerStats.delete(triggerId);
    this.runningExecutions.delete(triggerId);
    this.lastTriggerTimes.delete(triggerId);

    logger.info(`[TriggerEngine] 触发器 ${triggerId} 已注销`);
    return true;
  }

  /**
   * 启用触发器
   */
  enableTrigger(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return false;

    if (trigger.enabled) {
      logger.warn(`[TriggerEngine] 触发器 ${triggerId} 已启用`);
      return true;
    }

    trigger.enabled = true;
    trigger.updatedAt = Date.now();
    this.triggers.set(triggerId, trigger);

    this.activateTrigger(trigger);

    logger.info(`[TriggerEngine] 触发器 ${triggerId} 已启用`);
    return true;
  }

  /**
   * 禁用触发器
   */
  disableTrigger(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return false;

    if (!trigger.enabled) {
      logger.warn(`[TriggerEngine] 触发器 ${triggerId} 已禁用`);
      return true;
    }

    trigger.enabled = false;
    trigger.updatedAt = Date.now();
    this.triggers.set(triggerId, trigger);

    this.deactivateTrigger(trigger);

    logger.info(`[TriggerEngine] 触发器 ${triggerId} 已禁用`);
    return true;
  }

  // ========== 触发器激活/停用 ==========

  /**
   * 激活触发器（注册到子系统）
   */
  private activateTrigger(trigger: Trigger): void {
    switch (trigger.type) {
      case 'schedule':
        this.activateScheduleTrigger(trigger);
        break;
      case 'event':
        this.activateEventTrigger(trigger);
        break;
      case 'webhook':
        // Webhook 触发器在路由层处理，无需额外激活
        logger.debug(`[TriggerEngine] Webhook 触发器 ${trigger.id} 已激活（路由层处理）`);
        break;
      case 'file_change':
        this.activateFileChangeTrigger(trigger);
        break;
      case 'threshold':
        this.activateThresholdTrigger(trigger);
        break;
      default:
        logger.warn(`[TriggerEngine] 未知的触发器类型: ${trigger.type}`);
    }
  }

  /**
   * 停用触发器（从子系统注销）
   */
  private deactivateTrigger(trigger: Trigger): void {
    switch (trigger.type) {
      case 'schedule':
        this.deactivateScheduleTrigger(trigger);
        break;
      case 'event':
        this.deactivateEventTrigger(trigger);
        break;
      case 'webhook':
        // Webhook 触发器在路由层处理，无需额外停用
        logger.debug(`[TriggerEngine] Webhook 触发器 ${trigger.id} 已停用`);
        break;
      case 'file_change':
        this.deactivateFileChangeTrigger(trigger);
        break;
      case 'threshold':
        this.deactivateThresholdTrigger(trigger);
        break;
      default:
        logger.warn(`[TriggerEngine] 未知的触发器类型: ${trigger.type}`);
    }
  }

  // ========== 定时触发器 ==========

  private activateScheduleTrigger(trigger: Trigger): void {
    const cronExpression = trigger.config.cronExpression;
    if (!cronExpression) {
      logger.error(`[TriggerEngine] 定时触发器 ${trigger.id} 缺少 cronExpression`);
      return;
    }

    const scheduler = getCronScheduler();

    // 为每个关联的 automation 创建 cron job
    for (const automationId of trigger.automationIds) {
      const automation = getAutomationById(automationId);
      if (!automation) {
        logger.warn(`[TriggerEngine] 自动化 ${automationId} 不存在`);
        continue;
      }

      const jobName = `trigger_${trigger.id}_${automationId}`;

      scheduler.createJob({
        name: jobName,
        cronExpression,
        taskType: 'trigger-fire',
        taskParams: { triggerId: trigger.id, automationId },
        description: `触发器 ${trigger.name} 触发自动化 ${automation.name}`,
        enabled: true,
        metadata: { triggerId: trigger.id },
      });

      // 注册任务执行器
      scheduler.registerTaskExecutor('trigger-fire', async (params, context) => {
        const { triggerId, automationId } = params as { triggerId: string; automationId: string };
        await this.fireTrigger(triggerId, automationId, 'schedule');
        return { triggered: true, automationId };
      });
    }

    logger.info(`[TriggerEngine] 定时触发器 ${trigger.id} 已激活: ${cronExpression}`);
  }

  private deactivateScheduleTrigger(trigger: Trigger): void {
    const scheduler = getCronScheduler();

    for (const automationId of trigger.automationIds) {
      const jobs = scheduler.listJobs();
      const triggerJobs = jobs.filter(j =>
        j.taskType === 'trigger-fire' &&
        j.metadata?.triggerId === trigger.id &&
        j.taskParams?.automationId === automationId
      );

      for (const job of triggerJobs) {
        scheduler.deleteJob(job.id);
      }
    }

    logger.info(`[TriggerEngine] 定时触发器 ${trigger.id} 已停用`);
  }

  // ========== 事件触发器 ==========

  private activateEventTrigger(trigger: Trigger): void {
    const eventName = trigger.config.eventName;
    if (!eventName) {
      logger.error(`[TriggerEngine] 事件触发器 ${trigger.id} 缺少 eventName`);
      return;
    }

    const eventListener = getEventListener();

    // 注册事件监听
    eventListener.subscribe(eventName, async (eventPayload: Record<string, unknown>) => {
      // 检查触发条件
      if (trigger.config.condition) {
        if (!this.evaluateCondition(trigger.config.condition, eventPayload)) {
          logger.debug(`[TriggerEngine] 事件触发器 ${trigger.id} 条件不满足，跳过`);
          return;
        }
      }

      // 防抖处理
      const debounceMs = trigger.config.debounceMs ?? 0;
      if (debounceMs > 0) {
        const lastTime = this.lastTriggerTimes.get(trigger.id) ?? 0;
        if (Date.now() - lastTime < debounceMs) {
          logger.debug(`[TriggerEngine] 事件触发器 ${trigger.id} 防抖中，跳过`);
          return;
        }
        this.lastTriggerTimes.set(trigger.id, Date.now());
      }

      // 触发所有关联的自动化
      for (const automationId of trigger.automationIds) {
        await this.fireTrigger(trigger.id, automationId, 'event', eventPayload);
      }
    });

    logger.info(`[TriggerEngine] 事件触发器 ${trigger.id} 已激活: ${eventName}`);
  }

  private deactivateEventTrigger(trigger: Trigger): void {
    const eventName = trigger.config.eventName;
    if (!eventName) return;

    const eventListener = getEventListener();
    eventListener.unsubscribe(eventName);

    logger.info(`[TriggerEngine] 事件触发器 ${trigger.id} 已停用`);
  }

  // ========== 文件变化触发器 ==========

  private activateFileChangeTrigger(trigger: Trigger): void {
    const pathPattern = trigger.config.pathPattern;
    if (!pathPattern) {
      logger.error(`[TriggerEngine] 文件触发器 ${trigger.id} 缺少 pathPattern`);
      return;
    }

    const eventListener = getEventListener();

    // 注册文件监听
    eventListener.watchFile(pathPattern, {
      events: trigger.config.events ?? ['add', 'change', 'unlink'],
      ignorePattern: trigger.config.ignorePattern,
    }, async (fileEvent: { event: string; path: string }) => {
      // 防抖处理
      const debounceMs = trigger.config.debounceMs ?? 100;
      const lastTime = this.lastTriggerTimes.get(trigger.id) ?? 0;
      if (Date.now() - lastTime < debounceMs) {
        logger.debug(`[TriggerEngine] 文件触发器 ${trigger.id} 防抖中，跳过`);
        return;
      }
      this.lastTriggerTimes.set(trigger.id, Date.now());

      // 触发所有关联的自动化
      for (const automationId of trigger.automationIds) {
        await this.fireTrigger(trigger.id, automationId, 'file_change', fileEvent);
      }
    });

    logger.info(`[TriggerEngine] 文件触发器 ${trigger.id} 已激活: ${pathPattern}`);
  }

  private deactivateFileChangeTrigger(trigger: Trigger): void {
    const pathPattern = trigger.config.pathPattern;
    if (!pathPattern) return;

    const eventListener = getEventListener();
    eventListener.unwatchFile(pathPattern);

    logger.info(`[TriggerEngine] 文件触发器 ${trigger.id} 已停用`);
  }

  // ========== 阈值触发器 ==========

  private activateThresholdTrigger(trigger: Trigger): void {
    const metric = trigger.config.metric;
    const thresholdValue = trigger.config.thresholdValue;
    const thresholdType = trigger.config.thresholdType ?? 'upper';

    if (!metric || thresholdValue === undefined) {
      logger.error(`[TriggerEngine] 阈值触发器 ${trigger.id} 缺少 metric 或 thresholdValue`);
      return;
    }

    // 阈值触发器通过定时检查实现
    const checkIntervalMs = trigger.config.checkIntervalMs ?? 60_000; // 默认 1 分钟
    const cooldownMs = trigger.config.cooldownMs ?? 300_000; // 默认 5 分钟冷却

    // 注册定时检查任务
    const scheduler = getCronScheduler();
    const jobName = `threshold_check_${trigger.id}`;

    scheduler.createJob({
      name: jobName,
      cronExpression: `*/${Math.floor(checkIntervalMs / 60000)} * * * *`, // 每 N 分钟
      taskType: 'threshold-check',
      taskParams: { triggerId: trigger.id },
      description: `阈值触发器 ${trigger.name} 定时检查`,
      enabled: true,
      metadata: { triggerId: trigger.id },
    });

    scheduler.registerTaskExecutor('threshold-check', async (params) => {
      const { triggerId } = params as { triggerId: string };
      const t = this.triggers.get(triggerId);
      if (!t || !t.enabled) return { checked: false };

      // 获取当前指标值（通过事件监听器获取）
      const eventListener = getEventListener();
      const currentValue = await eventListener.getMetricValue(metric);

      if (currentValue === null) {
        logger.debug(`[TriggerEngine] 阈值触发器 ${triggerId} 指标 ${metric} 值不可用`);
        return { checked: true, triggered: false };
      }

      // 检查阈值
      const exceeded = thresholdType === 'upper'
        ? currentValue >= thresholdValue
        : currentValue <= thresholdValue;

      if (!exceeded) {
        return { checked: true, triggered: false };
      }

      // 冷却检查
      const lastTriggerTime = this.lastTriggerTimes.get(triggerId) ?? 0;
      if (Date.now() - lastTriggerTime < cooldownMs) {
        logger.debug(`[TriggerEngine] 阈值触发器 ${triggerId} 冷却中，跳过`);
        return { checked: true, triggered: false };
      }

      // 触发
      this.lastTriggerTimes.set(triggerId, Date.now());
      for (const automationId of t.automationIds) {
        await this.fireTrigger(triggerId, automationId, 'threshold', {
          metric,
          currentValue,
          thresholdValue,
          thresholdType,
        });
      }

      return { checked: true, triggered: true };
    });

    logger.info(`[TriggerEngine] 阈值触发器 ${trigger.id} 已激活: ${metric} ${thresholdType} ${thresholdValue}`);
  }

  private deactivateThresholdTrigger(trigger: Trigger): void {
    const scheduler = getCronScheduler();

    const jobs = scheduler.listJobs();
    const thresholdJobs = jobs.filter(j =>
      j.taskType === 'threshold-check' &&
      j.metadata?.triggerId === trigger.id
    );

    for (const job of thresholdJobs) {
      scheduler.deleteJob(job.id);
    }

    logger.info(`[TriggerEngine] 阈值触发器 ${trigger.id} 已停用`);
  }

  // ========== 触发执行 ==========

  /**
   * 触发自动化执行
   */
  async fireTrigger(
    triggerId: string,
    automationId: string,
    triggerSource: TriggerType,
    triggerDetail?: Record<string, unknown>
  ): Promise<TriggerExecutionResult> {
    const trigger = this.triggers.get(triggerId);
    const automation = getAutomationById(automationId);

    if (!trigger) {
      return {
        triggerId,
        automationId,
        triggeredAt: Date.now(),
        success: false,
        error: 'Trigger not found',
      };
    }

    if (!automation) {
      return {
        triggerId,
        automationId,
        triggeredAt: Date.now(),
        success: false,
        error: 'Automation not found',
      };
    }

    if (!trigger.enabled) {
      return {
        triggerId,
        automationId,
        triggeredAt: Date.now(),
        success: false,
        error: 'Trigger disabled',
      };
    }

    if (automation.status !== 'ACTIVE') {
      return {
        triggerId,
        automationId,
        triggeredAt: Date.now(),
        success: false,
        error: 'Automation not active',
      };
    }

    // 并发保护
    let runningSet = this.runningExecutions.get(triggerId);
    if (!runningSet) {
      runningSet = new Set<string>();
      this.runningExecutions.set(triggerId, runningSet);
    }

    if (runningSet.has(automationId)) {
      logger.warn(`[TriggerEngine] 触发器 ${triggerId} 的自动化 ${automationId} 正在执行中`);
      return {
        triggerId,
        automationId,
        triggeredAt: Date.now(),
        success: false,
        error: 'Already running',
      };
    }

    runningSet.add(automationId);
    const startTime = Date.now();

    try {
      // 执行自动化
      const result = await executeAndRecord(automation, triggerSource);

      // 更新统计
      this.updateTriggerStats(triggerId, result !== null && result.success);

      // 更新触发器状态
      trigger.lastTriggeredAt = startTime;
      trigger.triggerCount++;
      this.triggers.set(triggerId, trigger);

      return {
        triggerId,
        automationId,
        triggeredAt: startTime,
        success: result !== null && result.success,
        error: result?.message,
        executionId: (result?.data as { executionId?: string } | undefined)?.executionId,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(`[TriggerEngine] 触发执行异常:`, err);

      this.updateTriggerStats(triggerId, false);

      return {
        triggerId,
        automationId,
        triggeredAt: startTime,
        success: false,
        error,
      };
    } finally {
      runningSet.delete(automationId);
    }
  }

  // ========== 条件评估 ==========

  /**
   * 评估触发条件
   */
  private evaluateCondition(
    conditionGroup: TriggerConditionGroup,
    payload: Record<string, unknown>
  ): boolean {
    const results = conditionGroup.conditions.map(cond => {
      // 如果是嵌套条件组
      if ('operator' in cond && 'conditions' in cond) {
        return this.evaluateCondition(cond as TriggerConditionGroup, payload);
      }

      // 单个条件
      const singleCond = cond as {
        field: string;
        operator: '<' | '>' | '<=' | '>=' | '==' | '!=' | 'contains' | 'in';
        value: string | number | boolean | string[];
      };

      const fieldValue = payload[singleCond.field];
      if (fieldValue === undefined || fieldValue === null) return false;

      switch (singleCond.operator) {
        case '<': return fieldValue < singleCond.value;
        case '>': return fieldValue > singleCond.value;
        case '<=': return fieldValue <= singleCond.value;
        case '>=': return fieldValue >= singleCond.value;
        case '==': return fieldValue === singleCond.value;
        case '!=': return fieldValue !== singleCond.value;
        case 'contains':
          if (typeof fieldValue === 'string' && typeof singleCond.value === 'string') {
            return fieldValue.includes(singleCond.value);
          }
          return false;
        case 'in':
          if (Array.isArray(singleCond.value)) {
            return singleCond.value.includes(fieldValue as string);
          }
          return false;
        default:
          return false;
      }
    });

    return conditionGroup.operator === 'AND'
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  // ========== 统计更新 ==========

  private updateTriggerStats(triggerId: string, success: boolean): void {
    const stats = this.triggerStats.get(triggerId);
    if (!stats) return;

    stats.totalTriggers++;
    if (success) {
      stats.successTriggers++;
    } else {
      stats.failedTriggers++;
    }
    stats.lastTriggeredAt = Date.now();
    stats.lastTriggerResult = success ? 'success' : 'failed';

    this.triggerStats.set(triggerId, stats);
  }

  // ========== 查询接口 ==========

  getTrigger(triggerId: string): Trigger | undefined {
    return this.triggers.get(triggerId);
  }

  listTriggers(): Trigger[] {
    return Array.from(this.triggers.values());
  }

  getTriggerStats(triggerId: string): TriggerStats | undefined {
    return this.triggerStats.get(triggerId);
  }

  // ========== 启停 ==========

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('[TriggerEngine] 触发器引擎已启动');
  }

  stop(): void {
    if (!this.isRunning) return;

    // 停用所有触发器
    for (const trigger of this.triggers.values()) {
      if (trigger.enabled) {
        this.deactivateTrigger(trigger);
      }
    }

    this.isRunning = false;
    logger.info('[TriggerEngine] 触发器引擎已停止');
  }

  isEngineRunning(): boolean {
    return this.isRunning;
  }
}

// ===================== 单例导出 =====================

const TRIGGER_ENGINE_INSTANCE = new TriggerEngine();

export function getTriggerEngine(): TriggerEngine {
  return TRIGGER_ENGINE_INSTANCE;
}

export function startTriggerEngine(): void {
  TRIGGER_ENGINE_INSTANCE.start();
}

export function stopTriggerEngine(): void {
  TRIGGER_ENGINE_INSTANCE.stop();
}

export type { TriggerEngine };