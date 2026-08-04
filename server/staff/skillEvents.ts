/**
 * skillEvents — 数字员工技能运行时事件发射（统计字段唯一数据源）。
 *
 * 对齐原版 StaffDeck agent_loop.py `_record_runtime_event`。这些事件写入
 * sd_agent_events，是 SkillRead.call_count / recent_call_count / success_rate 等
 * 统计字段唯一来源。读侧（staffSkillDao.buildSkillReader）只聚合，不生产 —— 没有
 * 本模块的写入，前端技能卡片调用次数恒为 0。
 *
 * 设计：纯逻辑，无引擎层依赖。tenantId 由调用方（staffChatExecutor 闭包）捕获后
 * 传入，避免在 engine（reactExecutor / actionPhaseExecutor）层泄漏 staff DAO。
 */
import * as chatDao from '../dao/staff/staffChatDao.js';
import * as traceDao from '../dao/staff/staffTraceDao.js';
import * as skillDao from '../dao/staff/staffSkillDao.js';
import { logger } from '../logger.js';

/** 查技能当前版本号，用于事件 payload（对齐原版 _skill_version）。 */
function skillVersionOf(tenantId: string, skillId: string | null): string | null {
  if (!skillId) return null;
  try {
    return skillDao.getSkillBySkillId(tenantId, skillId)?.version ?? null;
  } catch {
    return null;
  }
}

export interface SkillTransitionBefore {
  skillId: string | null;
  stepId: string | null;
  stack: unknown[];
}

export interface SkillTransitionAfter {
  skillId: string | null;
  stepId: string | null;
}

/**
 * 记录 SOP 技能切换事件。
 *
 * @param before 切换前会话的 active 状态（来自 session.active_skill_id / active_step_id / skill_stack）
 * @param after  切换后目标状态
 */
export function recordSkillTransition(
  tenantId: string,
  sessionId: string,
  before: SkillTransitionBefore,
  after: SkillTransitionAfter,
): void {
  const skillChanged = before.skillId !== after.skillId;
  const stepChanged = before.stepId !== after.stepId;
  if (!skillChanged && !stepChanged) return;

  let eventType = 'skill_step_changed';
  if (skillChanged && after.skillId) {
    // 目标技能此前已在栈中 → 视为恢复挂起任务，否则为新开任务
    const pending = before.stack.some(
      (item) =>
        item === after.skillId ||
        (item && typeof item === 'object' &&
          (item as Record<string, unknown>).skill_id === after.skillId),
    );
    eventType = pending ? 'skill_resumed' : 'skill_started';
  } else if (skillChanged && !after.skillId) {
    eventType = 'skill_exited';
  }

  try {
    traceDao.createEvent(tenantId, sessionId, eventType, {
      decision: eventType,
      from_skill_id: before.skillId,
      to_skill_id: after.skillId,
      from_skill_version: skillVersionOf(tenantId, before.skillId),
      to_skill_version: skillVersionOf(tenantId, after.skillId),
      from_step_id: before.stepId,
      to_step_id: after.stepId,
    });
  } catch (e) {
    // 统计事件不应阻断主流程
    logger.warn(`[SkillEvents] 记录技能切换事件失败: ${(e as Error).message}`);
  }
}

/**
 * 在真实聊天 turn 的技能调用点使用。
 *
 * 根据「本次调用前」会话的 active_skill_id 与本次实际调用的 skillId 判定发射事件：
 *  - 此前无任何 active skill（或 active 为空）→ skill_started
 *  - 此前 active 正是本 skill（重入）→ skill_resumed
 *  - 此前 active 是另一个 skill（切换）→ 先 skill_exited 旧，再 skill_started 新
 *
 * before 状态在调用点读取会话即反映「调用前」，因为会话 active_skill_id 的更新由
 * 前端 / PUT /sessions handler 负责，执行期不会被改写。
 */
export function recordSkillCall(tenantId: string, sessionId: string, skillId: string): void {
  let beforeRow: ReturnType<typeof chatDao.getSessionById> | null = null;
  try {
    beforeRow = chatDao.getSessionById(tenantId, sessionId);
  } catch {
    beforeRow = null;
  }
  if (!beforeRow) return;

  let stack: unknown[] = [];
  try {
    stack = (chatDao.toSessionRead(beforeRow).skill_stack as unknown[]) ?? [];
  } catch {
    stack = [];
  }

  const prevSkill = beforeRow.active_skill_id ?? null;
  // 若之前已有不同 skill 在跑，先记一次退出，再记本次进入（对齐原版切换语义）
  if (prevSkill && prevSkill !== skillId) {
    recordSkillTransition(tenantId, sessionId, {
      skillId: prevSkill,
      stepId: beforeRow.active_step_id ?? null,
      stack,
    }, { skillId: null, stepId: null });
  }

  recordSkillTransition(tenantId, sessionId, {
    skillId: prevSkill,
    stepId: beforeRow.active_step_id ?? null,
    stack,
  }, { skillId, stepId: null });
}
