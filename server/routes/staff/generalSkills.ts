/**
 * StaffDeck General Skills Routes — 挂载于 /api/staffdeck/general-skills
 *
 * 端点（11 个）：
 *   POST   /import           — 导入通用 skill（从 markdown / 包结构）
 *   POST   /import-skillhub  — 导入 SkillHub / ClawHub 技能（真实：抓取 source 或解析内联 markdown → 创建 draft）
 *   GET    /                 — 列出通用 skill
 *   GET    /:slug            — 获取通用 skill
 *   POST   /:slug/publish    — 发布
 *   POST   /:slug/archive    — 归档
 *   DELETE /:slug            — 删除
 *   POST   /:slug/run        — 同步运行
 *   POST   /:slug/run/stream — SSE 流式运行
 *   POST   /import-package   — 导入 .skill 包（真实：接受包结构 → 创建 draft 并写入 skill_files）
 *   PUT    /:slug            — 更新通用 skill
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as gsDao from '../../dao/staff/staffGeneralSkillDao.js';
import { materializeGeneralSkills } from '../../staff/staffGeneralSkillMaterializer.js';
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

// ===================== 导入辅助 =====================
/**
 * 解析技能来源：
 * - http(s) URL → 带超时的网络抓取（AbortController，默认 8s）
 * - 其他 → 按原始 markdown 文本处理
 */
async function fetchSkillSource(source: string, timeoutMs = 8000): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(source, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CrossWMS-StaffDeck/1.0' },
      });
      if (!resp.ok) throw new Error(`抓取失败 HTTP ${resp.status}`);
      return await resp.text();
    } finally {
      clearTimeout(timer);
    }
  }
  return source;
}

/** 从来源推导技能名称（显式 name > markdown 首个 # 标题 > URL 末段路径） */
function deriveSkillName(source: string, explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim();
  const heading = source.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  const urlMatch = source.match(/^https?:\/\/[^/]+\/(.+?)\/?$/i);
  if (urlMatch) {
    const last = decodeURIComponent(urlMatch[1].replace(/\/$/, '').split('/').pop() || 'imported-skill');
    return last.replace(/\.(md|markdown|txt)$/i, '');
  }
  return 'imported-skill';
}

// ===================== POST /import-package — 导入 .skill 包 =====================
router.post('/import-package', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const {
    name,
    slug,
    description,
    homepage,
    skill_markdown,
    skill_files,
    metadata,
    permissions,
    runtime_config,
  } = req.body ?? {};
  const files: Array<{ path: string; content: string }> = Array.isArray(skill_files) ? skill_files : [];
  const markdown: string =
    typeof skill_markdown === 'string' && skill_markdown.trim()
      ? skill_markdown
      : files.map((f) => `# ${f.path}\n\n${f.content}`).join('\n\n---\n\n');
  if (!markdown.trim()) {
    res.status(400).json({ code: 400, data: null, message: 'skill_markdown 或 skill_files 至少一项必填' });
    return;
  }
  const finalName = typeof name === 'string' && name.trim() ? name.trim() : 'imported-package';
  const finalSlug = typeof slug === 'string' && slug.trim() ? slug.trim() : slugify(finalName);
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
      skill_markdown: markdown,
      skill_files: files,
      metadata: metadata && typeof metadata === 'object' ? metadata : { imported_from: 'package' },
      status: 'draft',
      permissions: permissions ?? {},
      runtime_config: runtime_config ?? {},
    });
    res.status(201).json({ code: 0, data: { implemented: true, imported: true, skill: gsDao.toGeneralSkillRead(row) }, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: { implemented: true, imported: false }, message: (e as Error).message });
  }
});

// ===================== POST /import-skillhub — 导入 SkillHub / ClawHub 技能 =====================
router.post('/import-skillhub', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { source, name, description, homepage, slug, metadata, permissions, runtime_config } = req.body ?? {};
  if (!source || typeof source !== 'string' || !source.trim()) {
    res.status(400).json({ code: 400, data: null, message: 'source（技能 URL 或 markdown 文本）必填' });
    return;
  }
  try {
    const raw = await fetchSkillSource(source.trim());
    if (!raw.trim()) {
      res.status(200).json({ code: 0, data: { implemented: true, imported: false, error: '抓取到的技能内容为空' }, message: '抓取到的技能内容为空' });
      return;
    }
    const finalName = deriveSkillName(source, name);
    const finalSlug = typeof slug === 'string' && slug.trim() ? slug.trim() : slugify(finalName);
    if (gsDao.getGeneralSkillBySlug(tenantId, finalSlug)) {
      res.status(409).json({ code: 409, data: null, message: 'slug 已存在' });
      return;
    }
    const isUrl = source.trim().startsWith('http');
    const row = gsDao.createGeneralSkill({
      tenant_id: tenantId,
      slug: finalSlug,
      name: finalName,
      description: description ?? null,
      homepage: homepage ?? (isUrl ? source.trim() : null),
      skill_markdown: raw,
      skill_files: [],
      metadata:
        metadata && typeof metadata === 'object'
          ? metadata
          : { imported_from: isUrl ? 'skillhub' : 'inline', source: isUrl ? source.trim() : null },
      status: 'draft',
      permissions: permissions ?? {},
      runtime_config: runtime_config ?? {},
    });
    res.status(201).json({ code: 0, data: { implemented: true, imported: true, skill: gsDao.toGeneralSkillRead(row) }, message: 'ok' });
  } catch (e) {
    res.status(200).json({ code: 0, data: { implemented: true, imported: false, error: (e as Error).message }, message: '导入失败：' + (e as Error).message });
  }
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

// ===================== 真实执行辅助 =====================
/**
 * 物化并执行某个通用技能（指令型，确定性，无 LLM 调用）。
 * 仅 `published` 且 markdown 非空的技能会被物化；草稿/未发布无法运行。
 */
async function runGeneralSkill(tenantId: string, slug: string, userQuery: string, params: Record<string, unknown>) {
  const { definitions, executor } = materializeGeneralSkills(tenantId);
  const def = definitions.find((d) => d.id === `staff-${tenantId}-${slug}`);
  if (!def) {
    return {
      slug,
      implemented: true,
      success: false,
      error: '技能未发布或无可执行指令（需 published 且技能文档非空）',
      output: null,
    };
  }
  const result = await executor(def.id, { query: userQuery, ...params });
  return {
    slug,
    implemented: true,
    success: result.success,
    error: result.error ?? null,
    output: result.data ?? null,
  };
}

// ===================== POST /:slug/run — 同步运行 =====================
router.post('/:slug/run', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { input, query, params } = req.body ?? {};
  const userQuery = typeof query === 'string' && query.trim() ? query : (typeof input === 'string' ? input : '');
  try {
    const data = await runGeneralSkill(tenantId, req.params.slug, userQuery, params ?? {});
    res.json({ code: 0, data, message: data.success ? 'ok' : (data.error || '运行失败') });
  } catch (e) {
    res.json({ code: 0, data: { slug: req.params.slug, implemented: true, success: false, error: (e as Error).message }, message: (e as Error).message });
  }
});

// ===================== POST /:slug/run/stream — SSE 流式运行 =====================
router.post('/:slug/run/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const tenantId = tenantOf(req);
  const { input, query, params } = req.body ?? {};
  const userQuery = typeof query === 'string' && query.trim() ? query : (typeof input === 'string' ? input : '');
  try {
    const data = await runGeneralSkill(tenantId, req.params.slug, userQuery, params ?? {});
    res.write(`data: ${JSON.stringify({ type: 'run.start', data: { slug: req.params.slug, implemented: true } })}\n\n`);
    if (!data.success) {
      res.write(`data: ${JSON.stringify({ type: 'error', data: { message: data.error } })}\n\n`);
    } else {
      const instructions = ((data.output as { instructions?: string[] } | null | undefined)?.instructions) || [];
      res.write(
        `data: ${JSON.stringify({ type: 'trace', data: { phase: 'instruction_generated', message: '已生成技能指令', code: instructions.join('\n\n') } })}\n\n`,
      );
      res.write(`data: ${JSON.stringify({ type: 'complete', data })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done', data: { implemented: true, message: 'ok' } })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', data: { message: (e as Error).message } })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
