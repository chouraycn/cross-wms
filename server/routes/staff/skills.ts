/**
 * StaffDeck Skills Routes — 挂载于 /api/staffdeck/skills
 *
 * 端点（22 个）：
 *   GET    /                              — 列出 skills（?status=&business_domain=&search=）
 *   POST   /                              — 创建 skill
 *   GET    /:skillId                      — 获取 skill 详情
 *   PUT    /:skillId                      — 更新 skill
 *   DELETE /:skillId                      — 删除 skill
 *   POST   /:skillId/publish              — 发布 skill
 *   POST   /:skillId/archive              — 归档 skill
 *   POST   /:skillId/draft                — 转回 draft
 *   GET    /:skillId/versions             — 列出版本
 *   GET    /:skillId/versions/:version    — 获取特定版本
 *   DELETE /:skillId/versions/:version    — 删除特定版本
 *   POST   /:skillId/versions/:version/rollback — 回滚到指定版本
 *   POST   /files/extract                 — 提取 skill 文件（stub）
 *   POST   /distill                       — distill 生成 skill（stub）
 *   POST   /distill/stream                — SSE 流式 distill（stub）
 *   POST   /:skillId/rewrite/stream       — SSE 流式 rewrite（stub）
 *   POST   /distill/jobs                  — 创建 distill job（stub）
 *   POST   /:skillId/rewrite/jobs         — 创建 rewrite job（stub）
 *   GET    /jobs/:jobId                   — 获取 job 状态
 *   GET    /jobs/:jobId/stream            — SSE 流式获取 job 事件
 *   POST   /jobs/:jobId/cancel            — 取消 job
 *   POST   /:skillId/rewrite              — 同步 rewrite（stub）
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as skillDao from '../../dao/staff/staffSkillDao.js';
import type { SkillCreateInput } from '../../dao/staff/staffSkillDao.js';
import { logger } from '../../logger.js';

const router = Router();

function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || (req.body?.tenant_id as string) || DEFAULT_TENANT_ID;
}

// ===================== GET / — 列出 =====================
router.get('/', (req: Request, res: Response) => {
  const filter: skillDao.SkillListFilter = {
    tenantId: tenantOf(req),
    status: req.query.status as string | undefined,
    businessDomain: req.query.business_domain as string | undefined,
    search: req.query.search as string | undefined,
  };
  const rows = skillDao.listSkills(filter);
  res.json({ code: 0, data: rows.map(skillDao.toSkillRead), message: 'ok' });
});

// ===================== POST / — 创建 =====================
router.post('/', (req: Request, res: Response) => {
  const { name, business_domain, description, content, status, skill_id, version } = req.body;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'skill name 不能为空' });
    return;
  }
  const input: SkillCreateInput = {
    tenant_id: tenantOf(req),
    name: name.trim(),
    business_domain: business_domain ?? null,
    description: description ?? null,
    content: content ?? {},
    status: status ?? 'draft',
    skill_id,
    version,
  };
  try {
    const row = skillDao.createSkill(input);
    res.status(201).json({ code: 0, data: skillDao.toSkillRead(row), message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// ===================== POST /files/extract — stub =====================
router.post('/files/extract', (_req: Request, res: Response) => {
  // TODO: 接入实际服务
  res.json({
    code: 0,
    data: { files: [], markdown: '' },
    message: 'stub: skill 文件提取尚未接入',
  });
});

// ===================== POST /distill — stub =====================
router.post('/distill', (req: Request, res: Response) => {
  // TODO: 接入实际 SkillDistiller
  const { prompt } = req.body ?? {};
  logger.debug('[StaffSkill] distill stub called', { prompt });
  res.json({
    code: 0,
    data: { skill: { name: 'stub-skill', content: {} }, warnings: [] },
    message: 'stub: skill distill 尚未接入',
  });
});

// ===================== POST /distill/stream — SSE stub =====================
router.post('/distill/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // TODO: 接入实际 SkillDistiller
  res.write(`data: ${JSON.stringify({ type: 'distill.start', data: {} })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'done', data: { stub: true } })}\n\n`);
  res.end();
});

// ===================== POST /distill/jobs — stub =====================
router.post('/distill/jobs', (req: Request, res: Response) => {
  // TODO: 接入实际 stream_jobs
  const { prompt } = req.body ?? {};
  const jobId = `stub-distill-${Date.now()}`;
  logger.debug('[StaffSkill] distill job stub', { jobId, prompt });
  res.status(201).json({
    code: 0,
    data: { job_id: jobId, status: 'queued' },
    message: 'stub: distill job 尚未接入',
  });
});

// ===================== GET /jobs/:jobId — stub =====================
router.get('/jobs/:jobId', (req: Request, res: Response) => {
  // TODO: 接入 stream_jobs.getJob
  res.json({
    code: 0,
    data: { job_id: req.params.jobId, status: 'completed', events: [] },
    message: 'stub: job 状态查询尚未接入',
  });
});

// ===================== GET /jobs/:jobId/stream — SSE stub =====================
router.get('/jobs/:jobId/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // TODO: 接入 stream_jobs 事件流
  res.write(`data: ${JSON.stringify({ type: 'done', data: { job_id: req.params.jobId, stub: true } })}\n\n`);
  res.end();
});

// ===================== POST /jobs/:jobId/cancel — stub =====================
router.post('/jobs/:jobId/cancel', (req: Request, res: Response) => {
  // TODO: 接入 stream_jobs.cancel
  res.json({
    code: 0,
    data: { job_id: req.params.jobId, status: 'cancelled' },
    message: 'stub: job 取消尚未接入',
  });
});

// ===================== GET /:skillId — 详情 =====================
router.get('/:skillId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = skillDao.getSkillBySkillId(tenantId, req.params.skillId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
    return;
  }
  res.json({ code: 0, data: skillDao.toSkillRead(row), message: 'ok' });
});

// ===================== PUT /:skillId — 更新 =====================
router.put('/:skillId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const patch: skillDao.SkillUpdateInput = {};
  if (typeof req.body.name === 'string') patch.name = req.body.name;
  if (req.body.business_domain !== undefined) patch.business_domain = req.body.business_domain;
  if (req.body.description !== undefined) patch.description = req.body.description;
  if (req.body.content !== undefined) patch.content = req.body.content;
  if (typeof req.body.status === 'string') patch.status = req.body.status;
  if (typeof req.body.version === 'string') patch.version = req.body.version;
  const row = skillDao.updateSkill(tenantId, req.params.skillId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
    return;
  }
  res.json({ code: 0, data: skillDao.toSkillRead(row), message: 'ok' });
});

// ===================== DELETE /:skillId — 删除 =====================
router.delete('/:skillId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ok = skillDao.deleteSkill(tenantId, req.params.skillId);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== POST /:skillId/publish =====================
router.post('/:skillId/publish', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = skillDao.updateSkill(tenantId, req.params.skillId, { status: 'published' });
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
    return;
  }
  // 同步打版本快照
  skillDao.upsertSkillVersion({
    tenant_id: tenantId,
    skill_id: row.skill_id,
    version: row.version,
    name: row.name,
    business_domain: row.business_domain,
    description: row.description,
    content: JSON.parse(row.content_json || '{}'),
    status: row.status,
  });
  res.json({ code: 0, data: skillDao.toSkillRead(row), message: 'ok' });
});

// ===================== POST /:skillId/archive =====================
router.post('/:skillId/archive', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = skillDao.updateSkill(tenantId, req.params.skillId, { status: 'archived' });
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
    return;
  }
  res.json({ code: 0, data: skillDao.toSkillRead(row), message: 'ok' });
});

// ===================== POST /:skillId/draft =====================
router.post('/:skillId/draft', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = skillDao.updateSkill(tenantId, req.params.skillId, { status: 'draft' });
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
    return;
  }
  res.json({ code: 0, data: skillDao.toSkillRead(row), message: 'ok' });
});

// ===================== POST /:skillId/rewrite — stub =====================
router.post('/:skillId/rewrite', (req: Request, res: Response) => {
  // TODO: 接入 SkillEditor
  logger.debug('[StaffSkill] rewrite stub', { skillId: req.params.skillId });
  res.json({
    code: 0,
    data: { skill_id: req.params.skillId, content: {}, warnings: [] },
    message: 'stub: skill rewrite 尚未接入',
  });
});

// ===================== POST /:skillId/rewrite/jobs — stub =====================
router.post('/:skillId/rewrite/jobs', (req: Request, res: Response) => {
  // TODO: 接入 stream_jobs
  const jobId = `stub-rewrite-${Date.now()}`;
  logger.debug('[StaffSkill] rewrite job stub', { jobId, skillId: req.params.skillId });
  res.status(201).json({
    code: 0,
    data: { job_id: jobId, status: 'queued' },
    message: 'stub: rewrite job 尚未接入',
  });
});

// ===================== POST /:skillId/rewrite/stream — SSE stub =====================
router.post('/:skillId/rewrite/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // TODO: 接入 SkillEditor 流式
  res.write(`data: ${JSON.stringify({ type: 'rewrite.start', data: { skill_id: req.params.skillId } })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'done', data: { stub: true } })}\n\n`);
  res.end();
});

// ===================== GET /:skillId/versions — 列出版本 =====================
router.get('/:skillId/versions', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = skillDao.listSkillVersions(tenantId, req.params.skillId);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== GET /:skillId/versions/:version — 获取版本 =====================
router.get('/:skillId/versions/:version', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = skillDao.getSkillVersion(tenantId, req.params.skillId, req.params.version);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '版本不存在' });
    return;
  }
  res.json({ code: 0, data: row, message: 'ok' });
});

// ===================== DELETE /:skillId/versions/:version — 删除版本 =====================
router.delete('/:skillId/versions/:version', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ok = skillDao.deleteSkillVersion(tenantId, req.params.skillId, req.params.version);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '版本不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== POST /:skillId/versions/:version/rollback — 回滚 =====================
router.post('/:skillId/versions/:version/rollback', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = skillDao.rollbackSkillToVersion(tenantId, req.params.skillId, req.params.version);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '版本不存在' });
    return;
  }
  res.json({ code: 0, data: skillDao.toSkillRead(row), message: 'ok' });
});

export default router;
