/**
 * StaffGoalService — StaffDeck 数字员工 durable goal 门面
 *
 * 组合：GoalService（事件溯源，落会话账本）+ goalDao（投影表，供看板查询）。
 * 每次变更后同步投影；clear 后清除投影。
 */

import {
  GoalService,
  LedgerGoalStore,
  type CreateGoalRequest,
  type GoalBlockReason,
  type GoalRef,
  type GoalSnapshot,
} from '../engine/goalService.js';
import { upsertGoal, deleteGoal } from '../dao/goalDao.js';

const service = new GoalService(new LedgerGoalStore());

export const staffGoalService = {
  async get(sessionId: string): Promise<GoalSnapshot | undefined> {
    return service.get(sessionId);
  },

  async create(sessionId: string, request: CreateGoalRequest): Promise<GoalSnapshot> {
    const snapshot = await service.create(sessionId, request);
    upsertGoal(snapshot);
    return snapshot;
  },

  async edit(sessionId: string, ref: GoalRef, patch: { objective?: string; maxGoalRounds?: number }): Promise<GoalSnapshot> {
    const snapshot = await service.edit(sessionId, ref, patch);
    upsertGoal(snapshot);
    return snapshot;
  },

  async transition(
    sessionId: string,
    ref: GoalRef,
    operation: 'pause' | 'resume' | 'complete' | 'block',
    reason?: GoalBlockReason,
  ): Promise<GoalSnapshot> {
    const snapshot =
      operation === 'block'
        ? await service.transition(sessionId, ref, 'block', reason ?? { code: 'manual_block', message: '管理员手动阻塞' })
        : await service.transition(sessionId, ref, operation);
    upsertGoal(snapshot);
    return snapshot;
  },

  async admitRound(sessionId: string, ref: GoalRef): Promise<GoalSnapshot> {
    const snapshot = await service.admitRound(sessionId, ref);
    upsertGoal(snapshot);
    return snapshot;
  },

  async clear(sessionId: string, ref: GoalRef): Promise<GoalRef> {
    const tombstone = await service.clear(sessionId, ref);
    deleteGoal(sessionId);
    return tombstone;
  },
};
