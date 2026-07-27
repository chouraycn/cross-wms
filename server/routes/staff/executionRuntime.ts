/**
 * StaffDeck 执行链路状态 — 挂载 /api/staffdeck/execution-runtime
 *
 * 返回「通用技能」与「员工 MCP」是否已接入员工执行链路，作为前端状态提示的
 * 单一事实来源。判定条件与 staffChatExecutor 在真实 LLM 路径内的装配逻辑保持一致：
 *
 *   - 通用技能：published 且 skill_markdown 非空 → 物化进执行链路
 *     （见 server/staff/staffGeneralSkillMaterializer.ts）
 *   - 员工 MCP：enabled===1 → 执行时接入隔离的 staff MCP manager
 *     （见 server/staff/staffMcpClientManager.ts 的 buildStaffMcpManager）
 *
 * 说明：connected 表示「配置已激活、将在员工会话中接入执行链路」。员工 MCP 不做
 * 真实连接探测（那是「发现并同步工具」按钮的职责），避免页面加载触发远端握手。
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as generalSkillDao from '../../dao/staff/staffGeneralSkillDao.js';
import * as mcpServerDao from '../../dao/staff/staffMcpServerDao.js';

const router = Router();

/** 计算执行链路接入状态（通用技能 + 员工 MCP），作为前端状态提示的单一事实来源 */
export function buildExecutionRuntimeData(tenantId: string) {
  // 1) 通用技能：与 materializeGeneralSkills 完全一致的过滤条件
  const skillRows = generalSkillDao
    .listGeneralSkills({ tenantId, status: 'published' })
    .filter((r) => (r.skill_markdown || '').trim().length > 0);
  const generalSkills: Record<string, boolean> = {};
  for (const row of skillRows) {
    generalSkills[row.slug] = true;
  }

  // 2) 员工 MCP：与 buildStaffMcpManager 一致的接入前置条件（enabled===1）
  const mcpRows = mcpServerDao.listMcpServers(tenantId);
  const mcpServers = mcpRows.map((row) => {
    const enabled = row.enabled === 1;
    return {
      id: row.id,
      name: row.name,
      enabled,
      connected: enabled,
    };
  });

  return { generalSkills, mcpServers };
}

router.get('/', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  res.json({
    code: 0,
    data: buildExecutionRuntimeData(tenantId),
    message: 'ok',
  });
});

export default router;
