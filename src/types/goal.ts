/**
 * Goal Types - 目标管理前端类型定义
 */

export type GoalStatus = 'pending' | 'in_progress' | 'complete' | 'blocked' | 'cancelled';

export interface GoalRecord {
  id: string;
  sessionKey: string;
  objective: string;
  status: GoalStatus;
  tokenBudget: number | null;
  usedTokens: number;
  createdAt: number;
  updatedAt: number;
  note: string | null;
}

export interface GoalSnapshot {
  status: 'missing' | 'found';
  goal?: GoalRecord;
}
