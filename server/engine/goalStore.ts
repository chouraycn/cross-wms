/**
 * Goal Store - 目标存储管理
 *
 * 使用 SQLite 存储 goal 表，支持创建、获取、更新、清除目标
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db-core.js';
import { logger } from '../logger.js';
import type {
  GoalRecord,
  GoalSnapshot,
  CreateGoalOptions,
  UpdateGoalOptions,
  GetGoalOptions,
  ClearGoalOptions,
  GoalStatus,
} from './goalTypes.js';
import { TERMINAL_GOAL_STATUSES } from './goalTypes.js';

/**
 * 初始化 goal 表
 */
export function initGoalTables(db: ReturnType<typeof getDb>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal (
      id TEXT PRIMARY KEY,
      sessionKey TEXT NOT NULL UNIQUE,
      objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      tokenBudget INTEGER,
      usedTokens INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_goal_sessionKey ON goal(sessionKey);
    CREATE INDEX IF NOT EXISTS idx_goal_status ON goal(status);
  `);
  logger.info('[GoalStore] goal 表已初始化');
}

/**
 * 创建目标
 */
export function createGoal(options: CreateGoalOptions): GoalRecord {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  // 验证 objective 不为空
  const objective = options.objective.trim();
  if (!objective) {
    throw new Error('objective 不能为空');
  }

  // 验证 tokenBudget 为正数
  const tokenBudget = options.tokenBudget;
  if (tokenBudget !== undefined && tokenBudget <= 0) {
    throw new Error('tokenBudget 必须为正数');
  }

  // 检查是否已存在目标
  const existing = db.prepare('SELECT id FROM goal WHERE sessionKey = ?').get(options.sessionKey);
  if (existing) {
    throw new Error('该会话已存在目标，请先清除后再创建');
  }

  const goal: GoalRecord = {
    id,
    sessionKey: options.sessionKey,
    objective,
    status: 'pending',
    tokenBudget: tokenBudget ?? null,
    usedTokens: 0,
    createdAt: now,
    updatedAt: now,
    note: null,
  };

  db.prepare(`
    INSERT INTO goal (id, sessionKey, objective, status, tokenBudget, usedTokens, createdAt, updatedAt, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    goal.id,
    goal.sessionKey,
    goal.objective,
    goal.status,
    goal.tokenBudget,
    goal.usedTokens,
    goal.createdAt,
    goal.updatedAt,
    goal.note
  );

  logger.info('[GoalStore] 目标已创建:', { id, sessionKey: options.sessionKey, objective });
  return goal;
}

/**
 * 获取目标
 */
export function getGoal(options: GetGoalOptions): GoalSnapshot {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, sessionKey, objective, status, tokenBudget, usedTokens, createdAt, updatedAt, note
    FROM goal
    WHERE sessionKey = ?
  `).get(options.sessionKey) as GoalRecord | undefined;

  if (!row) {
    return { status: 'missing' };
  }

  return { status: 'found', goal: row };
}

/**
 * 更新目标状态
 */
export function updateGoalStatus(options: UpdateGoalOptions): GoalRecord {
  const db = getDb();
  const now = Date.now();

  // 获取现有目标
  const existing = db.prepare(`
    SELECT id, sessionKey, objective, status, tokenBudget, usedTokens, createdAt, updatedAt, note
    FROM goal
    WHERE sessionKey = ?
  `).get(options.sessionKey) as GoalRecord | undefined;

  if (!existing) {
    throw new Error('目标不存在');
  }

  // 检查是否为终态
  if (TERMINAL_GOAL_STATUSES.includes(existing.status) && existing.status !== options.status) {
    throw new Error(`目标已处于终态 ${existing.status}，无法更新`);
  }

  // 更新目标
  db.prepare(`
    UPDATE goal
    SET status = ?, updatedAt = ?, note = ?
    WHERE sessionKey = ?
  `).run(
    options.status,
    now,
    options.note ?? null,
    options.sessionKey
  );

  const updated: GoalRecord = {
    ...existing,
    status: options.status,
    updatedAt: now,
    note: options.note ?? null,
  };

  logger.info('[GoalStore] 目标已更新:', {
    sessionKey: options.sessionKey,
    status: options.status,
    note: options.note
  });

  return updated;
}

/**
 * 清除目标
 */
export function clearGoal(options: ClearGoalOptions): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM goal WHERE sessionKey = ?').run(options.sessionKey);

  if (result.changes > 0) {
    logger.info('[GoalStore] 目标已清除:', { sessionKey: options.sessionKey });
    return true;
  }

  return false;
}

/**
 * 更新目标的 usedTokens（可选功能）
 */
export function updateGoalUsedTokens(sessionKey: string, usedTokens: number): void {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE goal
    SET usedTokens = ?, updatedAt = ?
    WHERE sessionKey = ?
  `).run(usedTokens, now, sessionKey);
}

/** 格式化目标状态显示 */
export function formatGoalStatus(goal: GoalRecord | undefined): string {
  if (!goal) {
    return '当前会话无目标。\n使用 goal_create 工具创建目标。';
  }

  const budget = goal.tokenBudget
    ? `\nToken 预算: ${goal.usedTokens}/${goal.tokenBudget}`
    : '';
  const note = goal.note ? `\n备注: ${goal.note}` : '';

  return [
    '目标状态',
    `状态: ${goal.status}`,
    `描述: ${goal.objective}`,
    `已用 Token: ${goal.usedTokens}`,
    ...(budget ? [budget.slice(1)] : []),
    ...(note ? [note.slice(1)] : []),
  ].join('\n');
}

export const goalStore = {
  initGoalTables,
  createGoal,
  getGoal,
  updateGoalStatus,
  clearGoal,
  updateGoalUsedTokens,
  formatGoalStatus,
};