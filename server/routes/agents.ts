import { Router } from 'express';
import { agentRegistry } from '../engine/agentRegistry.js';
import { agentIdentityManager } from '../engine/agentIdentity.js';
import { agentScenarioMatcher } from '../engine/agentScenarioMatcher.js';
import { laneManager } from '../engine/executionLanes.js';
import { logger } from '../logger.js';

const router = Router();

// 确保 AgentIdentityManager 已初始化
agentIdentityManager.initialize();
agentScenarioMatcher.initialize();

// ===================== Agent 身份管理 =====================

// GET /api/agents — 获取可用的 Agent 列表（兼容旧接口）
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

// GET /api/agents/identities — 获取所有 Agent 身份
router.get('/identities', (_req, res) => {
  try {
    const identities = agentIdentityManager.listAgents();
    res.json({ data: identities });
  } catch (e) {
    logger.error('[Agents API] 获取 Agent 身份列表失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/agents/identities/:id — 获取指定 Agent 身份
router.get('/identities/:id', (req, res) => {
  try {
    const identity = agentIdentityManager.getAgent(req.params.id);
    if (!identity) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ data: identity });
  } catch (e) {
    logger.error('[Agents API] 获取 Agent 身份失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/agents/identities — 创建 Agent 身份
router.post('/identities', (req, res) => {
  try {
    const config = req.body;
    if (!config.id || !config.name || !config.role) {
      res.status(400).json({ error: 'Missing required fields: id, name, role' });
      return;
    }
    agentIdentityManager.registerAgent(config);
    res.json({ data: agentIdentityManager.getAgent(config.id), message: 'Agent registered successfully' });
  } catch (e) {
    logger.error('[Agents API] 创建 Agent 身份失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// PUT /api/agents/identities/:id — 更新 Agent 身份
router.put('/identities/:id', (req, res) => {
  try {
    agentIdentityManager.updateAgent(req.params.id, req.body);
    res.json({ data: agentIdentityManager.getAgent(req.params.id), message: 'Agent updated successfully' });
  } catch (e) {
    logger.error('[Agents API] 更新 Agent 身份失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// DELETE /api/agents/identities/:id — 删除 Agent 身份
router.delete('/identities/:id', (req, res) => {
  try {
    agentIdentityManager.unregisterAgent(req.params.id);
    res.json({ message: 'Agent unregistered successfully' });
  } catch (e) {
    logger.error('[Agents API] 删除 Agent 身份失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/agents/scenarios — 获取所有场景
router.get('/scenarios', (_req, res) => {
  try {
    const scenarios = agentIdentityManager.listScenarios();
    res.json({ data: scenarios });
  } catch (e) {
    logger.error('[Agents API] 获取场景列表失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/agents/match-scenario — 根据消息匹配场景
router.post('/match-scenario', (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Missing message' });
      return;
    }
    const result = agentScenarioMatcher.matchScenario(message);
    res.json({ data: result });
  } catch (e) {
    logger.error('[Agents API] 场景匹配失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/agents/recommended — 获取推荐场景
router.get('/recommended', (_req, res) => {
  try {
    const recommendations = agentScenarioMatcher.getRecommendedScenarios();
    res.json({ data: recommendations });
  } catch (e) {
    logger.error('[Agents API] 获取推荐场景失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ===================== 执行车道 =====================

// GET /api/agents/lanes — 获取所有车道状态
router.get('/lanes', (_req, res) => {
  try {
    const status = laneManager.getAllLaneStatus();
    res.json({ data: status });
  } catch (e) {
    logger.error('[Agents API] 获取车道状态失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/agents/lanes/:lane — 获取指定车道状态
router.get('/lanes/:lane', (req, res) => {
  try {
    const status = laneManager.getLaneStatus(req.params.lane as any);
    res.json({ data: status });
  } catch (e) {
    logger.error('[Agents API] 获取车道状态失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/agents/tasks/:taskId — 获取任务详情
router.get('/tasks/:taskId', (req, res) => {
  try {
    const task = laneManager.getTask(req.params.taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ data: task });
  } catch (e) {
    logger.error('[Agents API] 获取任务详情失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/agents/tasks/:taskId/cancel — 取消任务
router.post('/tasks/:taskId/cancel', (req, res) => {
  try {
    laneManager.cancelTask(req.params.taskId);
    res.json({ message: 'Task cancelled successfully' });
  } catch (e) {
    logger.error('[Agents API] 取消任务失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
