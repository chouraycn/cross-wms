/**
 * StaffDeck Agents Routes — 挂载于 /api/staffdeck/agents
 *
 * 提供 enterprise 与 chat 两套子路由（统一在 /api/staffdeck/agents 下）。
 * 端点：
 *   GET    /                      — 列出当前租户下所有 Agent
 *   POST   /                      — 创建 Agent
 *   GET    /:agentId              — 获取 Agent 详情
 *   PUT    /:agentId              — 更新 Agent
 *   DELETE /:agentId              — 删除 Agent
 *   GET    /:agentId/models       — 列出模型绑定
 *   PUT    /:agentId/models       — 批量更新模型绑定
 *   GET    /:agentId/resources    — 列出资源绑定（?resource_type=）
 *   POST   /:agentId/resources    — 添加资源绑定
 *   DELETE /:agentId/resources    — 移除资源绑定
 *   GET    /:agentId/skill-branches    — 列出 Agent 的 Skill Branches
 *   GET    /:agentId/knowledge-branches — 列出 Agent 的 Knowledge Branches
 *   GET    /overall               — 获取 overall agent
 *
 * 注：chat 子路由前缀（/api/chat/agents）已在 cross-wms 既有路由中占用，
 *     因此 chat 相关端点统一通过 /api/staffdeck/agents 提供。
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as agentDao from '../../dao/staff/staffAgentDao.js';
import * as skillDao from '../../dao/staff/staffSkillDao.js';
import * as kbDao from '../../dao/staff/staffKnowledgeBaseDao.js';
import type { AgentProfileInput } from '../../types/staff.js';

const router = Router();

function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
}

// ===================== GET / — 列出 Agent =====================
router.get('/', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = agentDao.listAgents(tenantId);
  // 一次查出全租户资源绑定后分组复用，避免 N+1；
  // 也不能写成 rows.map(agentDao.toAgentRead)，否则 index 会被当作 resources 传入。
  const read = agentDao.buildAgentReader(tenantId);
  res.json({
    code: 0,
    data: rows.map((row) => read(row)),
    message: 'ok',
  });
});

// ===================== GET /overall — 获取 overall agent =====================
router.get('/overall', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = agentDao.getOverallAgent(tenantId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'overall agent 不存在' });
    return;
  }
  res.json({ code: 0, data: agentDao.buildAgentReader(tenantId)(row), message: 'ok' });
});

// ===================== POST / — 创建 Agent =====================
router.post('/', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || DEFAULT_TENANT_ID;
  const { name, description, persona_prompt, is_overall, status, metadata } = req.body;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'Agent 名称不能为空' });
    return;
  }
  // 唯一性校验
  const all = agentDao.listAgents(tenantId);
  if (all.find((a) => a.name === name.trim())) {
    res.status(409).json({ code: 409, data: null, message: 'Agent 名称已存在' });
    return;
  }
  const input: AgentProfileInput = {
    tenant_id: tenantId,
    name: name.trim(),
    description: description ?? null,
    persona_prompt: persona_prompt ?? null,
    is_overall: !!is_overall,
    status: status ?? 'active',
    metadata: metadata ?? {},
  };
  try {
    const row = agentDao.createAgent(input);
    res.status(201).json({ code: 0, data: agentDao.toAgentRead(row), message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// ===================== GET /:agentId — 获取详情 =====================
router.get('/:agentId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = agentDao.getAgentById(tenantId, req.params.agentId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'Agent 不存在' });
    return;
  }
  res.json({ code: 0, data: agentDao.buildAgentReader(tenantId)(row), message: 'ok' });
});

// ===================== PUT /:agentId — 更新 =====================
router.put('/:agentId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const patch: Partial<AgentProfileInput> = {};
  if (typeof req.body.name === 'string') patch.name = req.body.name;
  if (req.body.description !== undefined) patch.description = req.body.description;
  if (req.body.persona_prompt !== undefined) patch.persona_prompt = req.body.persona_prompt;
  if (req.body.is_overall !== undefined) patch.is_overall = !!req.body.is_overall;
  if (typeof req.body.status === 'string') patch.status = req.body.status;
  if (req.body.metadata !== undefined) patch.metadata = req.body.metadata;
  const row = agentDao.updateAgent(tenantId, req.params.agentId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'Agent 不存在' });
    return;
  }
  res.json({ code: 0, data: agentDao.buildAgentReader(tenantId)(row), message: 'ok' });
});

// ===================== DELETE /:agentId — 删除 =====================
router.delete('/:agentId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ok = agentDao.deleteAgent(tenantId, req.params.agentId);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: 'Agent 不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== GET /:agentId/models — 列出模型绑定 =====================
router.get('/:agentId/models', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = agentDao.listAgentModelBindings(tenantId, req.params.agentId);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== PUT /:agentId/models — 批量更新模型绑定 =====================
router.put('/:agentId/models', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindings = req.body.bindings as Array<{ role: string; model_config_id: string }> | undefined;
  if (!Array.isArray(bindings)) {
    res.status(400).json({ code: 400, data: null, message: 'bindings 必须是数组' });
    return;
  }
  const results = bindings.map((b) =>
    agentDao.upsertAgentModelBinding(tenantId, req.params.agentId, b.role, b.model_config_id),
  );
  res.json({ code: 0, data: results, message: 'ok' });
});

// ===================== GET /:agentId/resources — 列出资源绑定 =====================
router.get('/:agentId/resources', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const resourceType = req.query.resource_type as string | undefined;
  const rows = agentDao.listAgentResourceBindings(tenantId, req.params.agentId, resourceType);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== POST /:agentId/resources — 添加资源绑定 =====================
router.post('/:agentId/resources', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { resource_type, resource_id, metadata, status } = req.body;
  if (!resource_type || !resource_id) {
    res.status(400).json({ code: 400, data: null, message: 'resource_type 和 resource_id 必填' });
    return;
  }
  const row = agentDao.upsertAgentResourceBinding(
    tenantId,
    req.params.agentId,
    resource_type,
    resource_id,
    metadata ?? {},
    status ?? 'active',
  );
  res.status(201).json({ code: 0, data: row, message: 'ok' });
});

// ===================== DELETE /:agentId/resources — 移除资源绑定 =====================
router.delete('/:agentId/resources', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const resource_type = req.query.resource_type as string | undefined;
  const resource_id = req.query.resource_id as string | undefined;
  if (!resource_type || !resource_id) {
    res.status(400).json({ code: 400, data: null, message: 'resource_type 和 resource_id 必填' });
    return;
  }
  const ok = agentDao.deleteAgentResourceBinding(
    tenantId,
    req.params.agentId,
    resource_type,
    resource_id,
  );
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '资源绑定不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== GET /:agentId/skill-branches =====================
router.get('/:agentId/skill-branches', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = skillDao.listAgentSkillBranches(tenantId, req.params.agentId);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== POST /:agentId/skills/:skillId/sync-from-overall =====================
router.post('/:agentId/skills/:skillId/sync-from-overall', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  try {
    const row = skillDao.syncAgentSkillBranchFromOverall(tenantId, req.params.agentId, req.params.skillId);
    res.json({ code: 0, data: row, message: 'ok' });
  } catch (e) {
    res.status(404).json({ code: 404, data: null, message: (e as Error).message });
  }
});

// ===================== POST /:agentId/skills/:skillId/promote-to-overall =====================
router.post('/:agentId/skills/:skillId/promote-to-overall', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = skillDao.promoteAgentSkillBranchToOverall(tenantId, req.params.agentId, req.params.skillId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '分支不存在' });
    return;
  }
  const read = skillDao.buildSkillReader(tenantId, req.params.agentId);
  res.json({ code: 0, data: read(row), message: 'ok' });
});

// ===================== POST /:agentId/skills/:skillId/rollback =====================
router.post('/:agentId/skills/:skillId/rollback', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { version } = req.body ?? {};
  if (!version || typeof version !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'version 必填' });
    return;
  }
  const row = skillDao.rollbackAgentSkillBranch(tenantId, req.params.agentId, req.params.skillId, version);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '版本不存在' });
    return;
  }
  res.json({ code: 0, data: row, message: 'ok' });
});

// ===================== GET /:agentId/skills/:skillId/versions =====================
router.get('/:agentId/skills/:skillId/versions', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = skillDao.listAgentSkillBranchVersions(tenantId, req.params.agentId, req.params.skillId);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== GET /:agentId/skills =====================
// 开放广场（OpenPlatformPage）按 overall agent 拉取技能总览，期望 SkillRead[]。
// 返回该租户下全部技能（overall agent 拥有企业全部技能；非 overall 降级返回全部，避免空列表）
router.get('/:agentId/skills', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = skillDao.listSkills({ tenantId });
  // 带 agentId 构造 reader，可同时注入该员工的技能分支元信息（branch_status/sync_state 等）。
  // 不能写成 rows.map(skillDao.toSkillRead)，否则数组 index 会被当作 ctx 传入。
  const read = skillDao.buildSkillReader(tenantId, req.params.agentId);
  res.json({ code: 0, data: rows.map((row) => read(row)), message: 'ok' });
});

// ===================== GET /:agentId/knowledge-branches =====================
router.get('/:agentId/knowledge-branches', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = kbDao.listAgentKnowledgeBranches(tenantId, req.params.agentId);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== POST /:agentId/resources/import — 跨 Agent 批量导入资源 =====================
router.post('/:agentId/resources/import', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const targetAgentId = req.params.agentId;
  const { source_agent_id, resource_types, skill_ids, knowledge_base_ids } = req.body ?? {};
  if (!source_agent_id || typeof source_agent_id !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'source_agent_id 必填' });
    return;
  }
  const types: string[] = Array.isArray(resource_types) ? resource_types : ['skill', 'knowledge_base'];
  const result: { skills: number; knowledge_bases: number } = { skills: 0, knowledge_bases: 0 };
  try {
    if (types.includes('skill')) {
      result.skills = skillDao.importSkillBranchesIntoAgent(
        tenantId,
        targetAgentId,
        { agentId: source_agent_id },
        Array.isArray(skill_ids) ? skill_ids : undefined,
      ).imported;
    }
    if (types.includes('knowledge_base')) {
      result.knowledge_bases = kbDao.importKnowledgeBranchesIntoAgent(
        tenantId,
        targetAgentId,
        { agentId: source_agent_id },
        Array.isArray(knowledge_base_ids) ? knowledge_base_ids : undefined,
      ).imported;
    }
    res.json({ code: 0, data: result, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// ===================== GET /:agentId/work-record =====================
// DashboardPage 拉取员工工作记录（对话回复统计 + 活动时间线）
router.get('/:agentId/work-record', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const data = agentDao.getAgentWorkRecord(tenantId, req.params.agentId);
  res.json({ code: 0, data, message: 'ok' });
});

export default router;
