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
  getSkillUsageStats as dbGetSkillUsageStats,
  getBatchSkillUsageStats as dbGetBatchSkillUsageStats,
  getLatestSkillAudit as dbGetLatestAudit,
  getSkillAuditHistory as dbGetAuditHistory,
  createSkillAudit as dbCreateAudit,
} from '../db.js';
import { auditSkillMd, generateMarkdownReport } from '../services/securityAuditor.js';

const crypto = require('crypto');

// ===================== SKILL.md 解析工具 =====================

/** SKILL.md 扫描结果（不含 body，仅元数据） */
interface ScannedSkillMd {
  dirName: string;
  name: string;
  description: string;
  body: string; // 扫描接口为空，read 接口返回完整内容
  hasSkillMd: boolean;
}

/** 解析 SKILL.md 的 YAML frontmatter + Markdown body */
function parseSkillMd(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatter: Record<string, string> = {};
  let body = '';

  // 匹配 --- 包裹的 YAML frontmatter
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    const fmText = fmMatch[1];
    body = fmMatch[2].trim();

    // 简易 YAML 解析（仅支持 key: value 单行格式）
    for (const line of fmText.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && val) {
          frontmatter[key] = val;
        }
      }
    }
  } else {
    body = content.trim();
  }

  return { frontmatter, body };
}

/** 扫描 ~/.workbuddy/skills/ 目录下的所有 SKILL.md */
export function scanWorkbuddySkills(): ScannedSkillMd[] {
  const skillsDir = path.join(os.homedir(), '.workbuddy', 'skills');
  const results: ScannedSkillMd[] = [];

  if (!fs.existsSync(skillsDir)) return results;

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

      let mdPath: string | null = null;
      if (fs.existsSync(skillMdPath)) {
        mdPath = skillMdPath;
      } else if (fs.existsSync(skillMdLowerPath)) {
        mdPath = skillMdLowerPath;
      }

      if (mdPath) {
        try {
          const content = fs.readFileSync(mdPath, 'utf-8');
          const { frontmatter, body } = parseSkillMd(content);
          results.push({
            dirName: entry.name,
            name: frontmatter.name || entry.name,
            description: frontmatter.description || body.slice(0, 100).replace(/[#*\n]/g, ' ').trim(),
            body,
            hasSkillMd: true,
          });
        } catch {
          // 读取失败跳过
        }
      } else {
        // 目录存在但无 SKILL.md
        results.push({
          dirName: entry.name,
          name: entry.name,
          description: '',
          body: '',
          hasSkillMd: false,
        });
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
    const data = dbCreateSkill(req.body);
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
  const skillsDir = path.join(os.homedir(), '.workbuddy', 'skills');
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

/** Jaccard 相似度计算 */
function jaccardSimilarity(setA: string[], setB: string[]): number {
  const a = new Set(setA.map(s => s.toLowerCase()));
  const b = new Set(setB.map(s => s.toLowerCase()));
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/** 检查两个技能是否冲突 */
function checkConflict(skillA: Record<string, unknown>, skillB: Record<string, unknown>): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // 1. 名称相似度
  const nameA = (skillA.name as string || '').toLowerCase();
  const nameB = (skillB.name as string || '').toLowerCase();
  if (nameA && nameB) {
    const nameSimilarity = jaccardSimilarity(nameA.split(''), nameB.split(''));
    if (nameSimilarity > 0.5) {
      score += nameSimilarity * 0.4;
      reasons.push(`名称相似度: ${(nameSimilarity * 100).toFixed(1)}%`);
    }
  }

  // 2. 触发词相似度
  const triggerA = (skillA.trigger as string || '').toLowerCase();
  const triggerB = (skillB.trigger as string || '').toLowerCase();
  if (triggerA && triggerB) {
    const triggerSimilarity = jaccardSimilarity(triggerA.split(' '), triggerB.split(' '));
    if (triggerSimilarity > 0.3) {
      score += triggerSimilarity * 0.3;
      reasons.push(`触发词相似度: ${(triggerSimilarity * 100).toFixed(1)}%`);
    }
  }

  // 3. 标签重叠度
  const tagsA = Array.isArray(skillA.tags) ? skillA.tags as string[] : [];
  const tagsB = Array.isArray(skillB.tags) ? skillB.tags as string[] : [];
  if (tagsA.length > 0 && tagsB.length > 0) {
    const tagSimilarity = jaccardSimilarity(tagsA, tagsB);
    if (tagSimilarity > 0.3) {
      score += tagSimilarity * 0.3;
      reasons.push(`标签重叠度: ${(tagSimilarity * 100).toFixed(1)}%`);
    }
  }

  return { score, reasons };
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
router.post('/skill-conflict-check', (req: Request, res: Response) => {
  const { name, trigger, tags } = req.body;

  if (!name && !trigger && (!tags || !Array.isArray(tags) || tags.length === 0)) {
    res.status(400).json({ error: 'At least one of name, trigger, or tags must be provided' });
    return;
  }

  // 获取所有现有技能
  const allSkills = dbGetSkills();

  // 计算与每个现有技能的冲突分数
  const conflicts: Array<{ skillId: string; skillName: string; score: number; reasons: string[] }> = [];
  const THRESHOLD = 0.4; // 冲突阈值

  for (const skill of allSkills) {
    const { score, reasons } = checkConflict(
      { name, trigger, tags },
      { name: skill.name, trigger: skill.trigger, tags: skill.tags }
    );

    if (score >= THRESHOLD) {
      conflicts.push({
        skillId: (skill as Record<string, unknown>).id as string,
        skillName: (skill as Record<string, unknown>).name as string,
        score,
        reasons,
      });
    }
  }

  // 按冲突分数降序排序
  conflicts.sort((a, b) => b.score - a.score);

  const isHighRisk = conflicts.length > 0 && conflicts[0].score >= 0.7;

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
    res.json({ data: audit || null });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/skill-audits/:skillId/history — 获取审查历史
router.get('/skill-audits/:skillId/history', (req: Request, res: Response) => {
  try {
    const history = dbGetAuditHistory(req.params.skillId);
    res.json({ data: history });
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

    // Resolve SKILL.md path
    let mdPath: string;
    if (skillPath && fs.existsSync(skillPath)) {
      mdPath = skillPath;
    } else {
      const skillsDir = path.join(os.homedir(), '.workbuddy', 'skills');
      const upperPath = path.join(skillsDir, skillId, 'SKILL.md');
      const lowerPath = path.join(skillsDir, skillId, 'skill.md');
      if (fs.existsSync(upperPath)) {
        mdPath = upperPath;
      } else if (fs.existsSync(lowerPath)) {
        mdPath = lowerPath;
      } else {
        res.status(404).json({ error: `SKILL.md not found for skill: ${skillId}` });
        return;
      }
    }

    const content = fs.readFileSync(mdPath, 'utf-8');
    const version = crypto.createHash('sha256').update(content).digest('hex');

    // Cache check: return existing audit if same version (unless force=true)
    if (!force) {
      const existing = dbGetLatestAudit(skillId);
      if (existing && existing.skill_version === version) {
        return res.json({ data: existing });
      }
    }

    // Run security audit
    const result = await auditSkillMd(mdPath, content);
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
    res.json({ data: audit });
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
    const skillsDir = path.join(os.homedir(), '.workbuddy', 'skills');

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

        const result = await auditSkillMd(mdPath, content);
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

// Backward-compatible aliases for old audit route paths
// GET /api/skills/:id/audit → same as /api/skill-audits/:id
router.get('/skills/:id/audit', (req: Request, res: Response) => {
  try {
    const audit = dbGetLatestAudit(req.params.id);
    res.json({ data: audit || null });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/skills/:id/audit-history → same as /api/skill-audits/:id/history
router.get('/skills/:id/audit-history', (req: Request, res: Response) => {
  try {
    const history = dbGetAuditHistory(req.params.id);
    res.json({ data: history });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/skills/:id/export — 导出技能为 ZIP
router.get('/skills/:id/export', async (req: Request, res: Response) => {
  try {
    const skillsDir = path.join(os.homedir(), '.workbuddy', 'skills');
    const skillDir = path.join(skillsDir, req.params.id);

    if (!fs.existsSync(skillDir)) {
      res.status(404).json({ error: 'Skill directory not found' });
      return;
    }

    // Try to get skill name from DB (user skills), fall back to directory name (built-in skills)
    let skillName = req.params.id;
    try {
      const skill = dbGetSkillById(req.params.id);
      if (skill && skill.name) skillName = skill.name;
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
      console.error('[Export] ZIP creation failed:', zipError);
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
          console.error('[Export] Failed to cleanup temp ZIP:', cleanupError);
        }
      }
      if (err) {
        console.error('[Export] Download failed:', err);
      }
    });
  } catch (e) {
    console.error('[Export] Export failed:', e);
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
    console.error('[Audit Export] Failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
