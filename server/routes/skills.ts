/**
 * User Skills + Builtin Status Patches + SKILL.md Scan Routes
 *
 * Mounted at /api so:
 * - GET/POST/PUT/DELETE /api/user-skills
 * - GET/PUT /api/builtin-status-patches
 * - DELETE /api/builtin-status-patches/:skillId
 * - GET /api/skill-md-scan
 */
import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getUserSkills as dbGetSkills,
  getUserSkillById as dbGetSkillById,
  createUserSkill as dbCreateSkill,
  updateUserSkill as dbUpdateSkill,
  deleteUserSkill as dbDeleteSkill,
  getBuiltinPatches as dbGetPatches,
  setBuiltinPatch as dbSetPatch,
  removeBuiltinPatch as dbRemovePatch,
} from '../db.js';

// ===================== SKILL.md 解析工具 =====================

/** SKILL.md 扫描结果 */
interface ScannedSkillMd {
  dirName: string;
  name: string;
  description: string;
  body: string;
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
function scanWorkbuddySkills(): ScannedSkillMd[] {
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

// GET /api/skill-md-scan — 扫描 ~/.workbuddy/skills/ 下的 SKILL.md 技能包
router.get('/skill-md-scan', (_req: Request, res: Response) => {
  const scanned = scanWorkbuddySkills();
  // 只返回有 SKILL.md 的目录
  const available = scanned.filter((s) => s.hasSkillMd);
  res.json({ data: available });
});

export default router;
