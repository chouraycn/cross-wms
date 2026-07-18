/**
 * User Skills + Builtin Status Patches + SKILL.md Scan Routes
 *
 * Mounted at /api so:
 * - GET/POST/PUT/DELETE /api/user-skills
 * - GET/PUT /api/builtin-status-patches
 * - DELETE /api/builtin-status-patches/:skillId
 * - GET /api/skill-md-scan
 * - GET /api/skill-usage-stats
 * - POST /api/skill-conflict-check
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import {
  getUserSkills as dbGetSkills,
  getUserSkillById as dbGetSkillById,
  createUserSkill as dbCreateSkill,
  updateUserSkill as dbUpdateSkill,
  deleteUserSkill as dbDeleteSkill,
  getBuiltinPatches as dbGetPatches,
  setBuiltinPatch as dbSetPatch,
  removeBuiltinPatch as dbRemovePatch,
  getLatestSkillAudit as dbGetLatestAudit,
  getSkillAuditHistory as dbGetAuditHistory,
  createSkillAudit as dbCreateAudit,
} from '../engine/skills/index.js';
import {
  getSkillUsageStats as dbGetSkillUsageStats,
  getBatchSkillUsageStats as dbGetBatchSkillUsageStats,
} from '../dao/chat.js';
import { auditSkillMd, generateMarkdownReport } from '../services/securityAuditor.js';
import { parseSkillMdContent } from '../services/skillMdParser.js';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';
import yaml from 'js-yaml';
import { dependencyChecker, DependencyCheckResult } from '../../src/utils/dependencyChecker.js';
import { SkillIndex, SkillLifecycle, auditAllSkills, checkSkillDependencies, getRequiresFromSkillMd, getInstallStepsFromSkillMd, generateInstallCommands } from '../services/openclaw/index.js';

// ===================== SKILL.md 解析工具（基于 js-yaml） =====================

/** SKILL.md 扫描结果（不含 body，仅元数据） */
interface ScannedSkillMd {
  dirName: string;
  name: string;
  description: string;
  body: string; // 扫描接口为空，read 接口返回完整内容
  hasSkillMd: boolean;
}

// NOTE: parseSkillMd() 现已委托给 src/services/skill/skillMdParser.ts
// 这里保留一个兼容包装，供 scanWorkbuddySkills() 使用

/** 兼容包装：使用新的 js-yaml 解析器解析 SKILL.md 内容，返回原有格式的 frontmatter + body */
function parseSkillMd(content: string): { frontmatter: Record<string, string>; body: string } {
  const parsed = parseSkillMdContent(content);
  const frontmatter: Record<string, string> = {};

  // 将新格式 frontmatter 转换为旧格式（key: string）
  for (const [key, value] of Object.entries(parsed.frontmatter)) {
    if (Array.isArray(value)) {
      frontmatter[key] = JSON.stringify(value);
    } else if (typeof value === 'object' && value !== null) {
      frontmatter[key] = JSON.stringify(value);
    } else {
      frontmatter[key] = String(value);
    }
  }

  return { frontmatter, body: parsed.body };
}

// ===================== 依赖检测 =====================

function normalizeRequiresList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string').map(s => s.trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function extractOpenClawRequires(content: string): { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[] } | undefined {
  const trimmed = content.trimStart();
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return undefined;

  try {
    const parsed = yaml.load(fmMatch[1], { schema: yaml.DEFAULT_SCHEMA, json: true }) as Record<string, unknown>;
    const metadata = parsed.metadata as Record<string, unknown> | undefined;
    const openclaw = metadata?.openclaw as Record<string, unknown> | undefined;
    const requires = openclaw?.requires as Record<string, unknown> | undefined;
    if (!requires) return undefined;

    const bins = normalizeRequiresList(requires.bins);
    const anyBins = normalizeRequiresList(requires.anyBins);
    const env = normalizeRequiresList(requires.env);
    const config = normalizeRequiresList(requires.config);
    if (bins.length === 0 && anyBins.length === 0 && env.length === 0 && config.length === 0) {
      return undefined;
    }

    const result: { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[] } = {};
    if (bins.length > 0) result.bins = bins;
    if (anyBins.length > 0) result.anyBins = anyBins;
    if (env.length > 0) result.env = env;
    if (config.length > 0) result.config = config;
    return result;
  } catch {
    return undefined;
  }
}

function loadSkillMdContent(
  skillId: string,
  skill?: Record<string, unknown>,
  scanned?: ScannedSkillMd[],
): string | null {
  if (skill?.source === 'builtin') {
    return (skill.promptTemplate as string) || null;
  }
  const list = scanned ?? scanWorkbuddySkills();
  const match = list.find(s => s.dirName === skillId || (skill?.name && s.name === skill.name));
  return match?.body || null;
}

// ===================== SKILL.md 磁盘同步 =====================

/** 将技能的 promptTemplate 同步到磁盘 ~/.workbuddy/skills/{skillId}/SKILL.md */
function syncSkillMdToDisk(skillId: string, promptTemplate: string | null | undefined): void {
  if (!promptTemplate) return; // 没有内容则不写文件
  try {
    const skillsDir = AppPaths.skillsDir;
    const skillDir = path.join(skillsDir, skillId);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    const mdPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(mdPath, promptTemplate, 'utf-8');
  } catch (e) {
    logger.error(`[skills] syncSkillMdToDisk failed for ${skillId}:`, e);
  }
}

/** 将数据库 snake_case 行转换为前端 camelCase 格式 */
function toCamelAudit(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    id: row.id,
    skillId: row.skill_id,
    skillVersion: row.skill_version,
    score: row.score,
    level: row.level,
    reportJson: row.report_json,
    reportMarkdown: row.report_markdown,
    triggeredBy: row.triggered_by,
    createdAt: row.created_at,
  };
}

/** 从数据库读取技能的 promptTemplate（当磁盘上无 SKILL.md 时使用） */
export function scanWorkbuddySkills(): ScannedSkillMd[] {
  const skillsDir = AppPaths.skillsDir;
  const results: ScannedSkillMd[] = [];

  if (!fs.existsSync(skillsDir)) return results;

  /**
   * 解析单个 SKILL.md 候选文件并加入 results
   */
  const tryReadSkillMd = (mdPath: string, dirName: string, groupPrefix = '') => {
    try {
      const content = fs.readFileSync(mdPath, 'utf-8');
      const { frontmatter, body } = parseSkillMd(content);
      // dirName 在 group 下拼前缀，避免与根级同名技能冲突
      const finalDirName = groupPrefix ? `${groupPrefix}/${dirName}` : dirName;
      results.push({
        dirName: finalDirName,
        name: frontmatter.name || dirName,
        description: frontmatter.description || body.slice(0, 100).replace(/[#*\n]/g, ' ').trim(),
        body,
        hasSkillMd: true,
      });
    } catch {
      // 读取失败跳过
    }
  };

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // 跳过隐藏目录和 __MACOSX
      if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;

      const dirPath = path.join(skillsDir, entry.name);
      // 优先查找 SKILL.md（大写），再查找 skill.md（小写）
      const skillMdPath = path.join(dirPath, 'SKILL.md');
      const skillMdLowerPath = path.join(dirPath, 'skill.md');

      if (fs.existsSync(skillMdPath)) {
        tryReadSkillMd(skillMdPath, entry.name);
      } else if (fs.existsSync(skillMdLowerPath)) {
        tryReadSkillMd(skillMdLowerPath, entry.name);
      } else {
        // 目录存在但无 SKILL.md：可能是 group 目录（如 _imported/openclaw/<name>）
        // 尝试向下递归一层
        const subEntries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          if (sub.name.startsWith('.') || sub.name === '__MACOSX') continue;
          const subDir = path.join(dirPath, sub.name);
          const subMd = path.join(subDir, 'SKILL.md');
          const subMdLower = path.join(subDir, 'skill.md');
          if (fs.existsSync(subMd)) {
            tryReadSkillMd(subMd, sub.name, entry.name);
          } else if (fs.existsSync(subMdLower)) {
            tryReadSkillMd(subMdLower, sub.name, entry.name);
          } else {
            // 子目录无 SKILL.md，跳过
          }
        }
      }
    }
  } catch {
    // 目录读取失败
  }

  return results;
}

const router = Router();

// ===================== User Skills =====================

// GET /api/user-skills
router.get('/user-skills', (_req: Request, res: Response) => {
  const data = dbGetSkills();
  res.json({ data });
});

// GET /api/user-skills/:id
router.get('/user-skills/:id', (req: Request, res: Response) => {
  const data = dbGetSkillById(req.params.id);
  if (!data) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json({ data });
});

// POST /api/user-skills
router.post('/user-skills', (req: Request, res: Response) => {
  try {
    const data = dbCreateSkill(req.body as Record<string, unknown>);
    // 同步 promptTemplate 到磁盘 SKILL.md（供审计扫描使用）
    syncSkillMdToDisk(data.id as string, ((req.body as Record<string, unknown>).promptTemplate ?? (data as Record<string, unknown>).promptTemplate) as string | null | undefined);
    res.status(201).json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// PUT /api/user-skills/:id
router.put('/user-skills/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdateSkill(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    // 同步 promptTemplate 到磁盘 SKILL.md（供审计扫描使用）
    syncSkillMdToDisk(req.params.id, ((req.body as Record<string, unknown>).promptTemplate ?? (data as Record<string, unknown>).promptTemplate) as string | null | undefined);
    res.json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// DELETE /api/user-skills/:id — 仅限用户自建技能，内置技能禁止删除
router.delete('/user-skills/:id', (req: Request, res: Response) => {
  const existing = dbGetSkillById(req.params.id);
  // 内置技能不在 user_skills 表中，如果 existing 为空说明 ID 无效或是内置技能
  if (!existing) {
    res.status(404).json({ error: 'Skill not found', code: 'NOT_FOUND' });
    return;
  }
  // 二次防御：即使记录在表中，也校验 source
  if (existing.source === 'builtin') {
    res.status(403).json({ error: 'Cannot delete builtin skill', code: 'FORBIDDEN' });
    return;
  }
  const ok = dbDeleteSkill(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json({ ok: true });
});

// ===================== Builtin Status Patches =====================

// GET /api/builtin-status-patches
router.get('/builtin-status-patches', (_req: Request, res: Response) => {
  const data = dbGetPatches();
  res.json({ data });
});

// PUT /api/builtin-status-patches (body: { skillId, status })
router.put('/builtin-status-patches', (req: Request, res: Response) => {
  const { skillId, status } = req.body;
  if (!skillId || !status) {
    res.status(400).json({ error: 'skillId and status are required' });
    return;
  }
  dbSetPatch(skillId, status);
  res.json({ ok: true });
});

// DELETE /api/builtin-status-patches/:skillId
router.delete('/builtin-status-patches/:skillId', (req: Request, res: Response) => {
  const ok = dbRemovePatch(req.params.skillId);
  if (!ok) {
    res.status(404).json({ error: 'Patch not found' });
    return;
  }
  res.json({ ok: true });
});

// ===================== SKILL.md Scan =====================

// GET /api/skill-md-scan — 扫描 ~/.workbuddy/skills/ 下的 SKILL.md 技能包（仅返回元数据，不含 body）
router.get('/skill-md-scan', (_req: Request, res: Response) => {
  const scanned = scanWorkbuddySkills();
  // 只返回有 SKILL.md 的目录，且不返回 body（体积太大，导入时再读取）
  const available = scanned
    .filter((s) => s.hasSkillMd)
    .map(({ body: _b, ...rest }) => rest);
  res.json({ data: available });
});

// GET /api/skill-md-read/:dirName — 读取指定技能的完整 body（导入时调用）
router.get('/skill-md-read/:dirName', (req: Request, res: Response) => {
  const dirName = req.params.dirName;
  const skillsDir = AppPaths.skillsDir;
  const dirPath = path.join(skillsDir, dirName);

  // 安全检查：防止路径遍历
  if (!dirPath.startsWith(skillsDir) || !fs.existsSync(dirPath)) {
    res.status(404).json({ error: 'Skill directory not found' });
    return;
  }

  const skillMdPath = path.join(dirPath, 'SKILL.md');
  const skillMdLowerPath = path.join(dirPath, 'skill.md');
  let mdPath: string | null = null;
  if (fs.existsSync(skillMdPath)) {
    mdPath = skillMdPath;
  } else if (fs.existsSync(skillMdLowerPath)) {
    mdPath = skillMdLowerPath;
  }

  if (!mdPath) {
    res.status(404).json({ error: 'SKILL.md not found' });
    return;
  }

  try {
    const content = fs.readFileSync(mdPath, 'utf-8');
    const { frontmatter, body } = parseSkillMd(content);
    res.json({
      data: {
        dirName,
        name: frontmatter.name || dirName,
        description: frontmatter.description || body.slice(0, 100).replace(/[#*\n]/g, ' ').trim(),
        body,
        hasSkillMd: true,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to read SKILL.md' });
  }
});

// ===================== Skill Usage Statistics =====================

// ===================== 冲突检测算法 v2 =====================

/** Jaccard 相似度计算（集合级别） */
function jaccardSimilarity(setA: string[], setB: string[]): number {
  const a = new Set(setA.map(s => s.toLowerCase().trim()).filter(Boolean));
  const b = new Set(setB.map(s => s.toLowerCase().trim()).filter(Boolean));
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/** 触发词多分隔符分词 */
function tokenizeTrigger(trigger: string): string[] {
  return trigger
    .split(/[/,，;；、\s|｜]+/)
    .map(t => t.toLowerCase().trim())
    .filter(t => t.length > 0);
}

/** 生成字符 bigram 集合（适合中文/混合文本的相似度计算） */
function bigramSet(text: string): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, '');
  if (normalized.length < 2) return [normalized];
  const bigrams: string[] = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.push(normalized.substring(i, i + 2));
  }
  return bigrams;
}

/** bigram Jaccard 相似度（比单字符 Jaccard 更准确） */
function bigramSimilarity(strA: string, strB: string): number {
  if (!strA || !strB) return 0;
  return jaccardSimilarity(bigramSet(strA), bigramSet(strB));
}

/** 余弦相似度（向量已 L2 归一化时 = 点积） */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/** embedding 缓存（避免重复计算） */
const embeddingCache = new Map<string, Float32Array>();

/** 生成文本 embedding（best-effort，模型不可用时返回 null） */
async function tryGetEmbedding(text: string, cacheKey: string): Promise<Float32Array | null> {
  if (embeddingCache.has(cacheKey)) return embeddingCache.get(cacheKey)!;
  try {
    const { embedText } = await import('../engine/onnxEmbedding.js');
    const embedding = await embedText(text);
    embeddingCache.set(cacheKey, embedding);
    // 缓存上限 100 条，防止内存膨胀
    if (embeddingCache.size > 100) {
      const firstKey = embeddingCache.keys().next().value;
      if (firstKey) embeddingCache.delete(firstKey);
    }
    return embedding;
  } catch {
    return null;
  }
}

/**
 * 检查两个技能是否冲突（v2: bigram + embedding 语义相似度）
 */
async function checkConflict(
  skillA: { name?: string; trigger?: string; tags?: string[]; desc?: string },
  skillB: { name?: string; trigger?: string; tags?: string[]; desc?: string; id?: string },
): Promise<{ score: number; reasons: string[] }> {
  const reasons: string[] = [];
  let score = 0;

  // 1. 名称相似度（bigram Jaccard，权重 0.35）
  const nameA = (skillA.name || '').toLowerCase();
  const nameB = (skillB.name || '').toLowerCase();
  if (nameA && nameB) {
    const nameSim = bigramSimilarity(nameA, nameB);
    if (nameSim > 0.4) {
      score += nameSim * 0.35;
      reasons.push(`名称相似度: ${(nameSim * 100).toFixed(1)}%`);
    }
  }

  // 2. 触发词相似度（多分隔符 token Jaccard，权重 0.25）
  const triggerA = skillA.trigger || '';
  const triggerB = skillB.trigger || '';
  if (triggerA && triggerB) {
    const tokensA = tokenizeTrigger(triggerA);
    const tokensB = tokenizeTrigger(triggerB);
    const triggerSim = jaccardSimilarity(tokensA, tokensB);
    if (triggerSim > 0.25) {
      score += triggerSim * 0.25;
      reasons.push(`触发词相似度: ${(triggerSim * 100).toFixed(1)}%`);
    }
  }

  // 3. 标签重叠度（Jaccard，权重 0.15）
  const tagsA = Array.isArray(skillA.tags) ? skillA.tags : [];
  const tagsB = Array.isArray(skillB.tags) ? skillB.tags : [];
  if (tagsA.length > 0 && tagsB.length > 0) {
    const tagSim = jaccardSimilarity(tagsA, tagsB);
    if (tagSim > 0.3) {
      score += tagSim * 0.15;
      reasons.push(`标签重叠度: ${(tagSim * 100).toFixed(1)}%`);
    }
  }

  // 4. 描述相似度（bigram Jaccard，权重 0.10）
  const descA = skillA.desc || '';
  const descB = skillB.desc || '';
  if (descA && descB) {
    const descSim = bigramSimilarity(descA, descB);
    if (descSim > 0.3) {
      score += descSim * 0.10;
      reasons.push(`描述相似度: ${(descSim * 100).toFixed(1)}%`);
    }
  }

  // 5. embedding 语义相似度（权重 0.15，best-effort）
  // 仅在 Jaccard 分数 > 0.15 时才计算 embedding（性能优化）
  if (score > 0.15) {
    const textA = `${skillA.name || ''} ${skillA.trigger || ''} ${descA}`.trim();
    const textB = `${skillB.name || ''} ${skillB.trigger || ''} ${descB}`.trim();
    if (textA && textB) {
      const [embA, embB] = await Promise.all([
        tryGetEmbedding(textA, `new:${textA}`),
        skillB.id ? tryGetEmbedding(textB, `skill:${skillB.id}`) : tryGetEmbedding(textB, `text:${textB}`),
      ]);
      if (embA && embB) {
        const embSim = cosineSimilarity(embA, embB);
        if (embSim > 0.5) {
          score += embSim * 0.15;
          reasons.push(`语义相似度: ${(embSim * 100).toFixed(1)}%`);
        }
      }
    }
  }

  return { score: Math.min(score, 1), reasons };
}

// GET /api/skill-usage-stats?skillId=xxx — 获取技能使用统计
router.get('/skill-usage-stats', (req: Request, res: Response) => {
  const skillId = req.query.skillId as string | undefined;

  if (skillId) {
    // 查询单个技能
    const stats = dbGetSkillUsageStats(skillId);
    res.json({ data: { [skillId]: stats } });
  } else {
    // 批量查询所有技能（从 user_skills 表中获取所有技能 ID）
    const allSkills = dbGetSkills();
    const skillIds = allSkills.map((s: Record<string, unknown>) => s.id as string);
    const statsMap = dbGetBatchSkillUsageStats(skillIds);
    const result: Record<string, { totalUses: number; lastUsedAt: string | null }> = {};
    for (const [id, stats] of statsMap.entries()) {
      result[id] = stats;
    }
    res.json({ data: result });
  }
});

// POST /api/skill-conflict-check — 检查技能冲突
router.post('/skill-conflict-check', async (req: Request, res: Response) => {
  const { name, trigger, tags, desc } = req.body;

  if (!name && !trigger && (!tags || !Array.isArray(tags) || tags.length === 0)) {
    res.status(400).json({ error: 'At least one of name, trigger, or tags must be provided' });
    return;
  }

  // 获取所有现有技能
  const allSkills = dbGetSkills();

  // 计算与每个现有技能的冲突分数（v2: async, embedding-enhanced）
  const conflicts: Array<{ skillId: string; skillName: string; score: number; reasons: string[] }> = [];
  const THRESHOLD = 0.35; // 冲突阈值（v2 降低，因权重重新分配）

  for (const skill of allSkills) {
    const skillRecord = skill as Record<string, unknown>;
    const { score, reasons } = await checkConflict(
      { name, trigger, tags, desc },
      {
        name: skillRecord.name as string,
        trigger: skillRecord.trigger as string,
        tags: skillRecord.tags as string[] | undefined,
        desc: skillRecord.desc as string | undefined,
        id: skillRecord.id as string,
      },
    );

    if (score >= THRESHOLD) {
      conflicts.push({
        skillId: skillRecord.id as string,
        skillName: skillRecord.name as string,
        score,
        reasons,
      });
    }
  }

  // 按冲突分数降序排序
  conflicts.sort((a, b) => b.score - a.score);

  const isHighRisk = conflicts.length > 0 && conflicts[0].score >= 0.65;

  res.json({
    data: {
      conflicts,
      isHighRisk,
    },
  });
});

// ===================== Skill Audit Routes =====================

// GET /api/skill-audits/:skillId — 获取最新审查结果
router.get('/skill-audits/:skillId', (req: Request, res: Response) => {
  try {
    const audit = dbGetLatestAudit(req.params.skillId);
    res.json({ data: toCamelAudit(audit) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/skill-audits/:skillId/history — 获取审查历史
router.get('/skill-audits/:skillId/history', (req: Request, res: Response) => {
  try {
    const history = dbGetAuditHistory(req.params.skillId);
    res.json({ data: history.map(toCamelAudit) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/skill-audits — 触发审查（带缓存，force 可跳过缓存）
router.post('/skill-audits', async (req: Request, res: Response) => {
  try {
    const { skillId, skillPath, force } = req.body;
    if (!skillId) {
      res.status(400).json({ error: 'skillId is required' });
      return;
    }

    // Resolve SKILL.md path or promptTemplate from DB
    let mdPath: string | null = null;
    let content: string | null = null;

    if (skillPath && fs.existsSync(skillPath)) {
      mdPath = skillPath;
      content = fs.readFileSync(mdPath as string, 'utf-8');
    } else {
      // 优先查找磁盘文件
      const skillsDir = AppPaths.skillsDir;
      const skillDir = path.join(skillsDir, skillId);
      const upperPath = path.join(skillDir, 'SKILL.md');
      const lowerPath = path.join(skillDir, 'skill.md');
      if (fs.existsSync(upperPath)) {
        mdPath = upperPath;
        content = fs.readFileSync(mdPath, 'utf-8');
      } else if (fs.existsSync(lowerPath)) {
        mdPath = lowerPath;
        content = fs.readFileSync(mdPath, 'utf-8');
      } else {
        // 磁盘上无 SKILL.md：尝试从数据库读取 promptTemplate
        const dbSkill = dbGetSkillById(skillId);
        if (dbSkill && dbSkill.promptTemplate) {
          content = dbSkill.promptTemplate as string;
          // 写入磁盘，使 auditSkillMd 能正常工作（以及后续扫描能发现）
          if (!fs.existsSync(skillDir)) {
            fs.mkdirSync(skillDir, { recursive: true });
          }
          mdPath = upperPath; // 写入 SKILL.md（大写）
          fs.writeFileSync(mdPath, content, 'utf-8');
        } else {
          res.status(404).json({ error: `SKILL.md not found for skill: ${skillId}` });
          return;
        }
      }
    }

    const version = crypto.createHash('sha256').update(content!).digest('hex');

    // Cache check: return existing audit if same version (unless force=true)
    if (!force) {
      const existing = dbGetLatestAudit(skillId);
      if (existing && existing.skill_version === version) {
        return res.json({ data: toCamelAudit(existing) });
      }
    }

    // Run security audit
    const result = await auditSkillMd(mdPath!, content!);
    const id = uuidv4();
    const now = new Date().toISOString();

    dbCreateAudit({
      id,
      skillId,
      skillVersion: version,
      score: result.summary.score,
      level: result.summary.level,
      reportJson: JSON.stringify(result),
      reportMarkdown: generateMarkdownReport(result),
      triggeredBy: 'manual',
      createdAt: now,
    });

    const audit = dbGetLatestAudit(skillId);
    res.json({ data: toCamelAudit(audit) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/skill-audits/batch — 批量审计技能
router.post('/skill-audits/batch', async (req: Request, res: Response) => {
  try {
    const { skillIds } = req.body;
    if (!Array.isArray(skillIds) || skillIds.length === 0) {
      res.status(400).json({ error: 'skillIds array is required' });
      return;
    }

    const results: Array<{ skillId: string; score: number; level: string; error?: string }> = [];
    const skillsDir = AppPaths.skillsDir;

    for (const skillId of skillIds) {
      try {
        const upperPath = path.join(skillsDir, skillId, 'SKILL.md');
        const lowerPath = path.join(skillsDir, skillId, 'skill.md');
        let mdPath: string | null = null;
        if (fs.existsSync(upperPath)) {
          mdPath = upperPath;
        } else if (fs.existsSync(lowerPath)) {
          mdPath = lowerPath;
        }

        if (!mdPath) {
          results.push({ skillId, score: 100, level: 'safe', error: 'SKILL.md not found' });
          continue;
        }

        const content = fs.readFileSync(mdPath, 'utf-8');
        const version = crypto.createHash('sha256').update(content).digest('hex');

        // Skip if already audited for this version
        const existing = dbGetLatestAudit(skillId);
        if (existing && existing.skill_version === version) {
          results.push({ skillId, score: existing.score, level: existing.level });
          continue;
        }

        const result = await auditSkillMd(mdPath!, content!);
        const id = uuidv4();
        const now = new Date().toISOString();

        dbCreateAudit({
          id,
          skillId,
          skillVersion: version,
          score: result.summary.score,
          level: result.summary.level,
          reportJson: JSON.stringify(result),
          reportMarkdown: generateMarkdownReport(result),
          triggeredBy: 'manual',
          createdAt: now,
        });

        results.push({ skillId, score: result.summary.score, level: result.summary.level });
      } catch (e) {
        results.push({
          skillId,
          score: 0,
          level: 'malicious',
          error: (e as Error).message,
        });
      }
    }

    res.json({ data: { results } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/skills/dependency-check — 批量检测技能环境依赖
router.post('/skills/dependency-check', async (req: Request, res: Response) => {
  const skillIds = (req.body as { skillIds?: string[] }).skillIds || [];
  const results: Record<string, DependencyCheckResult> = {};
  const scanned = scanWorkbuddySkills();

  for (const skillId of skillIds) {
    try {
      const skill = dbGetSkillById(skillId);
      const content = loadSkillMdContent(skillId, skill, scanned);
      const requires = content ? extractOpenClawRequires(content) : undefined;
      results[skillId] = await dependencyChecker.checkAll(
        requires?.bins || [],
        requires?.anyBins || [],
        requires?.env || [],
        requires?.config || []
      );
    } catch {
      results[skillId] = {
        allFound: false,
        checks: [],
        missingBins: [],
        missingEnv: [],
        missingConfig: [],
      };
    }
  }

  res.json({ data: results });
});

// Backward-compatible aliases for old audit route paths
// GET /api/skills/:id/audit → same as /api/skill-audits/:id
router.get('/skills/:id/audit', (req: Request, res: Response) => {
  try {
    const audit = dbGetLatestAudit(req.params.id);
    res.json({ data: toCamelAudit(audit) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/skills/:id/audit-history → same as /api/skill-audits/:id/history
router.get('/skills/:id/audit-history', (req: Request, res: Response) => {
  try {
    const history = dbGetAuditHistory(req.params.id);
    res.json({ data: history.map(toCamelAudit) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/skills/:id/export — 导出技能为 ZIP
router.get('/skills/:id/export', async (req: Request, res: Response) => {
  try {
    const skillsDir = AppPaths.skillsDir;
    const skillDir = path.join(skillsDir, req.params.id);

    if (!fs.existsSync(skillDir)) {
      res.status(404).json({ error: 'Skill directory not found' });
      return;
    }

    // Try to get skill name from DB (user skills), fall back to directory name (built-in skills)
    let skillName = req.params.id;
    try {
      const skill = dbGetSkillById(req.params.id);
      if (skill && skill.name) skillName = skill.name as string;
    } catch {}

    // Create ZIP in temp directory
    const tempDir = os.tmpdir();
    const zipFileName = `${skillName}-${req.params.id}.zip`;
    const zipFilePath = path.join(tempDir, zipFileName);

    // Remove existing ZIP file if it exists
    if (fs.existsSync(zipFilePath)) {
      fs.unlinkSync(zipFilePath);
    }

    // Create ZIP using the `zip` command (available on macOS)
    const execAsync = promisify(exec);
    try {
      await execAsync(`cd "${skillDir}" && zip -r "${zipFilePath}" .`);
    } catch (zipError) {
      logger.error('[Export] ZIP creation failed:', zipError);
      res.status(500).json({ error: 'Failed to create ZIP file' });
      return;
    }

    if (!fs.existsSync(zipFilePath)) {
      res.status(500).json({ error: 'ZIP file was not created' });
      return;
    }

    // Send the ZIP file
    res.download(zipFilePath, zipFileName, (err) => {
      // Clean up temp file after sending
      if (fs.existsSync(zipFilePath)) {
        try {
          fs.unlinkSync(zipFilePath);
        } catch (cleanupError) {
          logger.error('[Export] Failed to cleanup temp ZIP:', cleanupError);
        }
      }
      if (err) {
        logger.error('[Export] Download failed:', err);
      }
    });
  } catch (e) {
    logger.error('[Export] Export failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/skills/:id/audit-export — 导出审计报告为 Markdown
router.post('/skills/:id/audit-export', async (req: Request, res: Response) => {
  try {
    const { format } = req.body;
    const audit = dbGetLatestAudit(req.params.id);
    if (!audit) {
      res.status(404).json({ error: 'No audit found for this skill' });
      return;
    }
    // Use pre-generated markdown if available
    if (audit.report_markdown) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-${req.params.id}.md"`);
      res.send(audit.report_markdown);
      return;
    }
    // Fallback: generate from report_json
    if (audit.report_json) {
      const result = JSON.parse(audit.report_json);
      const md = generateMarkdownReport(result);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-${req.params.id}.md"`);
      res.send(md);
      return;
    }
    res.status(500).json({ error: 'No report data available' });
  } catch (e) {
    logger.error('[Audit Export] Failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ===================== OpenClaw Skill System API =====================

let skillIndexInstance: SkillIndex | null = null;
let skillLifecycleInstance: SkillLifecycle | null = null;

function getSkillIndex(): SkillIndex {
  if (!skillIndexInstance) {
    skillIndexInstance = new SkillIndex(AppPaths.skillsDir);
    skillIndexInstance.build();
  }
  return skillIndexInstance;
}

function getSkillLifecycle(): SkillLifecycle {
  if (!skillLifecycleInstance) {
    skillLifecycleInstance = new SkillLifecycle(AppPaths.skillsDir);
  }
  return skillLifecycleInstance;
}

function refreshSkillIndex(): void {
  skillIndexInstance = null;
}

// GET /api/openclaw/skills/search — 技能搜索
router.get('/openclaw/skills/search', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const index = getSkillIndex();
  const result = index.search(query);
  res.json({ data: result });
});

// GET /api/openclaw/skills/list — 列出所有技能（含元数据）
router.get('/openclaw/skills/list', (req: Request, res: Response) => {
  const index = getSkillIndex();
  const entries = index.getAll();
  res.json({ data: { entries, total: entries.length } });
});

// GET /api/openclaw/skills/categories — 获取所有分类
router.get('/openclaw/skills/categories', (_req: Request, res: Response) => {
  const index = getSkillIndex();
  const categories = index.getCategories();
  res.json({ data: categories });
});

// GET /api/openclaw/skills/tags — 获取所有标签
router.get('/openclaw/skills/tags', (_req: Request, res: Response) => {
  const index = getSkillIndex();
  const tags = index.getTags();
  res.json({ data: tags });
});

// GET /api/openclaw/skills/:id — 获取单个技能详情
router.get('/openclaw/skills/:id', (req: Request, res: Response) => {
  const index = getSkillIndex();
  const entry = index.getById(req.params.id);
  if (!entry) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json({ data: entry });
});

// POST /api/openclaw/skills/filter — 多条件过滤
router.post('/openclaw/skills/filter', (req: Request, res: Response) => {
  const options = req.body as Record<string, unknown>;
  const index = getSkillIndex();
  const entries = index.filter({
    search: options.search as string | undefined,
    category: options.category as string | undefined,
    tags: Array.isArray(options.tags) ? options.tags.map(String) : undefined,
    os: options.os as string | undefined,
    featured: options.featured as boolean | undefined,
    userInvocable: options.userInvocable as boolean | undefined,
    hasMd: options.hasMd as boolean | undefined,
  });
  res.json({ data: { entries, total: entries.length } });
});

// POST /api/openclaw/skills/install — 安装技能
router.post('/openclaw/skills/install', async (req: Request, res: Response) => {
  const { sourceDir, overwrite = false, skipDependencies = false, runAudit = false } = req.body;
  if (!sourceDir) {
    res.status(400).json({ error: 'sourceDir is required' });
    return;
  }
  const lifecycle = getSkillLifecycle();
  const result = await lifecycle.install(sourceDir, { overwrite, skipDependencies, runAudit });
  if (result.success) {
    refreshSkillIndex();
    res.json({ data: result });
  } else {
    res.status(400).json({ error: result.error, data: result });
  }
});

// DELETE /api/openclaw/skills/uninstall/:id — 卸载技能
router.delete('/openclaw/skills/uninstall/:id', (req: Request, res: Response) => {
  const lifecycle = getSkillLifecycle();
  const result = lifecycle.uninstall(req.params.id);
  if (result.success) {
    refreshSkillIndex();
    res.json({ data: result });
  } else {
    res.status(400).json({ error: result.error, data: result });
  }
});

// POST /api/openclaw/skills/update/:id — 更新技能
router.post('/openclaw/skills/update/:id', async (req: Request, res: Response) => {
  const { sourceDir } = req.body;
  if (!sourceDir) {
    res.status(400).json({ error: 'sourceDir is required' });
    return;
  }
  const lifecycle = getSkillLifecycle();
  const result = await lifecycle.update(req.params.id, sourceDir);
  if (result.success) {
    refreshSkillIndex();
    res.json({ data: result });
  } else {
    res.status(400).json({ error: result.error, data: result });
  }
});

// GET /api/openclaw/skills/lifecycle/list — 列出已安装技能（生命周期视角）
router.get('/openclaw/skills/lifecycle/list', (_req: Request, res: Response) => {
  const lifecycle = getSkillLifecycle();
  const installed = lifecycle.list();
  res.json({ data: { installed, total: installed.length } });
});

// GET /api/openclaw/skills/lifecycle/exists/:id — 检查技能是否存在
router.get('/openclaw/skills/lifecycle/exists/:id', (req: Request, res: Response) => {
  const lifecycle = getSkillLifecycle();
  const exists = lifecycle.exists(req.params.id);
  res.json({ data: { skillId: req.params.id, exists } });
});

// GET /api/openclaw/skills/audit/all — 审计所有技能
router.get('/openclaw/skills/audit/all', (_req: Request, res: Response) => {
  const audits = auditAllSkills(AppPaths.skillsDir);
  res.json({ data: audits });
});

// GET /api/openclaw/skills/audit/:id — 审计单个技能
router.get('/openclaw/skills/audit/:id', (req: Request, res: Response) => {
  const audit = auditAllSkills(AppPaths.skillsDir).find(a => a.skillId === req.params.id);
  if (!audit) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json({ data: audit });
});

// GET /api/openclaw/skills/dependencies/:id — 检查单个技能依赖
router.get('/openclaw/skills/dependencies/:id', async (req: Request, res: Response) => {
  const skillId = req.params.id;
  const skillsDir = AppPaths.skillsDir;
  const skillDir = path.join(skillsDir, skillId);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const skillMdLowerPath = path.join(skillDir, 'skill.md');

  if (!fs.existsSync(skillMdPath) && !fs.existsSync(skillMdLowerPath)) {
    res.status(404).json({ error: 'SKILL.md not found' });
    return;
  }

  const mdPath = fs.existsSync(skillMdPath) ? skillMdPath : skillMdLowerPath;
  const content = fs.readFileSync(mdPath, 'utf-8');
  const requires = getRequiresFromSkillMd(content);
  const installSteps = getInstallStepsFromSkillMd(content);
  const skillName = skillId;

  const result = await checkSkillDependencies(skillId, skillName, requires, installSteps);
  res.json({ data: { ...result, installCommands: generateInstallCommands(installSteps) } });
});

// POST /api/openclaw/skills/dependencies/batch — 批量检查技能依赖
router.post('/openclaw/skills/dependencies/batch', async (req: Request, res: Response) => {
  const skillIds = (req.body as { skillIds?: string[] }).skillIds || [];
  const skillsDir = AppPaths.skillsDir;
  const results: Record<string, unknown> = {};

  for (const skillId of skillIds) {
    const skillDir = path.join(skillsDir, skillId);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const skillMdLowerPath = path.join(skillDir, 'skill.md');

    if (!fs.existsSync(skillMdPath) && !fs.existsSync(skillMdLowerPath)) {
      results[skillId] = { error: 'SKILL.md not found' };
      continue;
    }

    const mdPath = fs.existsSync(skillMdPath) ? skillMdPath : skillMdLowerPath;
    const content = fs.readFileSync(mdPath, 'utf-8');
    const requires = getRequiresFromSkillMd(content);
    const installSteps = getInstallStepsFromSkillMd(content);

    const result = await checkSkillDependencies(skillId, skillId, requires, installSteps);
    results[skillId] = { ...result, installCommands: generateInstallCommands(installSteps) };
  }

  res.json({ data: results });
});

// POST /api/openclaw/skills/refresh — 刷新技能索引
router.post('/openclaw/skills/refresh', (_req: Request, res: Response) => {
  refreshSkillIndex();
  const index = getSkillIndex();
  res.json({ data: { refreshed: true, total: index.count() } });
});

export default router;
