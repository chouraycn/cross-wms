/**
 * StaffDeck Goals Routes — /api/staffdeck/goals
 *
 * durable goal（事件溯源）：员工会话的"当前任务"状态机。
 *   GET  /                      按租户列出目标（可 ?phase= 过滤）——任务看板
 *   GET  /:session_id           读取会话当前目标（权威 fold）
 *   POST /                      为目标会话创建目标 { session_id, objective, max_goal_rounds?, agent_id? }
 *   PATCH /:session_id          状态迁移 { operation: edit|pause|resume|complete|block|clear, ... }
 *   POST /:session_id/rounds    准入一个续跑轮次
 *
 * 响应格式统一 { code, data, message }
 */
import { Router, type Request, type Response } from 'express';
import { getStaffContext, staffAuth } from '../../middleware/staffAuth.js';
import { getSessionById } from '../../dao/staff/staffSessionDao.js';
import { listGoalsByTenant } from '../../dao/goalDao.js';
import { staffGoalService } from '../../staff/staffGoalService.js';
import { GoalError, type GoalBlockReason, type GoalPhase } from '../../engine/goalService.js';

const router = Router();

function ok(res: Response, data: unknown, message = 'ok'): void {
  res.json({ code: 0, data, message });
}

function fail(res: Response, code: number, message: string): void {
  res.status(code >= 400 ? code : 400).json({ code, data: null, message });
}

/** 校验会话归属租户/用户，返回 session 或 null */
function resolveOwnedSession(
  ctx: { tenantId: string; userId: string },
  sessionId: string,
): { user_id: string | null } | null {
  const session = getSessionById(ctx.tenantId, sessionId);
  if (!session || session.user_id !== ctx.userId) return null;
  return session;
}

function handleGoalError(res: Response, err: unknown): void {
  if (err instanceof GoalError) {
    if (err.code === 'CONFLICT') return fail(res, 409, err.message);
    if (err.code === 'NO_GOAL') return fail(res, 404, err.message);
    if (err.code === 'EXISTS' || err.code === 'STOPPED' || err.code === 'ROUNDS_EXHAUSTED' || err.code === 'INVALID_TRANSITION') {
      return fail(res, 409, err.message);
    }
    return fail(res, 400, err.message);
  }
  return fail(res, 500, err instanceof Error ? err.message : String(err));
}

// ===================== GET /api/staffdeck/goals — 按租户列表 =====================

router.get('/', staffAuth, (_req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const phase = typeof _req.query.phase === 'string' ? (_req.query.phase as GoalPhase) : undefined;
  const items = phase ? listGoalsByTenant(ctx.tenantId, phase) : listGoalsByTenant(ctx.tenantId);
  ok(res, items);
});

// ===================== GET /api/staffdeck/goals/:session_id — 当前目标 =====================

router.get('/:session_id', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const sessionId = req.params.session_id;
  const session = resolveOwnedSession(ctx, sessionId);
  if (!session) return fail(res, 404, 'Session not found');

  staffGoalService
    .get(sessionId)
    .then((goal) => ok(res, goal ?? null))
    .catch((err) => handleGoalError(res, err));
});

// ===================== POST /api/staffdeck/goals — 创建目标 =====================

router.post('/', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const body = (req.body ?? {}) as {
    session_id?: string;
    objective?: string;
    max_goal_rounds?: number;
    agent_id?: string;
  };
  if (!body.session_id || !body.objective) {
    return fail(res, 400, 'session_id 与 objective 必填');
  }
  const session = resolveOwnedSession(ctx, body.session_id);
  if (!session) return fail(res, 404, 'Session not found');

  staffGoalService
    .create(body.session_id, {
      objective: body.objective,
      maxGoalRounds: body.max_goal_rounds,
      tenantId: ctx.tenantId,
      agentId: body.agent_id ?? ctx.userId,
    })
    .then((goal) => ok(res, goal, 'created'))
    .catch((err) => handleGoalError(res, err));
});

// ===================== PATCH /api/staffdeck/goals/:session_id — 状态迁移 =====================

router.patch('/:session_id', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const sessionId = req.params.session_id;
  const session = resolveOwnedSession(ctx, sessionId);
  if (!session) return fail(res, 404, 'Session not found');

  const body = (req.body ?? {}) as {
    operation?: string;
    objective?: string;
    max_goal_rounds?: number;
    blocked_reason?: { code?: string; message?: string };
  };
  const operation = body.operation ?? 'edit';

  staffGoalService
    .get(sessionId)
    .then(async (current) => {
      if (!current) throw new GoalError('NO_GOAL', `会话 ${sessionId} 当前无目标`);
      const ref = { id: current.id, revision: current.revision };
      switch (operation) {
        case 'edit':
          return staffGoalService.edit(sessionId, ref, {
            objective: body.objective,
            maxGoalRounds: body.max_goal_rounds,
          });
        case 'pause':
        case 'resume':
        case 'complete':
          return staffGoalService.transition(sessionId, ref, operation);
        case 'block': {
          const reason: GoalBlockReason = {
            code: body.blocked_reason?.code ?? 'manual_block',
            message: body.blocked_reason?.message ?? '管理员手动阻塞',
          };
          return staffGoalService.transition(sessionId, ref, 'block', reason);
        }
        case 'clear':
          await staffGoalService.clear(sessionId, ref);
          return null;
        default:
          throw new GoalError('BAD_REQUEST', `未知操作: ${operation}`);
      }
    })
    .then((result) => ok(res, result, operation))
    .catch((err) => handleGoalError(res, err));
});

// ===================== POST /api/staffdeck/goals/:session_id/rounds — 准入轮次 =====================

router.post('/:session_id/rounds', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const sessionId = req.params.session_id;
  const session = resolveOwnedSession(ctx, sessionId);
  if (!session) return fail(res, 404, 'Session not found');

  staffGoalService
    .get(sessionId)
    .then(async (current) => {
      if (!current) throw new GoalError('NO_GOAL', `会话 ${sessionId} 当前无目标`);
      return staffGoalService.admitRound(sessionId, { id: current.id, revision: current.revision });
    })
    .then((goal) => ok(res, goal, 'round admitted'))
    .catch((err) => handleGoalError(res, err));
});

export default router;
