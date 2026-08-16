/**
 * StaffDeck Delegations Routes — /api/staffdeck/delegations
 *
 * 员工互相派活（P2b）：深度上限 + 父授权 + 持久 descriptor（sd_delegations）。
 *   GET  /                    按租户列出派活（?status=&agent_id= 过滤）
 *   POST /                    创建派活 { child_agent_id, task_description, parent_session_id }
 *   POST /:id/active          绑定子会话 { parent_session_id, child_session_id }
 *   POST /:id/complete        完成   { parent_session_id }
 *   POST /:id/fail            失败   { parent_session_id, error? }
 *   POST /:id/block           阻塞   { parent_session_id, error? }
 *   POST /:id/unblock         解除阻塞 → active { parent_session_id }
 *
 * 父授权：操作人须经自己的会话（parent_session_id 归属当前用户），且该会话的
 * agent_id 必须是派活的直接父员工（由 staffDelegationService.assertParentAuthorized 强制）。
 *
 * 响应格式统一 { code, data, message }
 */
import { Router, type Request, type Response } from 'express';
import { getStaffContext, staffAuth } from '../../middleware/staffAuth.js';
import { getSessionById } from '../../dao/staff/staffSessionDao.js';
import { staffDelegationService } from '../../staff/staffDelegation.js';
import { DelegationError } from '../../staff/staffDelegation.js';
import type { DelegationStatus } from '../../dao/staffDelegationDao.js';

const router = Router();

function ok(res: Response, data: unknown, message = 'ok'): void {
  res.json({ code: 0, data, message });
}

function fail(res: Response, code: number, message: string): void {
  res.status(code >= 400 ? code : 400).json({ code, data: null, message });
}

function handleDelegationError(res: Response, err: unknown): void {
  if (err instanceof DelegationError) {
    if (err.code === 'NOT_FOUND') return fail(res, 404, err.message);
    if (err.code === 'UNAUTHORIZED' || err.code === 'TERMINAL' || err.code === 'DEPTH_EXCEEDED') {
      return fail(res, 409, err.message);
    }
    return fail(res, 400, err.message);
  }
  return fail(res, 500, err instanceof Error ? err.message : String(err));
}

/** 解析操作人：parent_session_id 归属当前用户 → 返回该会话的 agent_id（操作人身份） */
function resolveOperatorAgent(ctx: { tenantId: string; userId: string }, parentSessionId: string): string | null {
  if (!parentSessionId) return null;
  const session = getSessionById(ctx.tenantId, parentSessionId);
  if (!session || session.user_id !== ctx.userId) return null;
  return session.agent_id ?? null;
}

// ===================== GET /api/staffdeck/delegations — 列表 =====================

router.get('/', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const status = typeof req.query.status === 'string' ? (req.query.status as DelegationStatus) : undefined;
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined;
  ok(res, staffDelegationService.list(ctx.tenantId, { status, agentId }));
});

// ===================== POST /api/staffdeck/delegations — 创建 =====================

router.post('/', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const body = (req.body ?? {}) as {
    child_agent_id?: string;
    task_description?: string;
    parent_session_id?: string;
  };
  if (!body.child_agent_id || !body.task_description || !body.parent_session_id) {
    return fail(res, 400, 'child_agent_id / task_description / parent_session_id 必填');
  }
  const operatorAgentId = resolveOperatorAgent(ctx, body.parent_session_id);
  if (!operatorAgentId) return fail(res, 403, 'parent_session_id 无效或不属于当前用户');

  staffDelegationService
    .create({
      tenantId: ctx.tenantId,
      parentAgentId: operatorAgentId,
      childAgentId: body.child_agent_id,
      parentSessionId: body.parent_session_id,
      taskDescription: body.task_description,
    })
    .then((row) => ok(res, row, 'created'))
    .catch((err) => handleDelegationError(res, err));
});

// ===================== POST /:id/<transition> — 状态迁移 =====================

type TransitionName = 'active' | 'complete' | 'fail' | 'block' | 'unblock';

function transitionEndpoint(status: 'active' | 'completed' | 'failed' | 'blocked'): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    const ctx = getStaffContext(res);
    const id = req.params.id;
    const body = (req.body ?? {}) as { parent_session_id?: string; child_session_id?: string; error?: string };
    const operatorAgentId = resolveOperatorAgent(ctx, body.parent_session_id ?? '');
    if (!operatorAgentId) return fail(res, 403, 'parent_session_id 无效或不属于当前用户');

    const promise =
      status === 'active'
        ? staffDelegationService.transition(ctx.tenantId, operatorAgentId, id, 'active', {
            childSessionId: body.child_session_id,
          })
        : status === 'completed'
          ? staffDelegationService.transition(ctx.tenantId, operatorAgentId, id, 'completed')
          : staffDelegationService.transition(ctx.tenantId, operatorAgentId, id, status, { error: body.error });

    promise
      .then((row) => ok(res, row, status))
      .catch((err) => handleDelegationError(res, err));
  };
}

router.post('/:id/active', staffAuth, transitionEndpoint('active'));
router.post('/:id/complete', staffAuth, transitionEndpoint('completed'));
router.post('/:id/fail', staffAuth, transitionEndpoint('failed'));
router.post('/:id/block', staffAuth, transitionEndpoint('blocked'));
router.post('/:id/unblock', staffAuth, transitionEndpoint('active'));

export default router;
