/**
 * StaffDeck UI Config Routes — /api/staffdeck/ui-config
 *
 * 端点：
 *   GET /  获取当前 UI 配置
 *   PUT /  更新 UI 配置（admin 权限）
 *
 * 响应格式统一为 { code, data, message }
 */
import { Router, type Request, type Response } from 'express';
import {
  getOrCreateUiConfig,
  toUiConfigRead,
  updateUiConfig,
  type UiConfigUpdateInput,
} from '../../dao/staff/staffUiConfigDao.js';
import { getStaffContext, staffAuth, requireStaffAdmin } from '../../middleware/staffAuth.js';

const router = Router();

// ===================== GET /api/staffdeck/ui-config =====================

router.get('/', staffAuth, (_req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const row = getOrCreateUiConfig(ctx.tenantId);
  res.json({ code: 0, data: toUiConfigRead(row), message: 'ok' });
});

// ===================== PUT /api/staffdeck/ui-config =====================

router.put('/', staffAuth, requireStaffAdmin, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const patch: UiConfigUpdateInput = {};

  if (typeof req.body.show_thinking_trace === 'boolean') {
    patch.show_thinking_trace = req.body.show_thinking_trace;
  }
  if (typeof req.body.show_skill_trace === 'boolean') {
    patch.show_skill_trace = req.body.show_skill_trace;
  }
  if (typeof req.body.show_tool_trace === 'boolean') {
    patch.show_tool_trace = req.body.show_tool_trace;
  }
  if (typeof req.body.reflection_max_rounds === 'number') {
    const v = Math.max(0, Math.min(5, Math.floor(req.body.reflection_max_rounds)));
    patch.reflection_max_rounds = v;
  }
  if (typeof req.body.agent_loop_max_actions === 'number') {
    const v = Math.max(1, Math.min(20, Math.floor(req.body.agent_loop_max_actions)));
    patch.agent_loop_max_actions = v;
  }

  const row = updateUiConfig(ctx.tenantId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'UI 配置不存在' });
    return;
  }
  res.json({ code: 0, data: toUiConfigRead(row), message: 'ok' });
});

export default router;
