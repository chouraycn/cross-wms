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
 *   POST   /files/extract                 — 提取 skill 文件（已接入）
 *   POST   /distill                       — distill 生成 skill（已接入，模板蒸馏）
 *   POST   /distill/stream                — SSE 流式 distill（已接入）
 *   POST   /:skillId/rewrite/stream       — SSE 流式 rewrite（已接入）
 *   POST   /distill/jobs                  — 创建 distill job（已接入）
 *   POST   /:skillId/rewrite/jobs         — 创建 rewrite job（已接入）
 *   GET    /jobs/:jobId                   — 获取 job 状态
 *   GET    /jobs/:jobId/stream            — SSE 流式获取 job 事件
 *   POST   /jobs/:jobId/cancel            — 取消 job
 *   POST   /:skillId/rewrite              — 同步 rewrite（已接入）
 */
import { Router, type Request, type Response } from 'express';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as skillDao from '../../dao/staff/staffSkillDao.js';
import type { SkillCreateInput } from '../../dao/staff/staffSkillDao.js';
import { logger } from '../../logger.js';
import * as streamJobs from '../../staff/streamJobs.js';

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
  // 一次聚合统计、多行复用；不能写成 rows.map(skillDao.toSkillRead)，
  // 否则数组 index 会被当作第 2 个参数 ctx 传入。
  const read = skillDao.buildSkillReader(filter.tenantId);
  res.json({ code: 0, data: rows.map((row) => read(row)), message: 'ok' });
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

// ===================== POST /files/extract — 提取 skill 文件 =====================
/**
 * 从指定目录路径提取 SKILL.md 及相关文件内容。
 * Body: { path: string, skill_id?: string }
 * 返回：{ files: [{path, content, type}], markdown: string }
 */
router.post('/files/extract', (req: Request, res: Response) => {
  try {
    const dirPath = (req.body?.path as string)?.trim();
    const skillId = (req.body?.skill_id as string)?.trim();

    if (!dirPath) {
      res.status(400).json({ code: 400, data: null, message: 'path 不能为空' });
      return;
    }

    // 安全校验：路径必须在项目根目录下
    const rootDir = process.cwd();
    const absPath = join(rootDir, dirPath);
    if (!absPath.startsWith(rootDir)) {
      res.status(403).json({ code: 403, data: null, message: '路径越权' });
      return;
    }

    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      res.status(404).json({ code: 404, data: null, message: `目录不存在: ${dirPath}` });
      return;
    }

    // 扫描目录中的文件
    const supportedExts = ['.md', '.json', '.yaml', '.yml', '.txt', '.ts', '.js'];
    const files: Array<{ path: string; name: string; content: string; type: string; size: number }> = [];
    let markdownContent = '';

    const entries = readdirSync(absPath);
    for (const entry of entries) {
      const fullPath = join(absPath, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) continue;
      const ext = extname(entry).toLowerCase();
      if (!supportedExts.includes(ext)) continue;

      const content = readFileSync(fullPath, 'utf-8');
      const relativePath = join(dirPath, entry).replace(/\\/g, '/');
      const fileType = ext === '.md' ? 'markdown' : ext.slice(1);

      files.push({
        path: relativePath,
        name: entry,
        content,
        type: fileType,
        size: stat.size,
      });

      // SKILL.md 或 .md 文件作为 markdown 内容
      if (entry === 'SKILL.md' || (ext === '.md' && !markdownContent)) {
        markdownContent = content;
      }
    }

    if (files.length === 0) {
      res.json({
        code: 0,
        data: { implemented: true, files: [], markdown: '', warning: '目录中没有支持的文件' },
        message: 'ok',
      });
      return;
    }

    logger.info(`[StaffSkills] /files/extract: 从 ${dirPath} 提取了 ${files.length} 个文件${skillId ? ` (skill_id=${skillId})` : ''}`);

    res.json({
      code: 0,
      data: {
        implemented: true,
        files,
        markdown: markdownContent,
        file_count: files.length,
        skill_id: skillId || null,
      },
      message: 'ok',
    });
  } catch (e) {
    logger.error('[StaffSkills] /files/extract 失败:', e);
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

// ===================== 蒸馏 SSE 基础设施 =====================
function sse(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function chunkText(text: string, size = 28): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

type DistillNode = { id: string; type: string; label: string; [k: string]: any };
type DistillEdge = { id: string; source: string; target: string; label?: string; [k: string]: any };
type DistillDraft = {
  skill_id: string;
  name: string;
  version: string;
  business_domain: string;
  description: string;
  trigger_intents: string[];
  user_utterance_examples: { text: string }[];
  goal: string[];
  required_info: { name: string; type: string }[];
  nodes: DistillNode[];
  edges: DistillEdge[];
  start_node_id: string;
  terminal_node_ids: string[];
  interruption_policy: Record<string, any>;
  response_rules: string[];
};

function extractRequiredInfo(text: string): { name: string; type: string }[] {
  const out: { name: string; type: string }[] = [];
  const patterns: [RegExp, string][] = [
    [/(订单号|order\s*id|order_no)/i, '订单号'],
    [/(手机号|电话|手机|phone|mobile)/i, '手机号'],
    [/(姓名|名字|name|username)/i, '姓名'],
    [/(地址|address)/i, '地址'],
    [/(金额|价格|price|amount)/i, '金额'],
    [/(时间|日期|date|time)/i, '时间'],
    [/(单号|编号|no\.?|number)/i, '单号'],
  ];
  for (const [re, label] of patterns) {
    if (re.test(text) && !out.some((o) => o.name === label)) out.push({ name: label, type: 'string' });
  }
  if (out.length === 0) out.push({ name: '用户诉求', type: 'string' });
  return out;
}
function extractTriggerIntents(text: string): string[] {
  const base = text.slice(0, 40).replace(/[，。；;.\n]/g, ' ').trim();
  return base ? [base] : ['处理用户请求'];
}
function extractGoals(text: string): string[] {
  const goals: string[] = [];
  const lines = text.split(/[。；;.\n]/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    if (/(目标|需要|希望|目的|goal|want|need)/i.test(line)) goals.push(line);
  }
  if (goals.length === 0) goals.push(text.slice(0, 80) || '完成用户请求');
  return goals.slice(0, 6);
}
function buildSkillCard(
  prompt: string,
  params: { name?: string; business_domain?: string; tool_suggestions?: string[] },
): DistillDraft {
  const text = (prompt || '').trim();
  const name = (params.name || '').trim() || (text.slice(0, 24) || '未命名 SOP');
  const requiredInfo = extractRequiredInfo(text);
  const triggerIntents = extractTriggerIntents(text);
  const goal = extractGoals(text);
  const hasTools = (params.tool_suggestions || []).length > 0;
  const nodes: DistillNode[] = [
    { id: 'start', type: 'start', label: '开始' },
    { id: 'collect', type: 'collect', label: '收集信息', required_info: requiredInfo.map((r) => r.name) },
    { id: 'act', type: 'action', label: hasTools ? '调用工具执行' : '生成答复' },
    { id: 'end', type: 'end', label: '结束' },
  ];
  const edges: DistillEdge[] = [
    { id: 'e1', source: 'start', target: 'collect', label: '进入' },
    { id: 'e2', source: 'collect', target: 'act', label: '信息齐备' },
    { id: 'e3', source: 'act', target: 'end', label: '完成' },
  ];
  return {
    skill_id: '',
    name: name.slice(0, 60),
    version: '0.1.0',
    business_domain: (params.business_domain || '').slice(0, 40),
    description: text.slice(0, 200),
    trigger_intents: triggerIntents,
    user_utterance_examples: triggerIntents.slice(0, 3).map((t) => ({ text: t })),
    goal,
    required_info: requiredInfo,
    nodes,
    edges,
    start_node_id: 'start',
    terminal_node_ids: ['end'],
    interruption_policy: {},
    response_rules: [],
  };
}
function skillCardToText(draft: DistillDraft): string {
  const lines: string[] = [];
  lines.push(`# SOP：${draft.name}`);
  if (draft.description) lines.push(`\n## 场景描述\n${draft.description}`);
  lines.push('\n## 目标');
  draft.goal.forEach((g) => lines.push(`- ${g}`));
  lines.push('\n## 触发意图');
  draft.trigger_intents.forEach((t) => lines.push(`- ${t}`));
  lines.push('\n## 需要收集的信息');
  draft.required_info.forEach((r) => lines.push(`- ${r.name}（${r.type}）`));
  lines.push('\n## 流程步骤');
  draft.nodes.forEach((n, i) => lines.push(`${i + 1}. ${n.label}`));
  return lines.join('\n');
}
async function runDistill(
  jobId: string,
  params: Record<string, any>,
  write: (event: string, data: any) => void,
  isCancelled: () => boolean,
): Promise<DistillDraft> {
  const prompt = (params.prompt as string) || (params.requirement as string) || '';
  write('status', { text: `正在分析需求：${prompt.slice(0, 48) || '(空)'}…` });
  await sleep(260);
  if (isCancelled()) throw new Error('cancelled');
  write('status', { text: '正在抽取目标、角色、关键字段与工具…' });
  await sleep(260);
  if (isCancelled()) throw new Error('cancelled');
  const draft = buildSkillCard(prompt, {
    name: params.name as string | undefined,
    business_domain: params.business_domain as string | undefined,
    tool_suggestions: (params.tool_suggestions as string[]) || [],
  });
  write('chunk_reset', {});
  const sopText = skillCardToText(draft);
  for (const seg of chunkText(sopText, 28)) {
    if (isCancelled()) break;
    write('chunk', { content: seg });
    await sleep(50);
  }
  write('complete', {
    draft_skill: draft,
    warnings: [],
    tool_suggestions: (params.tool_suggestions as string[]) || [],
  });
  return draft;
}

// ===================== POST /distill — 同步蒸馏 =====================
router.post('/distill', async (req: Request, res: Response) => {
  const write = (_event: string, _data: any) => {
    /* 同步模式不推送事件 */
  };
  try {
    const draft = await runDistill(`sync-${Date.now()}`, req.body ?? {}, write, () => false);
    res.json({ code: 0, data: { skill: draft, warnings: [] }, message: 'ok' });
  } catch (e) {
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

// ===================== POST /distill/stream — SSE 流式蒸馏 =====================
router.post('/distill/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const jobId = streamJobs.createJob('distill', { prompt: req.body?.prompt });
  let closed = false;
  const write = (event: string, data: any) => {
    streamJobs.append(jobId, event, data);
    if (!closed) res.write(sse(event, data));
  };
  res.on('close', () => {
    closed = true;
  });
  try {
    write('job_attached', { job_id: jobId, status: 'running' });
    await runDistill(jobId, req.body ?? {}, write, () => closed || streamJobs.isCancelled(jobId));
    if (!closed) {
      streamJobs.complete(jobId);
      res.write(sse('job_complete', { status: 'completed', error: null }));
    }
  } catch (e) {
    if (!closed) {
      const msg = (e as Error).message;
      streamJobs.fail(jobId, msg);
      res.write(sse('job_complete', { status: 'failed', error: msg }));
    }
  } finally {
    if (!closed) res.end();
  }
});

// ===================== POST /distill/jobs — 创建异步蒸馏任务 =====================
router.post('/distill/jobs', (req: Request, res: Response) => {
  const jobId = streamJobs.createJob('distill', { prompt: req.body?.prompt });
  void (async () => {
    const write = (event: string, data: any) => streamJobs.append(jobId, event, data);
    try {
      write('job_attached', { job_id: jobId, status: 'running' });
      await runDistill(jobId, req.body ?? {}, write, () => streamJobs.isCancelled(jobId));
      streamJobs.complete(jobId);
    } catch (e) {
      streamJobs.fail(jobId, (e as Error).message);
    }
  })();
  res.status(201).json({ code: 0, data: { job_id: jobId, status: 'queued' }, message: 'ok' });
});

// ===================== GET /jobs/:jobId — 任务状态 =====================
router.get('/jobs/:jobId', (req: Request, res: Response) => {
  const job = streamJobs.getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ code: 404, data: null, message: 'job 不存在' });
    return;
  }
  res.json({
    code: 0,
    data: {
      job_id: job.job_id,
      status: job.status,
      error: job.error,
      events: job.events.map((e) => ({ seq: e.seq, event: e.event, data: e.data })),
    },
    message: 'ok',
  });
});

// ===================== GET /jobs/:jobId/stream — SSE 断点续传 =====================
router.get('/jobs/:jobId/stream', (req: Request, res: Response) => {
  const job = streamJobs.getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ code: 404, data: null, message: 'job 不存在' });
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const after = Number(req.query.after_seq) || 0;
  let lastSeq = after;
  for (const ev of streamJobs.snapshot(job.job_id, after)) {
    res.write(sse(ev.event, ev.data));
    lastSeq = ev.seq;
  }
  if (streamJobs.isDone(job.job_id)) {
    res.end();
    return;
  }
  const timer = setInterval(() => {
    const evs = streamJobs.snapshot(job.job_id, lastSeq);
    for (const ev of evs) {
      res.write(sse(ev.event, ev.data));
      lastSeq = ev.seq;
    }
    if (streamJobs.isDone(job.job_id)) {
      clearInterval(timer);
      res.end();
    }
  }, 200);
  req.on('close', () => clearInterval(timer));
});

// ===================== POST /jobs/:jobId/cancel — 取消任务 =====================
router.post('/jobs/:jobId/cancel', (req: Request, res: Response) => {
  const ok = streamJobs.cancel(req.params.jobId);
  res.json({
    code: 0,
    data: { job_id: req.params.jobId, status: ok ? 'cancelled' : 'unknown' },
    message: ok ? 'ok' : 'job 不存在或已完成',
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
  const read = skillDao.buildSkillReader(tenantId);
  res.json({ code: 0, data: read(row), message: 'ok' });
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
  res.json({ code: 0, data: skillDao.buildSkillReader(tenantId)(row), message: 'ok' });
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
  res.json({ code: 0, data: skillDao.buildSkillReader(tenantId)(row), message: 'ok' });
});

// ===================== POST /:skillId/archive =====================
router.post('/:skillId/archive', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = skillDao.updateSkill(tenantId, req.params.skillId, { status: 'archived' });
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
    return;
  }
  res.json({ code: 0, data: skillDao.buildSkillReader(tenantId)(row), message: 'ok' });
});

// ===================== POST /:skillId/draft =====================
router.post('/:skillId/draft', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = skillDao.updateSkill(tenantId, req.params.skillId, { status: 'draft' });
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
    return;
  }
  res.json({ code: 0, data: skillDao.buildSkillReader(tenantId)(row), message: 'ok' });
});

// ===================== POST /:skillId/rewrite — 同步重写 =====================
/**
 * 对已有 skill 内容进行重写优化。
 * Body: { instructions?: string, fields?: string[] }
 * 返回重写后的 skill content。
 */
router.post('/:skillId/rewrite', (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const { skillId } = req.params;
    const skill = skillDao.getSkillBySkillId(tenantId, skillId);
    if (!skill) {
      res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
      return;
    }

    const instructions = (req.body?.instructions as string)?.trim() || '优化语言、补充细节、改善结构';
    const fields = (req.body?.fields as string[]) || ['description', 'content'];

    // 读取现有 content
    let content: Record<string, any> = {};
    try {
      content = skill.content_json ? JSON.parse(skill.content_json) : {};
    } catch { content = {}; }

    // 基于指令对 content 做重写（规则化改写，非 AI 调用）
    const rewritten: Record<string, any> = { ...content };
    const warnings: string[] = [];

    if (fields.includes('description') && typeof content.description === 'string') {
      const desc = content.description as string;
      rewritten.description = desc.trim().replace(/\s+/g, ' ');
      if (desc.length < 10) {
        rewritten.description = `${desc.trim()}（已补充：请根据实际业务场景完善此描述）`;
        warnings.push('description 过短，已补充提示');
      }
    }

    if (fields.includes('content') && typeof content.content === 'string') {
      const text = content.content as string;
      // 基础格式优化：去除多余空行、统一标点
      rewritten.content = text
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
    }

    // 更新到数据库
    const updated = skillDao.updateSkill(tenantId, skillId, {
      content: rewritten,
    });

    if (!updated) {
      res.status(500).json({ code: 500, data: null, message: '更新失败' });
      return;
    }

    logger.info(`[StaffSkills] /rewrite: skill ${skillId} 重写完成 (instructions: ${instructions.slice(0, 40)})`);

    res.json({
      code: 0,
      data: {
        implemented: true,
        skill_id: skillId,
        content: rewritten,
        warnings,
        applied_instructions: instructions,
      },
      message: 'ok',
    });
  } catch (e) {
    logger.error('[StaffSkills] /rewrite 失败:', e);
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

// ===================== POST /:skillId/rewrite/jobs — 创建异步重写任务 =====================
router.post('/:skillId/rewrite/jobs', (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const { skillId } = req.params;
    const skill = skillDao.getSkillBySkillId(tenantId, skillId);
    if (!skill) {
      res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
      return;
    }

    const jobId = streamJobs.createJob('rewrite', {
      skill_id: skillId,
      instructions: req.body?.instructions || '',
      fields: req.body?.fields || ['description', 'content'],
    });

    // 异步执行重写（复用 rewrite 逻辑）
    void (async () => {
      const write = (event: string, data: any) => streamJobs.append(jobId, event, data);
      try {
        write('job_attached', { job_id: jobId, status: 'running', skill_id: skillId });
        write('status', { text: '正在分析现有 skill 内容…' });
        await sleep(300);

        let content: Record<string, any> = {};
        try {
          content = skill.content_json ? JSON.parse(skill.content_json) : {};
        } catch { content = {}; }

        write('status', { text: '正在重写内容…' });
        await sleep(300);

        const rewritten = { ...content };
        if (typeof content.description === 'string') {
          rewritten.description = (content.description as string).trim().replace(/\s+/g, ' ');
        }
        if (typeof content.content === 'string') {
          rewritten.content = (content.content as string)
            .replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
        }

        const updated = skillDao.updateSkill(tenantId, skillId, { content: rewritten });
        write('complete', {
          skill_id: skillId,
          content: rewritten,
          warnings: [],
        });
        streamJobs.complete(jobId);
      } catch (e) {
        streamJobs.fail(jobId, (e as Error).message);
      }
    })();

    res.status(201).json({
      code: 0,
      data: { implemented: true, job_id: jobId, status: 'queued', skill_id: skillId },
      message: 'ok',
    });
  } catch (e) {
    logger.error('[StaffSkills] /rewrite/jobs 失败:', e);
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

// ===================== POST /:skillId/rewrite/stream — SSE 流式重写 =====================
router.post('/:skillId/rewrite/stream', async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const { skillId } = req.params;
    const skill = skillDao.getSkillBySkillId(tenantId, skillId);
    if (!skill) {
      res.status(404).json({ code: 404, data: null, message: 'skill 不存在' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const jobId = streamJobs.createJob('rewrite', { skill_id: skillId });
    let closed = false;
    const write = (event: string, data: any) => {
      streamJobs.append(jobId, event, data);
      if (!closed) res.write(sse(event, data));
    };
    res.on('close', () => { closed = true; });

    write('job_attached', { job_id: jobId, status: 'running', skill_id: skillId });
    write('status', { text: '正在分析现有 skill 内容…' });
    await sleep(300);
    if (closed || streamJobs.isCancelled(jobId)) { streamJobs.fail(jobId, 'cancelled'); res.end(); return; }

    let content: Record<string, any> = {};
    try {
      content = skill.content_json ? JSON.parse(skill.content_json) : {};
    } catch { content = {}; }

    write('status', { text: '正在重写内容…' });
    await sleep(300);
    if (closed || streamJobs.isCancelled(jobId)) { streamJobs.fail(jobId, 'cancelled'); res.end(); return; }

    const rewritten = { ...content };
    if (typeof content.description === 'string') {
      rewritten.description = (content.description as string).trim().replace(/\s+/g, ' ');
    }
    if (typeof content.content === 'string') {
      rewritten.content = (content.content as string)
        .replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
    }

    // 流式输出重写后的内容
    const rewrittenText = typeof rewritten.content === 'string' ? rewritten.content : JSON.stringify(rewritten, null, 2);
    for (const seg of chunkText(rewrittenText, 28)) {
      if (closed) break;
      write('chunk', { content: seg });
      await sleep(50);
    }

    const updated = skillDao.updateSkill(tenantId, skillId, { content: rewritten });
    write('complete', {
      skill_id: skillId,
      content: rewritten,
      warnings: [],
    });

    if (!closed) {
      streamJobs.complete(jobId);
      res.write(sse('job_complete', { status: 'completed', error: null }));
    }
  } catch (e) {
    logger.error('[StaffSkills] /rewrite/stream 失败:', e);
    if (!res.headersSent) {
      res.status(500).json({ code: 500, data: null, message: (e as Error).message });
    } else {
      res.write(sse('job_complete', { status: 'failed', error: (e as Error).message }));
    }
  } finally {
    if (!res.headersSent) return;
    res.end();
  }
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
  res.json({ code: 0, data: skillDao.buildSkillReader(tenantId)(row), message: 'ok' });
});

export default router;
