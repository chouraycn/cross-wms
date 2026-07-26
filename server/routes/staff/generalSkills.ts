/**
 * StaffDeck General Skills Routes — 挂载于 /api/staffdeck/general-skills
 *
 * 端点（11 个）：
 *   POST   /import           — 导入通用 skill（从 markdown / 包结构）
 *   POST   /import-skillhub  — 导入 SkillHub skill（stub）
 *   GET    /                 — 列出通用 skill
 *   GET    /:slug            — 获取通用 skill
 *   POST   /:slug/publish    — 发布
 *   POST   /:slug/archive    — 归档
 *   DELETE /:slug            — 删除
 *   POST   /:slug/run        — 同步运行
 *   POST   /:slug/run/stream — SSE 流式运行
 *   POST   /import-package   — 导入 .skill 包（stub）
 *   PUT    /:slug            — 更新通用 skill
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as gsDao from '../../dao/staff/staffGeneralSkillDao.js';
import { logger } from '../../logger.js';

const router = Router();

function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || (req.body?.tenant_id as string) || DEFAULT_TENANT_ID;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ===================== POST /import — 导入 =====================
router.post('/import', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { slug, name, description, homepage, skill_markdown, skill_files, metadata, status, permissions, runtime_config } = req.body ?? {};
  if (!skill_markdown || typeof skill_markdown !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'skill_markdown 不能为空' });
    return;
  }
  const finalSlug = (slug as string) || slugify(name || 'untitled');
  const finalName = (name as string) || finalSlug;
  // 唯一性校验
  if (gsDao.getGeneralSkillBySlug(tenantId, finalSlug)) {
    res.status(409).json({ code: 409, data: null, message: 'slug 已存在' });
    return;
  }
  try {
    const row = gsDao.createGeneralSkill({
      tenant_id: tenantId,
      slug: finalSlug,
      name: finalName,
      description: description ?? null,
      homepage: homepage ?? null,
      skill_markdown,
      skill_files: skill_files ?? [],
      metadata: metadata ?? {},
      status: status ?? 'draft',
      permissions: permissions ?? {},
      runtime_config: runtime_config ?? {},
    });
    res.status(201).json({ code: 0, data: gsDao.toGeneralSkillRead(row), message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// ===================== POST /import-package — stub =====================
router.post('/import-package', (_req: Request, res: Response) => {
  // TODO: 接入包解析
  res.json({
    code: 0,
    data: null,
    message: 'stub: 包导入尚未接入',
  });
});

// ===================== POST /import-skillhub — stub =====================
router.post('/import-skillhub', (_req: Request, res: Response) => {
  // TODO: 接入 SkillHub
  res.json({
    code: 0,
    data: null,
    message: 'stub: SkillHub 导入尚未接入',
  });
});

// ===================== GET / — 列出 =====================
router.get('/', (req: Request, res: Response) => {
  const filter: gsDao.GeneralSkillListFilter = {
    tenantId: tenantOf(req),
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
  };
  const rows = gsDao.listGeneralSkills(filter);
  res.json({ code: 0, data: rows.map(gsDao.toGeneralSkillRead), message: 'ok' });
});

// ===================== GET /:slug — 详情 =====================
router.get('/:slug', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = gsDao.getGeneralSkillBySlug(tenantId, req.params.slug);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '通用 skill 不存在' });
    return;
  }
  res.json({ code: 0, data: gsDao.toGeneralSkillRead(row), message: 'ok' });
});

// ===================== PUT /:slug — 更新 =====================
router.put('/:slug', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const patch: gsDao.GeneralSkillUpdateInput = {};
  if (typeof req.body.name === 'string') patch.name = req.body.name;
  if (req.body.description !== undefined) patch.description = req.body.description;
  if (req.body.homepage !== undefined) patch.homepage = req.body.homepage;
  if (typeof req.body.skill_markdown === 'string') patch.skill_markdown = req.body.skill_markdown;
  if (req.body.skill_files !== undefined) patch.skill_files = req.body.skill_files;
  if (req.body.metadata !== undefined) patch.metadata = req.body.metadata;
  if (typeof req.body.status === 'string') patch.status = req.body.status;
  if (req.body.permissions !== undefined) patch.permissions = req.body.permissions;
  if (req.body.runtime_config !== undefined) patch.runtime_config = req.body.runtime_config;
  const row = gsDao.updateGeneralSkill(tenantId, req.params.slug, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '通用 skill 不存在' });
    return;
  }
  res.json({ code: 0, data: gsDao.toGeneralSkillRead(row), message: 'ok' });
});

// ===================== POST /:slug/publish =====================
router.post('/:slug/publish', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = gsDao.updateGeneralSkill(tenantId, req.params.slug, { status: 'published' });
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '通用 skill 不存在' });
    return;
  }
  res.json({ code: 0, data: gsDao.toGeneralSkillRead(row), message: 'ok' });
});

// ===================== POST /:slug/archive =====================
router.post('/:slug/archive', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = gsDao.updateGeneralSkill(tenantId, req.params.slug, { status: 'archived' });
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '通用 skill 不存在' });
    return;
  }
  res.json({ code: 0, data: gsDao.toGeneralSkillRead(row), message: 'ok' });
});

// ===================== DELETE /:slug =====================
router.delete('/:slug', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ok = gsDao.deleteGeneralSkill(tenantId, req.params.slug);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '通用 skill 不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== POST /:slug/run — stub 同步运行 =====================
router.post('/:slug/run', (req: Request, res: Response) => {
  // TODO: 接入 GeneralSkillRunner
  const { input } = req.body ?? {};
  logger.debug('[StaffGS] run stub', { slug: req.params.slug });
  res.json({
    code: 0,
    data: { slug: req.params.slug, output: 'stub output', input, exit_code: 0 },
    message: 'stub: 通用 skill 运行尚未接入',
  });
});

// ===================== POST /:slug/run/stream — SSE stub =====================
router.post('/:slug/run/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // TODO: 接入 GeneralSkillRunner 流式
  res.write(`data: ${JSON.stringify({ type: 'run.start', data: { slug: req.params.slug } })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'done', data: { stub: true } })}\n\n`);
  res.end();
});

export default router;
