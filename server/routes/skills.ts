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
import { FileStorage } from '../storage/FileStorage.js';
import yaml from 'js-yaml';
import { dependencyChecker, DependencyCheckResult } from '../../src/utils/dependencyChecker.js';
import { SkillIndex, SkillLifecycle, auditAllSkills, checkSkillDependencies, getRequiresFromSkillMd, getInstallStepsFromSkillMd, generateInstallCommands } from '../services/openclaw/index.js';
import { auditDocQuality, batchAuditDocQuality } from '../services/docQualityChecker.js';
import { generateRecommendations } from '../services/skillRecommender.js';

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

// ============================================================================
// 技能依赖图谱 API
// ============================================================================

/** 技能依赖图谱节点 */
interface SkillDepNode {
  id: string;
  name: string;
  category?: string;
  status: 'active' | 'available' | 'unknown';
}

/** 技能依赖图谱边 */
interface SkillDepEdge {
  source: string;
  target: string;
  type: 'required' | 'optional' | 'conflicts';
}

/** 单个技能的依赖信息 */
interface SkillDepInfo {
  dependencies: Array<{ skillId: string; name: string; required: boolean; reason?: string }>;
  dependents: Array<{ skillId: string; name: string }>;
  conflicts: Array<{ skillId: string; name: string; reason: string }>;
  cycles: string[][];
}

// GET /api/skills/dependency-graph — 获取技能依赖图谱
router.get('/skills/dependency-graph', (_req: Request, res: Response) => {
  try {
    const scanned = scanWorkbuddySkills();
    const nodes: SkillDepNode[] = [];
    const edges: SkillDepEdge[] = [];
    const nodeMap = new Map<string, SkillDepNode>();

    // 获取所有数据库技能的状态
    const dbSkills = dbGetSkills();
    const dbStatusMap = new Map<string, string>();
    for (const s of dbSkills) {
      dbStatusMap.set(s.id as string, (s.status as string) || 'available');
    }

    // 构建节点
    for (const s of scanned) {
      const node: SkillDepNode = {
        id: s.dirName,
        name: s.name,
        status: (dbStatusMap.get(s.dirName) as any) || 'unknown',
      };
      nodes.push(node);
      nodeMap.set(s.dirName, node);
    }

    // 构建边（从 frontmatter 解析 dependencies 和 conflicts）
    for (const s of scanned) {
      const { frontmatter } = parseSkillMd(s.body);

      // 解析依赖
      if (frontmatter.dependencies) {
        try {
          const deps = JSON.parse(frontmatter.dependencies);
          if (Array.isArray(deps)) {
            for (const dep of deps) {
              if (typeof dep === 'string') {
                edges.push({ source: s.dirName, target: dep, type: 'required' });
              } else if (dep && typeof dep === 'object') {
                const skillId = String(dep.skill ?? dep.name ?? '');
                if (skillId) {
                  edges.push({
                    source: s.dirName,
                    target: skillId,
                    type: dep.required === false ? 'optional' : 'required',
                  });
                }
              }
            }
          }
        } catch {
          // 忽略解析错误
        }
      }

      // 解析冲突
      if (frontmatter.conflicts) {
        try {
          const conflicts = JSON.parse(frontmatter.conflicts);
          if (Array.isArray(conflicts)) {
            for (const c of conflicts) {
              if (typeof c === 'string') {
                edges.push({ source: s.dirName, target: c, type: 'conflicts' });
              } else if (c && typeof c === 'object') {
                const skillId = String(c.skill ?? c.name ?? '');
                if (skillId) {
                  edges.push({ source: s.dirName, target: skillId, type: 'conflicts' });
                }
              }
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    res.json({ data: { nodes, edges } });
  } catch (e) {
    logger.error('[Skills] dependency-graph failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/skills/:id/skill-dependencies — 获取单个技能的依赖详情
router.get('/skills/:id/skill-dependencies', (req: Request, res: Response) => {
  try {
    const skillId = req.params.id;
    const scanned = scanWorkbuddySkills();
    const skillMap = new Map<string, ScannedSkillMd>();
    for (const s of scanned) {
      skillMap.set(s.dirName, s);
    }

    const target = skillMap.get(skillId);
    if (!target) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    const { frontmatter } = parseSkillMd(target.body);
    const info: SkillDepInfo = {
      dependencies: [],
      dependents: [],
      conflicts: [],
      cycles: [],
    };

    // 解析自身依赖
    if (frontmatter.dependencies) {
      try {
        const deps = JSON.parse(frontmatter.dependencies);
        if (Array.isArray(deps)) {
          for (const dep of deps) {
            if (typeof dep === 'string') {
              const depSkill = skillMap.get(dep);
              info.dependencies.push({ skillId: dep, name: depSkill?.name || dep, required: true });
            } else if (dep && typeof dep === 'object') {
              const id = String(dep.skill ?? dep.name ?? '');
              const depSkill = skillMap.get(id);
              info.dependencies.push({
                skillId: id,
                name: depSkill?.name || id,
                required: dep.required !== false,
                reason: dep.reason,
              });
            }
          }
        }
      } catch {
        // 忽略
      }
    }

    // 解析自身冲突
    if (frontmatter.conflicts) {
      try {
        const conflicts = JSON.parse(frontmatter.conflicts);
        if (Array.isArray(conflicts)) {
          for (const c of conflicts) {
            if (typeof c === 'string') {
              const conflictSkill = skillMap.get(c);
              info.conflicts.push({ skillId: c, name: conflictSkill?.name || c, reason: 'Declared conflict' });
            } else if (c && typeof c === 'object') {
              const id = String(c.skill ?? c.name ?? '');
              const conflictSkill = skillMap.get(id);
              info.conflicts.push({
                skillId: id,
                name: conflictSkill?.name || id,
                reason: String(c.reason || 'Declared conflict'),
              });
            }
          }
        }
      } catch {
        // 忽略
      }
    }

    // 查找依赖本技能的技能（dependents）
    for (const [otherId, otherSkill] of skillMap) {
      if (otherId === skillId) continue;
      const otherFm = parseSkillMd(otherSkill.body).frontmatter;
      if (otherFm.dependencies) {
        try {
          const deps = JSON.parse(otherFm.dependencies);
          if (Array.isArray(deps)) {
            const hasDep = deps.some((d: unknown) => {
              if (typeof d === 'string') return d === skillId;
              if (d && typeof d === 'object') {
                return (d as Record<string, unknown>).skill === skillId || (d as Record<string, unknown>).name === skillId;
              }
              return false;
            });
            if (hasDep) {
              info.dependents.push({ skillId: otherId, name: otherSkill.name });
            }
          }
        } catch {
          // 忽略
        }
      }
    }

    const visited = new Set<string>();
    const path: string[] = [];
    const pathSet = new Set<string>();
    const cycles: string[][] = [];

    const dfs = function (current: string) {
      if (pathSet.has(current)) {
        const start = path.indexOf(current);
        cycles.push(path.slice(start));
        return;
      }
      if (visited.has(current)) return;

      path.push(current);
      pathSet.add(current);

      const s = skillMap.get(current);
      if (s) {
        const fm = parseSkillMd(s.body).frontmatter;
        if (fm.dependencies) {
          try {
            const deps = JSON.parse(fm.dependencies);
            if (Array.isArray(deps)) {
              for (const dep of deps) {
                const depId = typeof dep === 'string' ? dep : String(dep.skill ?? dep.name ?? '');
                if (depId) dfs(depId);
              }
            }
          } catch {
            // 忽略
          }
        }
      }

      path.pop();
      pathSet.delete(current);
      visited.add(current);
    };

    dfs(skillId);
    if (cycles.length > 0) {
      info.cycles = cycles;
    }

    res.json({ data: info });
  } catch (e) {
    logger.error('[Skills] skill-dependencies failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ============================================================================
// 技能使用分析 API
// ============================================================================

/** 单个技能在指定窗口内的使用情况 */
interface SkillUsageBucket {
  skillId: string;
  count: number;
  lastUsedAt: string | null;
  uniqueSessions: number;
}

/** 时间桶 (YYYY-MM-DD) */
function formatDateBucket(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// GET /api/skills/usage-analytics — 技能使用趋势 + Top N
router.get('/skills/usage-analytics', (req: Request, res: Response) => {
  try {
    const days = Math.max(1, Math.min(90, parseInt(String(req.query.days ?? '7'), 10) || 7));
    const topN = Math.max(1, Math.min(50, parseInt(String(req.query.top ?? '10'), 10) || 10));

    const sessionIds = FileStorage.listSessionFiles();
    const sinceMs = Date.now() - days * 86400000;

    // 解析 JSONL 单个会话文件
    const parseSession = (sid: string): Array<Record<string, unknown>> => {
      try {
        const lines = FileStorage.readSessionLines(sid);
        if (lines.length === 0) return [];
        const first = lines[0] as any;
        const initial: Array<Record<string, unknown>> = Array.isArray(first?.messages) ? first.messages : [];
        const rest: Array<Record<string, unknown>> = [];
        for (let i = 1; i < lines.length; i++) {
          const l = lines[i] as any;
          if (l && l.message) rest.push(l.message);
        }
        return [...initial, ...rest];
      } catch {
        return [];
      }
    };

    // 每日时间桶
    const dayBuckets: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dayBuckets.push(formatDateBucket(d));
    }
    const trend: Record<string, number> = {};
    for (const b of dayBuckets) trend[b] = 0;

    // 技能使用统计
    const skillMap = new Map<string, SkillUsageBucket & { firstUsedAt: string | null }>();
    const skillSessionMap = new Map<string, Set<string>>();

    for (const sid of sessionIds) {
      const messages = parseSession(sid);
      for (const msg of messages) {
        const m = msg as any;
        if (!m.skillId) continue;
        const ts = m.timestamp;
        const tsMs = ts ? new Date(ts).getTime() : 0;
        if (tsMs < sinceMs) continue;

        const bucket = skillMap.get(m.skillId) ?? {
          skillId: m.skillId,
          count: 0,
          lastUsedAt: null,
          uniqueSessions: 0,
          firstUsedAt: null,
        };
        bucket.count++;
        if (!bucket.lastUsedAt || ts > bucket.lastUsedAt) bucket.lastUsedAt = ts;
        if (!bucket.firstUsedAt || ts < bucket.firstUsedAt) bucket.firstUsedAt = ts;
        skillMap.set(m.skillId, bucket);

        let sessions = skillSessionMap.get(m.skillId);
        if (!sessions) {
          sessions = new Set();
          skillSessionMap.set(m.skillId, sessions);
        }
        sessions.add(sid);

        if (ts) {
          const dayKey = formatDateBucket(new Date(ts));
          if (dayKey in trend) trend[dayKey]++;
        }
      }
    }

    for (const [skillId, s] of skillMap) {
      s.uniqueSessions = skillSessionMap.get(skillId)?.size ?? 0;
    }

    // Top N 排序
    const allSkills = Array.from(skillMap.values()).sort((a, b) => b.count - a.count);
    const topSkills = allSkills.slice(0, topN).map((s, idx) => ({
      rank: idx + 1,
      skillId: s.skillId,
      count: s.count,
      uniqueSessions: s.uniqueSessions,
      lastUsedAt: s.lastUsedAt,
      firstUsedAt: s.firstUsedAt,
    }));

    // 链分析：检测同一会话中连续出现的技能组合
    const coOccurrence = new Map<string, number>();
    for (const sid of sessionIds) {
      const messages = parseSession(sid);
      const ids: string[] = [];
      for (const msg of messages) {
        const m = msg as any;
        if (m.skillId) {
          const ts = m.timestamp;
          const tsMs = ts ? new Date(ts).getTime() : 0;
          if (tsMs >= sinceMs) ids.push(m.skillId);
        }
      }
      // 滑动窗口：相邻 3 个技能
      for (let i = 0; i < ids.length - 1; i++) {
        const a = ids[i];
        const b = ids[i + 1];
        if (a === b) continue;
        const key = [a, b].sort().join('::');
        coOccurrence.set(key, (coOccurrence.get(key) ?? 0) + 1);
      }
    }

    const topCoOccurrence = Array.from(coOccurrence.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => {
        const [a, b] = key.split('::');
        return { skills: [a, b], count };
      });

    // 类别分布（按 user-skills 状态）
    const dbSkills = dbGetSkills();
    const skillStatusMap = new Map<string, string>();
    for (const s of dbSkills) skillStatusMap.set(s.id as string, (s.status as string) || 'available');

    const statusBreakdown = { active: 0, available: 0, disabled: 0, unknown: 0 };
    for (const s of allSkills) {
      const st = skillStatusMap.get(s.skillId) || 'unknown';
      if (st in statusBreakdown) (statusBreakdown as Record<string, number>)[st]++;
      else statusBreakdown.unknown++;
    }

    res.json({
      data: {
        days,
        total: allSkills.length,
        totalUses: allSkills.reduce((sum, s) => sum + s.count, 0),
        topSkills,
        trend: dayBuckets.map((d) => ({ date: d, count: trend[d] ?? 0 })),
        topCoOccurrence,
        statusBreakdown,
      },
    });
  } catch (e) {
    logger.error('[Skills] usage-analytics failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ============================================================================
// 技能健康度检查 API
// ============================================================================

interface SkillHealthItem {
  skillId: string;
  name: string;
  overallScore: number;
  checks: {
    metadata: { pass: boolean; score: number; issues: string[] };
    dependencies: { pass: boolean; score: number; issues: string[] };
    documentation: { pass: boolean; score: number; issues: string[] };
    security: { pass: boolean; score: number; issues: string[] };
  };
}

// GET /api/skills/health-check — 技能健康度检查
router.get('/skills/health-check', (_req: Request, res: Response) => {
  try {
    const scanned = scanWorkbuddySkills();
    const dbSkills = dbGetSkills();
    const dbStatusMap = new Map<string, string>();
    for (const s of dbSkills) dbStatusMap.set(s.id as string, (s.status as string) || 'available');

    const results: SkillHealthItem[] = [];

    for (const s of scanned) {
      const { frontmatter } = parseSkillMd(s.body);
      const issues = {
        metadata: [] as string[],
        dependencies: [] as string[],
        documentation: [] as string[],
        security: [] as string[],
      };

      // 元数据检查
      if (!frontmatter.name) issues.metadata.push('缺少 name 字段');
      if (!frontmatter.description) issues.metadata.push('缺少 description 字段');
      if (!frontmatter.version) issues.metadata.push('缺少 version 字段');
      if (!frontmatter.author && !frontmatter.maintainer) issues.metadata.push('缺少 author/maintainer 字段');
      const metadataScore = Math.max(0, 100 - issues.metadata.length * 25);

      // 依赖检查
      const depConfig: { dependsOn?: unknown[]; conflictsWith?: unknown[] } = {};
      try {
        if (frontmatter.dependencies) depConfig.dependsOn = JSON.parse(frontmatter.dependencies);
      } catch { issues.dependencies.push('dependencies 字段 JSON 格式错误'); }
      try {
        if (frontmatter.conflicts) depConfig.conflictsWith = JSON.parse(frontmatter.conflicts);
      } catch { issues.dependencies.push('conflicts 字段 JSON 格式错误'); }
      if (!depConfig.dependsOn && !depConfig.conflictsWith) {
        issues.dependencies.push('未声明任何依赖或冲突');
      }
      const depScore = issues.dependencies.length === 0 ? 100 : Math.max(0, 100 - issues.dependencies.length * 30);

      // 文档检查
      if (!frontmatter.description || frontmatter.description.length < 20) {
        issues.documentation.push('描述过短（建议 >= 20 字符）');
      }
      const hasExamples = s.body.includes('```') || s.body.includes('示例') || s.body.includes('Example');
      if (!hasExamples) issues.documentation.push('缺少代码示例');
      const docScore = Math.max(0, 100 - issues.documentation.length * 30);

      // 安全检查（简单启发式）
      const sensitivePatterns = ['password', 'secret', 'token', 'api_key', 'private_key'];
      const lowerBody = s.body.toLowerCase();
      for (const pat of sensitivePatterns) {
        if (lowerBody.includes(pat) && !lowerBody.includes('{{') && !lowerBody.includes('env.')) {
          issues.security.push(`可能包含硬编码敏感信息（${pat}）`);
        }
      }
      const secScore = issues.security.length === 0 ? 100 : Math.max(0, 100 - issues.security.length * 25);

      const overallScore = Math.round((metadataScore + depScore + docScore + secScore) / 4);

      results.push({
        skillId: s.dirName,
        name: s.name,
        overallScore,
        checks: {
          metadata: { pass: metadataScore >= 75, score: metadataScore, issues: issues.metadata },
          dependencies: { pass: depScore >= 75, score: depScore, issues: issues.dependencies },
          documentation: { pass: docScore >= 75, score: docScore, issues: issues.documentation },
          security: { pass: secScore >= 75, score: secScore, issues: issues.security },
        },
      });
    }

    // 汇总统计
    const summary = {
      total: results.length,
      healthy: results.filter((r) => r.overallScore >= 80).length,
      warning: results.filter((r) => r.overallScore >= 60 && r.overallScore < 80).length,
      critical: results.filter((r) => r.overallScore < 60).length,
      avgScore: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length) : 0,
    };

    res.json({ data: { summary, skills: results.sort((a, b) => a.overallScore - b.overallScore) } });
  } catch (e) {
    logger.error('[Skills] health-check failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ============================================================================
// 技能文档质量检查 API
// ============================================================================

// GET /api/skills/doc-quality-check — 批量文档质量检查
router.get('/skills/doc-quality-check', (_req: Request, res: Response) => {
  try {
    const scanned = scanWorkbuddySkills();
    const items = scanned
      .filter((s) => s.hasSkillMd)
      .map((s) => ({ skillId: s.dirName, skillName: s.name, content: s.body }));
    const results = batchAuditDocQuality(items);

    const summary = {
      total: results.length,
      excellent: results.filter((r) => r.level === 'excellent').length,
      good: results.filter((r) => r.level === 'good').length,
      fair: results.filter((r) => r.level === 'fair').length,
      poor: results.filter((r) => r.level === 'poor').length,
      avgScore: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length) : 0,
    };

    res.json({ data: { summary, skills: results.sort((a, b) => a.overallScore - b.overallScore) } });
  } catch (e) {
    logger.error('[Skills] doc-quality-check failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/skills/:id/doc-quality-check — 单个技能文档质量检查
router.get('/skills/:id/doc-quality-check', (req: Request, res: Response) => {
  try {
    const skillId = req.params.id;
    const scanned = scanWorkbuddySkills();
    const skill = scanned.find((s) => s.dirName === skillId);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    const result = auditDocQuality(skillId, skill.name, skill.body);
    res.json({ data: result });
  } catch (e) {
    logger.error('[Skills] doc-quality-check single failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ============================================================================
// 技能推荐引擎 API
// ============================================================================

// GET /api/skills/recommendations?skillId=xxx&topN=10&days=30
router.get('/skills/recommendations', (req: Request, res: Response) => {
  try {
    const skillId = req.query.skillId as string | undefined;
    const topN = Math.max(1, Math.min(50, parseInt(String(req.query.topN ?? '10'), 10) || 10));
    const days = Math.max(1, Math.min(90, parseInt(String(req.query.days ?? '30'), 10) || 30));

    const result = generateRecommendations(skillId, { topN, days });
    res.json({ data: result });
  } catch (e) {
    logger.error('[Skills] recommendations failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
