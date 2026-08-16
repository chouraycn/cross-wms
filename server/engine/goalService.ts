/**
 * goalService — durable goal（对标 DeepSeek Harness goal 服务，docs/subsystems/goal.md）
 *
 * 事件溯源：每次变更写一条 `goal/change` 会话账本事件（ledger_events，类型 goal.change），
 * 当前目标 = 对事件流做 fold（last-wins by revision）。任何时刻可回答：
 * "这个员工会话当前在做什么、卡在哪、为什么、还有多少轮预算"。
 *
 * 生命周期四态：active / paused / blocked / complete
 * - blocked 必须携带机器可路由的 code + 人读的 message（供看板/告警路由）。
 * - 并发控制：GoalRef{id, revision} CAS——每次可持久化变更递增 revision，过期 revision 拒绝。
 * - 轮次预算：maxGoalRounds 封顶，admitRound 按序记账防重放。
 *
 * 存储可注入（GoalStore）：
 * - LedgerGoalStore：生产实现，落会话账本（与批次 1-4 的审计链路同源）。
 * - InMemoryGoalStore：测试用。
 */

import { getEventLedger, type EventType } from './eventLedger.js';
import type { LedgerEvent } from './eventLedger.js';

// ===================== 领域类型 =====================

export type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete';

/** blocked 原因：code 机器可路由（稳定小写 kebab），message 人读 */
export interface GoalBlockReason {
  code: string;
  message: string;
}

/** CAS 身份：每次可持久化变更递增 revision */
export interface GoalRef {
  id: string;
  revision: number;
}

/** 完整目标快照（每次变更写入的持久化状态） */
export interface GoalSnapshot extends GoalRef {
  objective: string;
  phase: GoalPhase;
  blockedReason?: GoalBlockReason;
  /** 总续跑轮次预算；0 表示无限制 */
  maxGoalRounds: number;
  /** 已准入轮次数 */
  roundsStarted: number;
  createdAt: number;
  updatedAt: number;
  /** StaffDeck 扩展：目标归属（租户/员工/会话） */
  tenantId?: string;
  agentId?: string;
  sessionId: string;
}

export interface CreateGoalRequest {
  objective: string;
  maxGoalRounds?: number;
  tenantId?: string;
  agentId?: string;
}

export type GoalOperation =
  | 'create' | 'edit' | 'pause' | 'resume' | 'complete' | 'block' | 'round' | 'clear';

/** goal/change 账本事件 payload（与 DSH goal/change 对齐：快照或墓碑） */
export interface GoalChangeEvent {
  kind: 'goal/change';
  version: 1;
  operation: GoalOperation;
  /** 非 clear 变更携带完整后置快照 */
  goal?: GoalSnapshot;
  /** clear 携带墓碑（id + 递增后 revision） */
  cleared?: GoalRef;
}

// ===================== 存储抽象 =====================

export interface GoalStore {
  append(sessionId: string, event: GoalChangeEvent, runId?: string): Promise<void>;
  readAll(sessionId: string): Promise<GoalChangeEvent[]>;
}

/** 生产实现：会话账本（ledger_events） */
export class LedgerGoalStore implements GoalStore {
  async append(sessionId: string, event: GoalChangeEvent, runId?: string): Promise<void> {
    await getEventLedger().recordEvent(sessionId, 'goal.change', event as unknown as Record<string, unknown>, { runId });
  }

  async readAll(sessionId: string): Promise<GoalChangeEvent[]> {
    const events = await getEventLedger().getSessionEvents(sessionId, { eventTypes: ['goal.change' as EventType] });
    return events.map((e: LedgerEvent) => e.payload as unknown as GoalChangeEvent);
  }
}

/** 测试实现：内存 */
export class InMemoryGoalStore implements GoalStore {
  private events: Array<{ sessionId: string; event: GoalChangeEvent }> = [];
  async append(sessionId: string, event: GoalChangeEvent): Promise<void> {
    this.events.push({ sessionId, event });
  }
  async readAll(sessionId: string): Promise<GoalChangeEvent[]> {
    return this.events.filter((e) => e.sessionId === sessionId).map((e) => e.event);
  }
}

// ===================== 错误 =====================

export class GoalError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GoalError';
    this.code = code;
  }
}

// ===================== 折叠 =====================

/**
 * 从 goal/change 事件流折叠当前目标。
 * - clear 墓碑 → 无当前目标（保留墓碑以支持"曾被清除"的审计）。
 * - 多版本并存 → revision 最大者胜（last-wins by revision）。
 */
export function foldGoalEvents(events: GoalChangeEvent[]): GoalSnapshot | undefined {
  let current: GoalSnapshot | undefined;
  let cleared: GoalRef | undefined;
  for (const ev of events) {
    if (ev.kind !== 'goal/change') continue;
    if (ev.operation === 'clear') {
      cleared = ev.cleared;
      current = undefined;
      continue;
    }
    if (!ev.goal) continue;
    if (!current || ev.goal.revision > current.revision) {
      current = ev.goal;
    }
  }
  if (current) return current;
  void cleared; // 墓碑保留在事件流中，无当前目标即返回 undefined
  return undefined;
}

// ===================== 服务 =====================

const MAX_GOAL_ROUNDS_DEFAULT = 50;

export class GoalService {
  constructor(private readonly store: GoalStore) {}

  /** 读取当前目标（fold 事件流） */
  async get(sessionId: string): Promise<GoalSnapshot | undefined> {
    return foldGoalEvents(await this.store.readAll(sessionId));
  }

  private async assertCurrent(sessionId: string, ref: GoalRef): Promise<GoalSnapshot> {
    const current = await this.get(sessionId);
    if (!current) throw new GoalError('NO_GOAL', `会话 ${sessionId} 当前无目标`);
    if (current.id !== ref.id || current.revision !== ref.revision) {
      throw new GoalError('CONFLICT', `目标修订冲突：期望 r${ref.revision}，当前 r${current.revision}`);
    }
    return current;
  }

  private async commit(
    sessionId: string,
    operation: GoalOperation,
    goal: GoalSnapshot,
    runId?: string,
  ): Promise<GoalSnapshot> {
    await this.store.append(sessionId, { kind: 'goal/change', version: 1, operation, goal }, runId);
    return goal;
  }

  /** 创建目标。存在当前目标（非 complete）时拒绝；complete 后可替换。 */
  async create(sessionId: string, request: CreateGoalRequest): Promise<GoalSnapshot> {
    const current = await this.get(sessionId);
    if (current && current.phase !== 'complete') {
      throw new GoalError('EXISTS', `会话 ${sessionId} 已有进行中的目标（${current.phase}），须先 clear/complete`);
    }
    const now = Date.now();
    const snapshot: GoalSnapshot = {
      id: `goal-${now}-${Math.random().toString(36).slice(2, 8)}`,
      revision: 1,
      objective: request.objective.trim(),
      phase: 'active',
      maxGoalRounds: request.maxGoalRounds ?? MAX_GOAL_ROUNDS_DEFAULT,
      roundsStarted: 0,
      createdAt: now,
      updatedAt: now,
      tenantId: request.tenantId,
      agentId: request.agentId,
      sessionId,
    };
    if (!snapshot.objective) throw new GoalError('BAD_REQUEST', 'objective 不能为空');
    if (snapshot.maxGoalRounds < 0) throw new GoalError('BAD_REQUEST', 'maxGoalRounds 不能为负');
    return this.commit(sessionId, 'create', snapshot);
  }

  /** 编辑目标（objective / maxGoalRounds），CAS 保护 */
  async edit(sessionId: string, ref: GoalRef, patch: { objective?: string; maxGoalRounds?: number }): Promise<GoalSnapshot> {
    const current = await this.assertCurrent(sessionId, ref);
    if (current.phase === 'complete' || current.phase === 'blocked') {
      throw new GoalError('STOPPED', `目标处于 ${current.phase} 状态，不可编辑（先 resume 或 clear）`);
    }
    const objective = patch.objective !== undefined ? patch.objective.trim() : current.objective;
    if (!objective) throw new GoalError('BAD_REQUEST', 'objective 不能为空');
    const updated: GoalSnapshot = {
      ...current,
      objective,
      maxGoalRounds: patch.maxGoalRounds ?? current.maxGoalRounds,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    };
    if (updated.maxGoalRounds < 0) throw new GoalError('BAD_REQUEST', 'maxGoalRounds 不能为负');
    return this.commit(sessionId, 'edit', updated);
  }

  /** 状态迁移：pause / resume / complete / block（CAS 保护） */
  async transition(
    sessionId: string,
    ref: GoalRef,
    operation: 'pause' | 'resume' | 'complete',
  ): Promise<GoalSnapshot>;
  async transition(
    sessionId: string,
    ref: GoalRef,
    operation: 'block',
    reason: GoalBlockReason,
  ): Promise<GoalSnapshot>;
  async transition(
    sessionId: string,
    ref: GoalRef,
    operation: 'pause' | 'resume' | 'complete' | 'block',
    reason?: GoalBlockReason,
  ): Promise<GoalSnapshot> {
    const current = await this.assertCurrent(sessionId, ref);
    if (operation === 'block') {
      if (!reason || !reason.code || !reason.message) {
        throw new GoalError('BAD_REQUEST', 'block 必须携带 code + message');
      }
      if (current.phase === 'complete') throw new GoalError('STOPPED', '已完成的目标不可 block');
      return this.commit(sessionId, 'block', {
        ...current,
        phase: 'blocked',
        blockedReason: { code: reason.code, message: reason.message },
        revision: current.revision + 1,
        updatedAt: Date.now(),
      });
    }
    const nextPhase: GoalPhase = operation === 'pause' ? 'paused' : operation === 'resume' ? 'active' : 'complete';
    const invalid = (): boolean =>
      (operation === 'pause' && current.phase !== 'active') ||
      (operation === 'resume' && current.phase !== 'paused' && current.phase !== 'blocked') ||
      (operation === 'complete' && current.phase === 'complete');
    if (invalid()) throw new GoalError('INVALID_TRANSITION', `目标 ${current.phase} 不可执行 ${operation}`);
    return this.commit(sessionId, operation, {
      ...current,
      phase: nextPhase,
      blockedReason: nextPhase === 'active' ? undefined : current.blockedReason,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    });
  }

  /** 准入一个续跑轮次：按序记账，超预算/非 active 拒绝 */
  async admitRound(sessionId: string, ref: GoalRef): Promise<GoalSnapshot> {
    const current = await this.assertCurrent(sessionId, ref);
    if (current.phase !== 'active') throw new GoalError('STOPPED', `目标处于 ${current.phase}，不可续跑`);
    if (current.maxGoalRounds > 0 && current.roundsStarted >= current.maxGoalRounds) {
      throw new GoalError('ROUNDS_EXHAUSTED', `目标已达轮次上限 ${current.maxGoalRounds}`);
    }
    return this.commit(sessionId, 'round', {
      ...current,
      roundsStarted: current.roundsStarted + 1,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    });
  }

  /** 清除当前目标（墓碑保留在事件流） */
  async clear(sessionId: string, ref: GoalRef): Promise<GoalRef> {
    const current = await this.assertCurrent(sessionId, ref);
    const tombstone: GoalRef = { id: current.id, revision: current.revision + 1 };
    await this.store.append(sessionId, { kind: 'goal/change', version: 1, operation: 'clear', cleared: tombstone });
    return tombstone;
  }
}
