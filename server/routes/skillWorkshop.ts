/**
 * Skill Workshop 路由 — 提案与安装管理
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import {
  skillWorkshop,
  type ProposalFilter,
  type ProposalStatus,
  type ProposalType,
} from '../engine/skillWorkshop.js';
import { skillInstallManager, type SkillInstallSpec } from '../engine/skillInstall.js';

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

export default skillWorkshopRouter;
