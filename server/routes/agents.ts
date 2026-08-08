import { Router } from 'express';
import { agentRegistry, agentIdentityManager, agentScenarioMatcher } from '../engine/agents/index.js';
import { laneManager } from '../engine/executionLanes.js';
import { logger } from '../logger.js';
import { ok, fail, notFound, created, serverError, BizCode } from './_shared/respond.js';

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
    return ok(res, agents);
  } catch (e) {
    logger.error('[Agents API] 获取 Agent 列表失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// GET /api/agents/identities — 获取所有 Agent 身份
router.get('/identities', (_req, res) => {
  try {
    const identities = agentIdentityManager.listAgents();
    return ok(res, identities);
  } catch (e) {
    logger.error('[Agents API] 获取 Agent 身份列表失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// GET /api/agents/identities/:id — 获取指定 Agent 身份
router.get('/identities/:id', (req, res) => {
  try {
    const identity = agentIdentityManager.getAgent(req.params.id);
    if (!identity) {
    return notFound(res, 'Agent not found');
    }
    return ok(res, identity);
  } catch (e) {
    logger.error('[Agents API] 获取 Agent 身份失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// POST /api/agents/identities — 创建 Agent 身份
router.post('/identities', (req, res) => {
  try {
    const config = req.body;
    if (!config.id || !config.name || !config.role) {
      return fail(res, BizCode.BAD_REQUEST, 'Missing required fields: id, name, role', 400);
    }
    agentIdentityManager.registerAgent(config);
    return ok(res, agentIdentityManager.getAgent(config.id), 'Agent registered successfully');
  } catch (e) {
    logger.error('[Agents API] 创建 Agent 身份失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// PUT /api/agents/identities/:id — 更新 Agent 身份
router.put('/identities/:id', (req, res) => {
  try {
    agentIdentityManager.updateAgent(req.params.id, req.body);
    return ok(res, agentIdentityManager.getAgent(req.params.id), 'Agent updated successfully');
  } catch (e) {
    logger.error('[Agents API] 更新 Agent 身份失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// DELETE /api/agents/identities/:id — 删除 Agent 身份
router.delete('/identities/:id', (req, res) => {
  try {
    agentIdentityManager.unregisterAgent(req.params.id);
    return ok(res, null, 'Agent unregistered successfully');
  } catch (e) {
    logger.error('[Agents API] 删除 Agent 身份失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// GET /api/agents/scenarios — 获取所有场景
router.get('/scenarios', (_req, res) => {
  try {
    const scenarios = agentIdentityManager.listScenarios();
    return ok(res, scenarios);
  } catch (e) {
    logger.error('[Agents API] 获取场景列表失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// POST /api/agents/match-scenario — 根据消息匹配场景
router.post('/match-scenario', (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return fail(res, BizCode.BAD_REQUEST, 'Missing message', 400);
    }
    const result = agentScenarioMatcher.matchScenario(message);
    return ok(res, result);
  } catch (e) {
    logger.error('[Agents API] 场景匹配失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// GET /api/agents/recommended — 获取推荐场景
router.get('/recommended', (_req, res) => {
  try {
    const recommendations = agentScenarioMatcher.getRecommendedScenarios();
    return ok(res, recommendations);
  } catch (e) {
    logger.error('[Agents API] 获取推荐场景失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// ===================== 执行车道 =====================

// GET /api/agents/lanes — 获取所有车道状态
router.get('/lanes', (_req, res) => {
  try {
    const status = laneManager.getAllLaneStatus();
    return ok(res, status);
  } catch (e) {
    logger.error('[Agents API] 获取车道状态失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// GET /api/agents/lanes/:lane — 获取指定车道状态
router.get('/lanes/:lane', (req, res) => {
  try {
    const status = laneManager.getLaneStatus(req.params.lane as unknown);
    return ok(res, status);
  } catch (e) {
    logger.error('[Agents API] 获取车道状态失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// GET /api/agents/tasks/:taskId — 获取任务详情
router.get('/tasks/:taskId', (req, res) => {
  try {
    const task = laneManager.getTask(req.params.taskId);
    if (!task) {
    return notFound(res, 'Task not found');
    }
    return ok(res, task);
  } catch (e) {
    logger.error('[Agents API] 获取任务详情失败:', e);
    return serverError(res, (e as Error).message);
  }
});

// POST /api/agents/tasks/:taskId/cancel — 取消任务
router.post('/tasks/:taskId/cancel', (req, res) => {
  try {
    laneManager.cancelTask(req.params.taskId);
    return ok(res, null, 'Task cancelled successfully');
  } catch (e) {
    logger.error('[Agents API] 取消任务失败:', e);
    return serverError(res, (e as Error).message);
  }
});

export default router;
