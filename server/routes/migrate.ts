/**
 * Migration Route — POST /api/migrate
 *
 * Accepts all localStorage data and writes it into SQLite in a single transaction.
 * Uses INSERT OR REPLACE for idempotency.
 *
 * After migration completes, automatically triggers security audit for all skills
 * in ~/.workbuddy/skills/ (async, non-blocking).
 */
import { Router, type Request, type Response } from 'express';
import { migrateData as dbMigrate } from '../dao/settings.js';
import { createSkillAudit, getLatestSkillAudit } from '../dao/chains.js';
import { auditSkillMd, generateMarkdownReport } from '../services/securityAuditor.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';

const router = Router();

/** 异步审计所有技能（后台执行，不阻塞响应） */
async function auditAllSkills(): Promise<void> {
  try {
    const skillsDir = AppPaths.skillsDir;
    if (!fs.existsSync(skillsDir)) return;

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    let count = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;

      const dirPath = path.join(skillsDir, entry.name);
      const upperPath = path.join(dirPath, 'SKILL.md');
      const lowerPath = path.join(dirPath, 'skill.md');

      let mdPath: string | null = null;
      if (fs.existsSync(upperPath)) {
        mdPath = upperPath;
      } else if (fs.existsSync(lowerPath)) {
        mdPath = lowerPath;
      }

      if (!mdPath) continue;

      try {
        const content = fs.readFileSync(mdPath, 'utf-8');
        const version = crypto.createHash('sha256').update(content).digest('hex');

        // 缓存检查：相同版本跳过
        const existing = getLatestSkillAudit(entry.name);
        if (existing && existing.skill_version === version) continue;

        const result = await auditSkillMd(mdPath, content);
        const id = uuidv4();
        const now = new Date().toISOString();

        createSkillAudit({
          id,
          skillId: entry.name,
          skillVersion: version,
          score: result.summary.score,
          level: result.summary.level,
          reportJson: JSON.stringify(result),
          reportMarkdown: generateMarkdownReport(result),
          triggeredBy: 'migration',
          createdAt: now,
        });

        count++;
      } catch (auditErr) {
        logger.error(`[Migrate] Audit failed for ${entry.name}:`, auditErr);
      }
    }

    logger.info(`[Migrate] Security audit completed: ${count} skills audited`);
  } catch (err) {
    logger.error('[Migrate] Security audit error:', err);
  }
}

// POST /api/migrate
router.post('/', (req: Request, res: Response) => {
  try {
    const result = dbMigrate(req.body);

    // 异步触发所有技能的安全审计（不阻塞响应）
    setImmediate(() => {
      auditAllSkills().catch((err) => {
        logger.error('[Migrate] Background audit failed:', err);
      });
    });

    res.json({ data: result });
  } catch (e) {
    logger.error('[Migrate API] Migration failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
