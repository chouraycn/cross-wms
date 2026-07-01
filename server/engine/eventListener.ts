/**
 * Event Listener
 * 事件监听器 - 监听系统事件和文件变化
 *
 * 功能：
 * - 监听系统事件（如：chat_message、tool_call、approval_decision）
 * - 监听文件变化（使用 chokidar）
 * - 监听数据库变化（可选）
 * - 事件过滤器（按条件过滤）
 */

import { EventEmitter } from 'events';
import * as chokidar from 'chokidar';
import type { TriggerConditionGroup } from '../../src/services/automation/types.js';
import { logger } from '../logger.js';
import { initDb } from '../db.js';

// ===================== 事件类型定义 =====================

export type SystemEventType =
  | 'chat_message'
  | 'tool_call'
  | 'approval_decision'
  | 'session_created'
  | 'session_archived'
  | 'warehouse_created'
  | 'warehouse_updated'
  | 'warehouse_deleted'
  | 'inventory_created'
  | 'inventory_updated'
  | 'inventory_deleted'
  | 'inventory_low_stock'
  | 'inbound_created'
  | 'inbound_completed'
  | 'outbound_created'
  | 'outbound_completed'
  | 'transit_created'
  | 'transit_arrived'
  | 'volume_threshold_exceeded'
  | 'report_scheduled'
  | 'automation_started'
  | 'automation_completed'
  | 'automation_failed';

export interface SystemEvent {
  type: SystemEventType | string;
  timestamp: number;
  payload: Record<string, unknown>;
  source: 'system' | 'user' | 'external';
}

export type FileChangeEvent = {
  event: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  timestamp: number;
};

export type EventCallback = (payload: Record<string, unknown>) => void | Promise<void>;
export type FileChangeCallback = (event: FileChangeEvent) => void | Promise<void>;

// ===================== 指标类型定义 =====================

export type MetricName =
  | 'warehouse_count'
  | 'inventory_total'
  | 'inventory_low_stock_count'
  | 'inbound_pending_count'
  | 'outbound_pending_count'
  | 'transit_in_progress_count'
  | 'volume_utilization_avg'
  | 'volume_utilization_max'
  | 'automation_success_rate'
  | 'automation_running_count';

// ===================== 事件监听器类 =====================

class EventListener extends EventEmitter {
  private readonly systemEventHandlers = new Map<string, Set<EventCallback>>();
  private readonly fileWatchers = new Map<string, chokidar.FSWatcher>();
  private readonly fileChangeCallbacks = new Map<string, Set<FileChangeCallback>>();
  private readonly metricCache = new Map<MetricName, { value: number; timestamp: number }>();
  private readonly metricUpdateInterval = 60_000; // 1 分钟更新一次
  private metricUpdateTimer: ReturnType<typeof setInterval> | null = null;
  private db: ReturnType<typeof initDb> | null = null;
  private isRunning = false;

  constructor() {
    super();
    // 设置最大监听器数量
    this.setMaxListeners(100);
  }

  // ========== 系统事件监听 ==========

  /**
   * 订阅系统事件
   */
  subscribe(eventName: string, callback: EventCallback): void {
    let handlers = this.systemEventHandlers.get(eventName);
    if (!handlers) {
      handlers = new Set<EventCallback>();
      this.systemEventHandlers.set(eventName, handlers);
    }
    handlers.add(callback);

    logger.debug(`[EventListener] 已订阅事件: ${eventName}`);
  }

  /**
   * 取消订阅系统事件
   */
  unsubscribe(eventName: string, callback?: EventCallback): void {
    if (callback) {
      const handlers = this.systemEventHandlers.get(eventName);
      if (handlers) {
        handlers.delete(callback);
        if (handlers.size === 0) {
          this.systemEventHandlers.delete(eventName);
        }
      }
    } else {
      // 取消所有订阅
      this.systemEventHandlers.delete(eventName);
    }

    logger.debug(`[EventListener] 已取消订阅事件: ${eventName}`);
  }

  /**
   * 发布系统事件
   */
  emitSystemEvent(eventName: string, payload: Record<string, unknown>): void {
    const event: SystemEvent = {
      type: eventName,
      timestamp: Date.now(),
      payload,
      source: 'system',
    };

    // 触发内部 EventEmitter
    this.emit(eventName, event);

    // 触发订阅的回调
    const handlers = this.systemEventHandlers.get(eventName);
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(payload);
          if (result instanceof Promise) {
            result.catch(err => {
              logger.error(`[EventListener] 事件处理器异常 (${eventName}):`, err);
            });
          }
        } catch (err) {
          logger.error(`[EventListener] 事件处理器异常 (${eventName}):`, err);
        }
      }
    }

    logger.debug(`[EventListener] 事件已发布: ${eventName}`, payload);
  }

  /**
   * 发布系统事件（带条件过滤）
   */
  emitSystemEventWithFilter(
    eventName: string,
    payload: Record<string, unknown>,
    condition?: TriggerConditionGroup
  ): void {
    // 条件过滤
    if (condition && !this.evaluateCondition(condition, payload)) {
      logger.debug(`[EventListener] 事件 ${eventName} 条件不满足，跳过发布`);
      return;
    }

    this.emitSystemEvent(eventName, payload);
  }

  // ========== 文件变化监听 ==========

  /**
   * 监听文件变化
   */
  watchFile(
    pathPattern: string,
    options: {
      events?: ('add' | 'change' | 'unlink')[];
      ignorePattern?: string;
      watchDir?: boolean;
    },
    callback: FileChangeCallback
  ): void {
    // 如果已存在监听器，添加回调
    if (this.fileWatchers.has(pathPattern)) {
      let callbacks = this.fileChangeCallbacks.get(pathPattern);
      if (!callbacks) {
        callbacks = new Set<FileChangeCallback>();
        this.fileChangeCallbacks.set(pathPattern, callbacks);
      }
      callbacks.add(callback);
      logger.debug(`[EventListener] 文件监听器已存在，添加回调: ${pathPattern}`);
      return;
    }

    // 创建新的 chokidar 监听器
    const watcher = chokidar.watch(pathPattern, {
      ignored: options.ignorePattern ? new RegExp(options.ignorePattern) : /(^|[\/\\])\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: true, // 忽略初始扫描
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    const events = options.events ?? ['add', 'change', 'unlink'];

    // 监听指定事件
    for (const eventType of events) {
      watcher.on(eventType, (path: string) => {
        const fileEvent: FileChangeEvent = {
          event: eventType,
          path,
          timestamp: Date.now(),
        };

        logger.debug(`[EventListener] 文件事件: ${eventType} ${path}`);

        // 触发回调
        const callbacks = this.fileChangeCallbacks.get(pathPattern);
        if (callbacks) {
          for (const cb of callbacks) {
            try {
              const result = cb(fileEvent);
              if (result instanceof Promise) {
                result.catch(err => {
                  logger.error(`[EventListener] 文件回调异常 (${path}):`, err);
                });
              }
            } catch (err) {
              logger.error(`[EventListener] 文件回调异常 (${path}):`, err);
            }
          }
        }
      });
    }

    // 监听目录事件（可选）
    if (options.watchDir) {
      watcher.on('addDir', (path: string) => {
        const fileEvent: FileChangeEvent = {
          event: 'addDir',
          path,
          timestamp: Date.now(),
        };

        const callbacks = this.fileChangeCallbacks.get(pathPattern);
        if (callbacks) {
          for (const cb of callbacks) {
            try {
              cb(fileEvent);
            } catch (err) {
              logger.error(`[EventListener] 目录回调异常 (${path}):`, err);
            }
          }
        }
      });

      watcher.on('unlinkDir', (path: string) => {
        const fileEvent: FileChangeEvent = {
          event: 'unlinkDir',
          path,
          timestamp: Date.now(),
        };

        const callbacks = this.fileChangeCallbacks.get(pathPattern);
        if (callbacks) {
          for (const cb of callbacks) {
            try {
              cb(fileEvent);
            } catch (err) {
              logger.error(`[EventListener] 目录回调异常 (${path}):`, err);
            }
          }
        }
      });
    }

    watcher.on('error', (err: Error) => {
      logger.error(`[EventListener] 文件监听器异常 (${pathPattern}):`, err);
    });

    this.fileWatchers.set(pathPattern, watcher);

    const callbacks = new Set<FileChangeCallback>();
    callbacks.add(callback);
    this.fileChangeCallbacks.set(pathPattern, callbacks);

    logger.info(`[EventListener] 文件监听器已启动: ${pathPattern}`);
  }

  /**
   * 取消文件监听
   */
  unwatchFile(pathPattern: string, callback?: FileChangeCallback): void {
    if (callback) {
      const callbacks = this.fileChangeCallbacks.get(pathPattern);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          // 关闭监听器
          const watcher = this.fileWatchers.get(pathPattern);
          if (watcher) {
            watcher.close();
            this.fileWatchers.delete(pathPattern);
            this.fileChangeCallbacks.delete(pathPattern);
          }
        }
      }
    } else {
      // 关闭所有监听
      const watcher = this.fileWatchers.get(pathPattern);
      if (watcher) {
        watcher.close();
        this.fileWatchers.delete(pathPattern);
        this.fileChangeCallbacks.delete(pathPattern);
      }
    }

    logger.info(`[EventListener] 文件监听器已关闭: ${pathPattern}`);
  }

  // ========== 指标监控 ==========

  /**
   * 获取指标值
   */
  async getMetricValue(metricName: MetricName | string): Promise<number | null> {
    // 检查缓存
    const cached = this.metricCache.get(metricName as MetricName);
    if (cached && Date.now() - cached.timestamp < this.metricUpdateInterval) {
      return cached.value;
    }

    // 从数据库查询
    if (!this.db) {
      this.db = initDb();
    }

    let value: number | null = null;

    try {
      switch (metricName) {
        case 'warehouse_count':
          const whResult = this.db.prepare('SELECT COUNT(*) as count FROM warehouses').get() as { count: number } | undefined;
          value = whResult?.count ?? 0;
          break;

        case 'inventory_total':
          const invResult = this.db.prepare('SELECT COUNT(*) as count FROM inventory').get() as { count: number } | undefined;
          value = invResult?.count ?? 0;
          break;

        case 'inventory_low_stock_count':
          const lowResult = this.db.prepare('SELECT COUNT(*) as count FROM inventory WHERE quantity <= 10').get() as { count: number } | undefined;
          value = lowResult?.count ?? 0;
          break;

        case 'inbound_pending_count':
          const inboundResult = this.db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE status = "pending"').get() as { count: number } | undefined;
          value = inboundResult?.count ?? 0;
          break;

        case 'outbound_pending_count':
          const outboundResult = this.db.prepare('SELECT COUNT(*) as count FROM outbound_records WHERE status = "pending"').get() as { count: number } | undefined;
          value = outboundResult?.count ?? 0;
          break;

        case 'transit_in_progress_count':
          const transitResult = this.db.prepare('SELECT COUNT(*) as count FROM transit_orders WHERE status = "in_transit"').get() as { count: number } | undefined;
          value = transitResult?.count ?? 0;
          break;

        case 'volume_utilization_avg':
          // 从自动化执行结果中获取平均值
          const volResult = this.db.prepare(`
            SELECT AVG(CAST(JSON_EXTRACT(result, '$.volumeUtilization') AS REAL)) as avg
            FROM automation_runs
            WHERE task_type = 'volume-alert'
            AND status = 'success'
            AND started_at >= datetime('now', '-1 day')
          `).get() as { avg: number | null } | undefined;
          value = volResult?.avg ?? null;
          break;

        case 'automation_success_rate':
          const autoResult = this.db.prepare(`
            SELECT
              CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as rate
            FROM automation_runs
            WHERE started_at >= datetime('now', '-1 day')
          `).get() as { rate: number | null } | undefined;
          value = autoResult?.rate ?? null;
          break;

        case 'automation_running_count':
          const runningResult = this.db.prepare('SELECT COUNT(*) as count FROM automation_runs WHERE status = "running"').get() as { count: number } | undefined;
          value = runningResult?.count ?? 0;
          break;

        default:
          // 自定义指标，尝试从 automation_runs 结果中提取
          const customResult = this.db.prepare(`
            SELECT result FROM automation_runs
            WHERE task_type = 'custom'
            AND status = 'success'
            ORDER BY started_at DESC
            LIMIT 1
          `).get() as { result: string } | undefined;
          if (customResult?.result) {
            try {
              const resultObj = JSON.parse(customResult.result);
              value = resultObj[metricName] ?? null;
            } catch {
              value = null;
            }
          }
      }

      // 更新缓存
      if (value !== null) {
        this.metricCache.set(metricName as MetricName, {
          value,
          timestamp: Date.now(),
        });
      }

      return value;
    } catch (err) {
      logger.error(`[EventListener] 获取指标值异常 (${metricName}):`, err);
      return null;
    }
  }

  /**
   * 定时更新指标缓存
   */
  private startMetricUpdate(): void {
    if (this.metricUpdateTimer) return;

    this.metricUpdateTimer = setInterval(async () => {
      for (const metricName of this.metricCache.keys()) {
        try {
          await this.getMetricValue(metricName);
        } catch (err) {
          logger.error(`[EventListener] 指标更新异常 (${metricName}):`, err);
        }
      }
    }, this.metricUpdateInterval);
  }

  private stopMetricUpdate(): void {
    if (this.metricUpdateTimer) {
      clearInterval(this.metricUpdateTimer);
      this.metricUpdateTimer = null;
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

  // ========== 启停 ==========

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startMetricUpdate();
    logger.info('[EventListener] 事件监听器已启动');
  }

  stop(): void {
    if (!this.isRunning) return;

    // 关闭所有文件监听器
    for (const watcher of this.fileWatchers.values()) {
      watcher.close();
    }
    this.fileWatchers.clear();
    this.fileChangeCallbacks.clear();

    // 清空系统事件订阅
    this.systemEventHandlers.clear();

    // 停止指标更新
    this.stopMetricUpdate();

    this.isRunning = false;
    logger.info('[EventListener] 事件监听器已停止');
  }

  isListenerRunning(): boolean {
    return this.isRunning;
  }

  // ========== 统计 ==========

  getStats(): {
    systemEventSubscriptions: number;
    fileWatchers: number;
    metricsCached: number;
  } {
    return {
      systemEventSubscriptions: this.systemEventHandlers.size,
      fileWatchers: this.fileWatchers.size,
      metricsCached: this.metricCache.size,
    };
  }
}

// ===================== 单例导出 =====================

const EVENT_LISTENER_INSTANCE = new EventListener();

export function getEventListener(): EventListener {
  return EVENT_LISTENER_INSTANCE;
}

export function startEventListener(): void {
  EVENT_LISTENER_INSTANCE.start();
}

export function stopEventListener(): void {
  EVENT_LISTENER_INSTANCE.stop();
}

export type { EventListener };