/**
 * Goal Types - 目标管理系统类型定义
 *
 * 参考 OpenClaw 的 SessionGoal 实现，用于跟踪会话目标进度和 token 预算
 */

/**
 * 目标状态
 * - pending: 等待中
 * - in_progress: 进行中
 * - complete: 已完成
 * - blocked: 已阻塞
 * - cancelled: 已取消
 */
export type GoalStatus = 'pending' | 'in_progress' | 'complete' | 'blocked' | 'cancelled';

/**
 * 目标记录（存储在 SQLite goal 表）
 */
export interface GoalRecord {
  /** 目标唯一 ID */
  id: string;
  /** 会话标识 */
  sessionKey: string;
  /** 目标描述 */
  objective: string;
  /** 目标状态 */
  status: GoalStatus;
  /** Token 预算 */
  tokenBudget: number | null;
  /** 已使用的 Token 数量 */
  usedTokens: number;
  /** 创建时间（毫秒） */
  createdAt: number;
  /** 更新时间（毫秒） */
  updatedAt: number;
  /** 状态备注 */
  note: string | null;
}

/**
 * 目标快照（用于返回给调用方）
 */
export interface GoalSnapshot {
  status: 'missing' | 'found';
  goal?: GoalRecord;
}

/**
 * 创建目标选项
 */
export interface CreateGoalOptions {
  sessionKey: string;
  objective: string;
  tokenBudget?: number;
}

/**
 * 更新目标状态选项
 */
export interface UpdateGoalOptions {
  sessionKey: string;
  status: GoalStatus;
  note?: string;
}

/**
 * 获取目标选项
 */
export interface GetGoalOptions {
  sessionKey: string;
}

/**
 * 清除目标选项
 */
export interface ClearGoalOptions {
  sessionKey: string;
}

/**
 * 模型可更新的目标状态（仅允许 AI 更新为这些状态）
 */
export const MODEL_UPDATABLE_GOAL_STATUSES: readonly GoalStatus[] = ['complete', 'blocked'];

/** 终态目标状态（无法再更改） */
export const TERMINAL_GOAL_STATUSES: readonly GoalStatus[] = ['complete', 'cancelled'];

export type Goal = GoalRecord;
export type GoalState = GoalStatus;
export type GoalEntry = GoalRecord;