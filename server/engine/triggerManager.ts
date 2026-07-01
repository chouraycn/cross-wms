/**
 * Trigger Manager
 * 触发器管理服务 - 提供触发器的 CRUD 操作和统计查询
 *
 * 与 TriggerEngine 的关系：
 * - TriggerEngine 负责触发器的激活、停用和执行
 * - TriggerManager 负责触发器的持久化存储和管理
 */

import type { Trigger, TriggerStats, TriggerType } from '../../src/services/automation/types.js';
import { getTriggerEngine } from './triggerEngine.js';
import { initDb } from '../db.js';
import { logger } from '../logger.js';

// ===================== 数据库表定义 =====================

const CREATE_TRIGGER_TABLE = `
CREATE TABLE IF NOT EXISTS triggers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  automation_ids TEXT NOT NULL, -- JSON array
  config TEXT NOT NULL, -- JSON object
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_triggered_at INTEGER,
  trigger_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_triggers_type ON triggers(type);
CREATE INDEX IF NOT EXISTS idx_triggers_enabled ON triggers(enabled);
`;

const CREATE_TRIGGER_STATS_TABLE = `
CREATE TABLE IF NOT EXISTS trigger_stats (
  trigger_id TEXT PRIMARY KEY,
  total_triggers INTEGER NOT NULL DEFAULT 0,
  success_triggers INTEGER NOT NULL DEFAULT 0,
  failed_triggers INTEGER NOT NULL DEFAULT 0,
  last_triggered_at INTEGER,
  last_trigger_result TEXT,
  avg_duration_ms INTEGER,
  FOREIGN KEY (trigger_id) REFERENCES triggers(id) ON DELETE CASCADE
);
`;

// ===================== 触发器管理类 =====================

class TriggerManager {
  private db: ReturnType<typeof initDb> | null = null;

  constructor() {
    // 初始化时创建表
  }

  /**
   * 初始化数据库表
   */
  private ensureTables(): void {
    if (!this.db) {
      this.db = initDb();
    }
    this.db.exec(CREATE_TRIGGER_TABLE);
    this.db.exec(CREATE_TRIGGER_STATS_TABLE);
  }

  // ========== CRUD 操作 ==========

  /**
   * 注册触发器（创建并持久化）
   */
  registerTrigger(trigger: Omit<Trigger, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): Trigger {
    this.ensureTables();

    const now = Date.now();
    const id = `trigger_${now}_${Math.random().toString(36).slice(2, 8)}`;

    const fullTrigger: Trigger = {
      id,
      name: trigger.name,
      type: trigger.type,
      automationIds: trigger.automationIds,
      config: trigger.config,
      enabled: trigger.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      triggerCount: 0,
    };

    // 持久化到数据库
    const stmt = this.db!.prepare(`
      INSERT INTO triggers (id, name, type, automation_ids, config, enabled, created_at, updated_at, trigger_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullTrigger.id,
      fullTrigger.name,
      fullTrigger.type,
      JSON.stringify(fullTrigger.automationIds),
      JSON.stringify(fullTrigger.config),
      fullTrigger.enabled ? 1 : 0,
      fullTrigger.createdAt,
      fullTrigger.updatedAt,
      fullTrigger.triggerCount
    );

    // 注册到触发器引擎
    const engine = getTriggerEngine();
    engine.registerTrigger(fullTrigger);

    logger.info(`[TriggerManager] 触发器 ${id} 已注册`);
    return fullTrigger;
  }

  /**
   * 注销触发器
   */
  unregisterTrigger(id: string): boolean {
    this.ensureTables();

    // 从数据库删除
    const stmt = this.db!.prepare('DELETE FROM triggers WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      logger.warn(`[TriggerManager] 触发器 ${id} 不存在`);
      return false;
    }

    // 从触发器引擎注销
    const engine = getTriggerEngine();
    engine.unregisterTrigger(id);

    logger.info(`[TriggerManager] 触发器 ${id} 已注销`);
    return true;
  }

  /**
   * 启用触发器
   */
  enableTrigger(id: string): boolean {
    this.ensureTables();

    const trigger = this.getTrigger(id);
    if (!trigger) {
      logger.warn(`[TriggerManager] 触发器 ${id} 不存在`);
      return false;
    }

    // 更新数据库
    const stmt = this.db!.prepare('UPDATE triggers SET enabled = 1, updated_at = ? WHERE id = ?');
    stmt.run(Date.now(), id);

    // 更新引擎
    const engine = getTriggerEngine();
    engine.enableTrigger(id);

    logger.info(`[TriggerManager] 触发器 ${id} 已启用`);
    return true;
  }

  /**
   * 禁用触发器
   */
  disableTrigger(id: string): boolean {
    this.ensureTables();

    const trigger = this.getTrigger(id);
    if (!trigger) {
      logger.warn(`[TriggerManager] 触发器 ${id} 不存在`);
      return false;
    }

    // 更新数据库
    const stmt = this.db!.prepare('UPDATE triggers SET enabled = 0, updated_at = ? WHERE id = ?');
    stmt.run(Date.now(), id);

    // 更新引擎
    const engine = getTriggerEngine();
    engine.disableTrigger(id);

    logger.info(`[TriggerManager] 触发器 ${id} 已禁用`);
    return true;
  }

  /**
   * 获取单个触发器
   */
  getTrigger(id: string): Trigger | null {
    this.ensureTables();

    const stmt = this.db!.prepare('SELECT * FROM triggers WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as TriggerType,
      automationIds: JSON.parse(row.automation_ids as string) as string[],
      config: JSON.parse(row.config as string) as Trigger['config'],
      enabled: (row.enabled as number) === 1,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      lastTriggeredAt: row.last_triggered_at as number | undefined,
      triggerCount: row.trigger_count as number,
    };
  }

  /**
   * 列出所有触发器
   */
  listTriggers(options?: {
    type?: TriggerType;
    enabled?: boolean;
    automationId?: string;
  }): Trigger[] {
    this.ensureTables();

    let sql = 'SELECT * FROM triggers';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (options?.enabled !== undefined) {
      conditions.push('enabled = ?');
      params.push(options.enabled ? 1 : 0);
    }

    if (options?.automationId) {
      conditions.push('automation_ids LIKE ?');
      params.push(`%"${options.automationId}"%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = this.db!.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as TriggerType,
      automationIds: JSON.parse(row.automation_ids as string) as string[],
      config: JSON.parse(row.config as string) as Trigger['config'],
      enabled: (row.enabled as number) === 1,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      lastTriggeredAt: row.last_triggered_at as number | undefined,
      triggerCount: row.trigger_count as number,
    }));
  }

  /**
   * 更新触发器
   */
  updateTrigger(id: string, updates: Partial<Trigger>): Trigger | null {
    this.ensureTables();

    const existing = this.getTrigger(id);
    if (!existing) {
      logger.warn(`[TriggerManager] 触发器 ${id} 不存在`);
      return null;
    }

    const allowedFields: Record<string, string> = {
      name: 'name',
      automationIds: 'automation_ids',
      config: 'config',
      enabled: 'enabled',
    };

    const updateData: Record<string, unknown> = { updated_at: Date.now() };

    for (const [key, column] of Object.entries(allowedFields)) {
      if (key in updates && (updates as any)[key] !== undefined) {
        if (key === 'automationIds' || key === 'config') {
          updateData[column] = JSON.stringify((updates as any)[key]);
        } else if (key === 'enabled') {
          updateData[column] = (updates as any)[key] ? 1 : 0;
        } else {
          updateData[column] = (updates as any)[key];
        }
      }
    }

    if (Object.keys(updateData).length === 1) { // 只有 updated_at
      logger.warn(`[TriggerManager] 触发器 ${id} 无更新字段`);
      return existing;
    }

    // 更新数据库
    const columns = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updateData);
    const stmt = this.db!.prepare(`UPDATE triggers SET ${columns} WHERE id = ?`);
    stmt.run(...values, id);

    // 获取更新后的触发器
    const updated = this.getTrigger(id);
    if (!updated) return null;

    // 更新引擎中的触发器
    const engine = getTriggerEngine();

    // 如果启用状态变化，需要重新激活/停用
    if (updates.enabled !== undefined && updates.enabled !== existing.enabled) {
      if (updates.enabled) {
        engine.enableTrigger(id);
      } else {
        engine.disableTrigger(id);
      }
    } else if (existing.enabled) {
      // 配置变化，需要重新激活
      engine.unregisterTrigger(id);
      engine.registerTrigger(updated);
    }

    logger.info(`[TriggerManager] 触发器 ${id} 已更新`);
    return updated;
  }

  // ========== 统计查询 ==========

  /**
   * 获取触发器统计信息
   */
  getTriggerStats(id: string): TriggerStats | null {
    this.ensureTables();

    const stmt = this.db!.prepare('SELECT * FROM trigger_stats WHERE trigger_id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) {
      // 如果数据库中没有统计，从引擎获取
      const engine = getTriggerEngine();
      return engine.getTriggerStats(id) ?? null;
    }

    return {
      triggerId: row.trigger_id as string,
      totalTriggers: row.total_triggers as number,
      successTriggers: row.success_triggers as number,
      failedTriggers: row.failed_triggers as number,
      lastTriggeredAt: row.last_triggered_at as number | undefined,
      lastTriggerResult: row.last_trigger_result as 'success' | 'failed' | undefined,
      avgDurationMs: row.avg_duration_ms as number | undefined,
    };
  }

  /**
   * 更新触发器统计（由引擎调用）
   */
  updateTriggerStats(id: string, stats: Partial<TriggerStats>): void {
    this.ensureTables();

    const stmt = this.db!.prepare(`
      INSERT INTO trigger_stats (trigger_id, total_triggers, success_triggers, failed_triggers, last_triggered_at, last_trigger_result, avg_duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trigger_id) DO UPDATE SET
        total_triggers = total_triggers + ?,
        success_triggers = success_triggers + ?,
        failed_triggers = failed_triggers + ?,
        last_triggered_at = ?,
        last_trigger_result = ?,
        avg_duration_ms = ?
    `);

    stmt.run(
      id,
      stats.totalTriggers ?? 0,
      stats.successTriggers ?? 0,
      stats.failedTriggers ?? 0,
      stats.lastTriggeredAt ?? null,
      stats.lastTriggerResult ?? null,
      stats.avgDurationMs ?? null,
      stats.totalTriggers ?? 0,
      stats.successTriggers ?? 0,
      stats.failedTriggers ?? 0,
      stats.lastTriggeredAt ?? null,
      stats.lastTriggerResult ?? null,
      stats.avgDurationMs ?? null
    );
  }

  // ========== 初始化 ==========

  /**
   * 初始化触发器管理器（加载已保存的触发器）
   */
  initialize(): void {
    this.ensureTables();

    // 加载所有触发器并注册到引擎
    const triggers = this.listTriggers();
    const engine = getTriggerEngine();

    for (const trigger of triggers) {
      engine.registerTrigger(trigger);
    }

    logger.info(`[TriggerManager] 已加载 ${triggers.length} 个触发器`);
  }

  /**
   * 清空所有触发器
   */
  clear(): void {
    this.ensureTables();

    this.db!.exec('DELETE FROM trigger_stats');
    this.db!.exec('DELETE FROM triggers');

    const engine = getTriggerEngine();
    for (const trigger of engine.listTriggers()) {
      engine.unregisterTrigger(trigger.id);
    }

    logger.info('[TriggerManager] 已清空所有触发器');
  }
}

// ===================== 单例导出 =====================

const TRIGGER_MANAGER_INSTANCE = new TriggerManager();

export function getTriggerManager(): TriggerManager {
  return TRIGGER_MANAGER_INSTANCE;
}

export function initTriggerManager(): void {
  TRIGGER_MANAGER_INSTANCE.initialize();
}

export function resetTriggerManagerForTests(): void {
  TRIGGER_MANAGER_INSTANCE.clear();
}

export type { TriggerManager };