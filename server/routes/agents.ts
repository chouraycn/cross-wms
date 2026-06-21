import { Router } from 'express';
import { agentRegistry } from '../engine/agentRegistry.js';
import { logger } from '../logger.js';

const router = Router();

// GET /api/agents — 获取可用的 Agent 列表
router.get('/', (_req, res) => {
  try {
    const agents = agentRegistry.getAll().map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      description: a.capabilities.map(c => c.description).join('; '),
      capabilities: a.capabilities.map(c => ({
        name: c.name,
        description: c.description,
      })),
      status: a.status,
    }));
    res.json({ data: agents });
  } catch (e) {
    logger.error('[Agents API] 获取 Agent 列表失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
