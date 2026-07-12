/**
 * Skill Workshop 路由 — 提案与安装管理
 */

import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../logger.js';
import {
  skillWorkshop,
  type ProposalFilter,
  type ProposalStatus,
  type ProposalType,
} from '../engine/skillWorkshop.js';
import { skillInstallManager, type SkillInstallSpec } from '../engine/skillInstall.js';
import { AppPaths, ensureDir } from '../config/appPaths.js';

// ===================== 工具函数 =====================

function asyncHandler<T>(
  fn: (req: Request, res: Response) => Promise<T>
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((err) => {
      logger.error('[Skill Workshop Route] Error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };
}

function validateRequired(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing or invalid field: ${field}`);
  }
}

// ===================== 路由 =====================

export const skillWorkshopRouter = Router();

/**
 * GET /api/skill-workshop/proposals
 * Query: ?status=pending&type=create&skillName=foo
 */
skillWorkshopRouter.get('/proposals', asyncHandler(async (req, res) => {
  const filter: ProposalFilter = {};
  if (typeof req.query.status === 'string') {
    filter.status = req.query.status as ProposalStatus;
  }
  if (typeof req.query.type === 'string') {
    filter.type = req.query.type as ProposalType;
  }
  if (typeof req.query.skillName === 'string') filter.skillName = req.query.skillName;

  const proposals = skillWorkshop.listProposals(filter);
  res.json({ proposals, count: proposals.length });
}));

/**
 * GET /api/skill-workshop/proposals/:id
 */
skillWorkshopRouter.get('/proposals/:id', asyncHandler(async (req, res) => {
  const proposal = skillWorkshop.getProposal(req.params.id);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposal not found' });
  }
  res.json({ proposal });
}));

/**
 * POST /api/skill-workshop/proposals
 * Body: { type, skillName, skillPath, content, origin? }
 */
skillWorkshopRouter.post('/proposals', asyncHandler(async (req, res) => {
  const { type, skillName, skillPath, content, origin } = req.body;
  validateRequired(type, 'type');
  validateRequired(skillName, 'skillName');
  validateRequired(content, 'content');

  if (type !== 'create' && type !== 'update') {
    return res.status(400).json({ error: 'type must be "create" or "update"' });
  }

  const proposal = skillWorkshop.createProposal({
    type,
    skillName,
    skillPath: skillPath || `~/.cdf-know-clow/skills/${skillName}`,
    content,
    origin,
  });

  res.status(201).json({ proposal });
}));

/**
 * POST /api/skill-workshop/proposals/:id/apply
 * Body: { reviewerId? }
 */
skillWorkshopRouter.post('/proposals/:id/apply', asyncHandler(async (req, res) => {
  const { reviewerId } = req.body;
  const result = skillWorkshop.applyProposal(req.params.id, reviewerId);
  res.json(result);
}));

/**
 * POST /api/skill-workshop/proposals/:id/reject
 * Body: { reason, reviewerId? }
 */
skillWorkshopRouter.post('/proposals/:id/reject', asyncHandler(async (req, res) => {
  const { reason, reviewerId } = req.body;
  validateRequired(reason, 'reason');
  const result = skillWorkshop.rejectProposal(req.params.id, reason, reviewerId);
  res.json(result);
}));

/**
 * POST /api/skill-workshop/proposals/:id/quarantine
 * Body: { reason }
 */
skillWorkshopRouter.post('/proposals/:id/quarantine', asyncHandler(async (req, res) => {
  const { reason } = req.body;
  validateRequired(reason, 'reason');
  const result = skillWorkshop.quarantineProposal(req.params.id, reason);
  res.json(result);
}));

/**
 * POST /api/skill-workshop/proposals/:id/rollback
 */
skillWorkshopRouter.post('/proposals/:id/rollback', asyncHandler(async (req, res) => {
  const result = skillWorkshop.rollbackProposal(req.params.id);
  res.json(result);
}));

/**
 * GET /api/skill-workshop/stats
 */
skillWorkshopRouter.get('/stats', asyncHandler(async (_req, res) => {
  res.json({ stats: skillWorkshop.getStats() });
}));

/**
 * POST /api/skill-workshop/install
 * Body: SkillInstallSpec
 */
skillWorkshopRouter.post('/install', asyncHandler(async (req, res) => {
  const spec: SkillInstallSpec = req.body;
  if (!spec || !spec.source) {
    return res.status(400).json({ error: 'Missing required field: source' });
  }

  // SSE 流式响应进度
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const result = await skillInstallManager.install(spec, (progress) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'result', result })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    })}\n\n`);
    res.end();
  }
}));

/**
 * POST /api/skill-workshop/install/cancel
 * Body: { installId }
 */
skillWorkshopRouter.post('/install/cancel', asyncHandler(async (req, res) => {
  const { installId } = req.body;
  validateRequired(installId, 'installId');
  const cancelled = skillInstallManager.cancelInstall(installId);
  res.json({ cancelled });
}));

/**
 * POST /api/skill-workshop/quick-create
 * Body: { skillName, description?, content, autoApply?, origin? }
 *
 * 快速创建 Skill 并可选自动应用。
 * - 若目标 Skill 已存在则为 update 类型提案
 * - autoApply=true 时自动应用并写入文件
 * - 创建后自动安全扫描，critical 级别风险会隔离
 */
skillWorkshopRouter.post('/quick-create', asyncHandler(async (req, res) => {
  const { skillName, description, content, autoApply, origin } = req.body;
  validateRequired(skillName, 'skillName');
  validateRequired(content, 'content');

  const skillsDir = AppPaths.skillsDir;
  const skillPath = path.join(skillsDir, String(skillName), 'SKILL.md');

  let type: 'create' | 'update' = 'create';
  let previousContent: string | undefined;
  let currentContentHash: string | undefined;

  if (fs.existsSync(skillPath)) {
    type = 'update';
    previousContent = fs.readFileSync(skillPath, 'utf-8');
    currentContentHash = crypto
      .createHash('sha256')
      .update(previousContent)
      .digest('hex')
      .slice(0, 16);
  }

  const proposal = skillWorkshop.createProposal({
    type,
    skillName: String(skillName),
    skillPath,
    content: String(content),
    origin,
    previousContent,
    currentContentHash,
  });

  if (proposal.status === 'quarantined') {
    return res.status(403).json({
      success: false,
      error: '提案因安全风险被隔离，请人工审核后再应用',
      proposal,
    });
  }

  const shouldApply = autoApply === true || autoApply === 'true';
  if (!shouldApply) {
    return res.status(201).json({
      success: true,
      action: 'create_proposal',
      description,
      proposal,
      message: '提案已创建，等待审批',
    });
  }

  try {
    const applied = skillWorkshop.applyProposal(proposal.id);
    const dir = path.dirname(skillPath);
    ensureDir(dir);
    fs.writeFileSync(skillPath, String(content), 'utf-8');

    logger.info(
      `[Skill Workshop] Quick create applied: ${skillName} -> ${skillPath}`,
    );

    res.status(201).json({
      success: true,
      action: 'create_and_apply',
      description,
      proposal: applied,
      skillPath,
    });
  } catch (applyErr) {
    res.status(400).json({
      success: false,
      error: `提案创建成功但应用失败：${applyErr instanceof Error ? applyErr.message : String(applyErr)}`,
      proposal,
    });
  }
}));

export default skillWorkshopRouter;
