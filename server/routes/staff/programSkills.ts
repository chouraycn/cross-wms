/**
 * StaffDeck Program Skills Routes — 挂载 /api/staffdeck/program-skills
 *
 * 把「主程序的 skill 系统」接入数字员工：
 *   GET    /                  — 列出主程序已注册的全部技能（含原生可执行技能），供前端勾选
 *   POST   /sync              — 将主程序技能同步进数字员工工具目录（sd_tools，tool_type='skill'）
 *
 * 说明：
 *  - 主程序技能存放于全局单例 skillRegistry，经 toolExecutor 已被数字员工对话「间接可用」
 *    （全局 skill_<id> 工具）。本路由把这种可用性变成可管理、可开关、可同步进工具目录的能力。
 *  - 同步进 sd_tools 后，工具类型标记为 'skill'，执行时由 runStaffChatTurn 据启用状态
 *    通过 skillPermissionConfig 做 opt-in 门控（仅已启用的程序技能可被模型调用）。
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import { skillRegistry } from '../../engine/skillRegistry.js';
import * as toolDao from '../../dao/staff/staffToolDao.js';
import { logger } from '../../logger.js';

const router = Router();

function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || (req.body?.tenant_id as string) || DEFAULT_TENANT_ID;
}

/** 工具类型「程序技能」的目录分桶 */
const PROGRAM_SKILL_BUCKET = '程序技能';

function emptyObjectSchema(): Record<string, any> {
  return { type: 'object', properties: {}, required: [] };
}

// ===================== GET / — 列出主程序已注册技能 =====================

router.get('/', (_req: Request, res: Response) => {
  try {
    const skills = skillRegistry.getAllSkills();
    const data = skills.map((s) => ({
      id: s.definition.id,
      name: s.definition.name,
      description: s.definition.description ?? '',
      group: s.definition.group ?? '',
      source: s.definition.source ?? '',
      native: !!s.definition.native,
      enabled: s.state === 'enabled' || s.state === 'active' || s.state === 'idle',
      parameters:
        (s.definition.parameters as Record<string, any> | undefined) ?? emptyObjectSchema(),
    }));
    res.json({ code: 0, data, message: 'ok', implemented: true });
  } catch (err) {
    logger.error('[ProgramSkills] 列出程序技能失败:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ code: 500, data: null, message: '列出程序技能失败', implemented: true });
  }
});

// ===================== POST /sync — 同步到 sd_tools 目录 =====================

router.post('/sync', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  try {
    const skills = skillRegistry.getAllSkills();
    let imported = 0;
    let updated = 0;

    for (const s of skills) {
      const skillId = s.definition.id;
      const existing = toolDao.getToolByConfigSkillId(tenantId, skillId);
      const base = {
        name: `skill_${skillId}`,
        display_name: s.definition.name,
        description: s.definition.description ?? null,
        bucket: PROGRAM_SKILL_BUCKET,
        tool_type: 'skill',
        method: 'skill',
        url: '',
        headers: {},
        auth: {},
        config: { skillId },
        input_schema:
          (s.definition.parameters as Record<string, any> | undefined) ?? emptyObjectSchema(),
        output_schema: {},
        allowed_skills: [],
        mcp_server_id: null,
        mcp_tool_name: null,
        enabled: true,
      };
      if (existing) {
        toolDao.updateTool(tenantId, existing.id, base);
        updated += 1;
      } else {
        toolDao.createTool({ tenant_id: tenantId, ...base });
        imported += 1;
      }
    }

    res.json({
      code: 0,
      data: { implemented: true, success: true, imported, updated, total: skills.length },
      message: 'ok',
    });
  } catch (err) {
    logger.error('[ProgramSkills] 同步程序技能失败:', err instanceof Error ? err.message : String(err));
    res.status(500).json({
      code: 500,
      data: { implemented: true, success: false, error: err instanceof Error ? err.message : String(err) },
      message: '同步程序技能失败',
    });
  }
});

export default router;
