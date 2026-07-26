/**
 * StaffDeck Persona Routes — /api/staffdeck/persona
 *
 * 端点：
 *   GET /  获取人设配置
 *   PUT /  更新人设配置（admin 权限）
 *
 * 响应格式统一为 { code, data, message }
 */
import { Router, type Request, type Response } from 'express';
import {
  getOrCreatePersona,
  toPersonaRead,
  updatePersona,
} from '../../dao/staff/staffPersonaDao.js';
import { getStaffContext, staffAuth, requireStaffAdmin } from '../../middleware/staffAuth.js';

const router = Router();

// ===================== GET /api/staffdeck/persona =====================

router.get('/', staffAuth, (_req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const row = getOrCreatePersona(ctx.tenantId);
  res.json({ code: 0, data: toPersonaRead(row), message: 'ok' });
});

// ===================== PUT /api/staffdeck/persona =====================

router.put('/', staffAuth, requireStaffAdmin, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const systemPrompt = typeof req.body.system_prompt === 'string' ? req.body.system_prompt : '';
  if (systemPrompt.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'system_prompt 不能为空' });
    return;
  }
  const row = updatePersona(ctx.tenantId, systemPrompt);
  if (!row) {
    res.status(500).json({ code: 500, data: null, message: '人设配置更新失败' });
    return;
  }
  res.json({ code: 0, data: toPersonaRead(row), message: 'ok' });
});

export default router;
