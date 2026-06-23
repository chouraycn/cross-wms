/**
 * Skill Chain Routes — 链 CRUD + 执行 API
 *
 * Mounted at /api/skill-chains and /api/chain-executions:
 * - GET    /api/skill-chains              — 获取所有链
 * - GET    /api/skill-chains/:id          — 获取单个链
 * - POST   /api/skill-chains              — 创建链
 * - PUT    /api/skill-chains/:id          — 更新链
 * - DELETE /api/skill-chains/:id          — 删除链
 * - POST   /api/skill-chains/:id/execute  — 执行链
 * - POST   /api/skill-chains/:id/duplicate — 复制链
 * - POST   /api/skill-chains/:id/abort    — 中止执行
 * - GET    /api/chain-executions/:execId  — 获取链执行当前状态
 */

import express from 'express';
import type { SkillChainRow, SkillChainNodeRow } from '../db.js';
import {
  getSkillChain as dbGetChain,
  getAllSkillChains as dbGetAllChains,
  deleteSkillChain as dbDeleteChain,
  getChainNodes as dbGetNodes,
  createSkillExecution as dbCreateExecution,
  updateSkillExecution as dbUpdateExecution,
  getSkillExecutionById,
  getSkillChainNameById,
  createChainWithNodes,
  updateChainWithNodes,
  duplicateChain,
} from '../dao/chains.js';
import { executeChain, abortExecution } from '../services/chainExecutor.js';

const router = express.Router();

// ===================== Helpers =====================

/** Transform snake_case DB row to camelCase for frontend */
function rowToChain(row: SkillChainRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    failStrategy: row.fail_strategy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nodeToJson(node: SkillChainNodeRow) {
  return {
    id: node.id,
    chainId: node.chain_id,
    skillId: node.skill_id,
    skillName: node.skill_name,
    skillIcon: node.skill_icon,
    dataPassMode: node.data_pass_mode,
    selectedFields: safeJsonParse(node.selected_fields),
    customMapping: safeJsonParse(node.custom_mapping),
    timeout: node.timeout,
    retryCount: node.retry_count,
    nodeOrder: node.node_order,
  };
}

function safeJsonParse(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return val; }
}

// ===================== 链 CRUD =====================

// GET /api/skill-chains — 获取所有链
router.get('/', (_req, res) => {
  try {
    const chains = dbGetAllChains();
    const enriched = chains.map((c) => {
      const nodes = dbGetNodes(c.id);
      return { ...rowToChain(c), nodes: nodes.map(nodeToJson) };
    });
    res.json({ data: enriched });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/skill-chains/:id — 获取单个链
router.get('/:id', (req, res) => {
  try {
    const chain = dbGetChain(req.params.id);
    if (!chain) {
      res.status(404).json({ error: 'Chain not found' });
      return;
    }
    const nodes = dbGetNodes(req.params.id);
    res.json({ data: { ...rowToChain(chain), nodes: nodes.map(nodeToJson) } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/skill-chains — 创建链（事务包裹）
router.post('/', (req, res) => {
  try {
    const { name, description, failStrategy, nodes } = req.body;
    const chainId = `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const nodeList = Array.isArray(nodes)
      ? nodes.map((node: any, i: number) => ({
          id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          chainId: chainId,
          skillId: node.skillId || '',
          skillName: node.skillName || '',
          skillIcon: node.skillIcon,
          dataPassMode: node.dataPassMode,
          selectedFields: node.selectedFields ? JSON.stringify(node.selectedFields) : undefined,
          customMapping: node.customMapping ? JSON.stringify(node.customMapping) : undefined,
          timeout: node.timeout,
          retryCount: node.retryCount,
          nodeOrder: i,
        }))
      : [];

    createChainWithNodes(
      {
        id: chainId,
        name: name || 'New Chain',
        description: description || '',
        failStrategy: failStrategy || 'stop',
        createdAt: now,
        updatedAt: now,
      },
      nodeList
    );

    const chain = dbGetChain(chainId);
    const chainNodes = dbGetNodes(chainId);
    res.status(201).json({ data: { ...rowToChain(chain!), nodes: chainNodes.map(nodeToJson) } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// PUT /api/skill-chains/:id — 更新链（事务包裹，防止删完崩溃丢节点）
router.put('/:id', (req, res) => {
  try {
    const { name, description, failStrategy, nodes } = req.body;
    const now = new Date().toISOString();

    const nodeList = Array.isArray(nodes)
      ? nodes.map((node: any, i: number) => ({
          id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          chainId: req.params.id,
          skillId: node.skillId || '',
          skillName: node.skillName || '',
          skillIcon: node.skillIcon,
          dataPassMode: node.dataPassMode,
          selectedFields: node.selectedFields ? JSON.stringify(node.selectedFields) : undefined,
          customMapping: node.customMapping ? JSON.stringify(node.customMapping) : undefined,
          timeout: node.timeout,
          retryCount: node.retryCount,
          nodeOrder: i,
        }))
      : [];

    updateChainWithNodes(
      req.params.id,
      {
        name,
        description,
        fail_strategy: failStrategy,
        updatedAt: now,
      },
      nodeList
    );

    const chain = dbGetChain(req.params.id);
    const chainNodes = dbGetNodes(req.params.id);
    res.json({ data: { ...rowToChain(chain!), nodes: chainNodes.map(nodeToJson) } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// DELETE /api/skill-chains/:id — 删除链
router.delete('/:id', (req, res) => {
  try {
    dbDeleteChain(req.params.id);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ===================== 链执行 =====================

// POST /api/skill-chains/:id/execute — 执行链（接入 chainExecutor）
router.post('/:id/execute', async (req, res) => {
  try {
    const result = await executeChain(req.params.id);
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ data: null, error: (e as Error).message });
  }
});

// POST /api/skill-chains/:id/duplicate — 复制链（事务包裹）
router.post('/:id/duplicate', (req, res) => {
  try {
    const chain = dbGetChain(req.params.id);
    if (!chain) {
      res.status(404).json({ error: 'Chain not found' });
      return;
    }

    const newChainId = `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newName = `${chain.name} (Copy)`;

    duplicateChain(req.params.id, newChainId, newName);

    const newChain = dbGetChain(newChainId);
    const newNodes = dbGetNodes(newChainId);
    res.json({ data: { ...rowToChain(newChain!), nodes: newNodes.map(nodeToJson) } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/skill-chains/:id/abort — 中止执行（接入 chainExecutor）
router.post('/:id/abort', (req, res) => {
  try {
    const { execId } = req.body;
    if (execId) {
      abortExecution(execId);
    }
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ===================== 链执行状态查询 =====================

// GET /api/chain-executions/:execId — 获取链执行当前状态
router.get('/:execId', (req, res) => {
  try {
    const execId = req.params.execId;

    // Query execution record from DB
    const execution = getSkillExecutionById(execId);

    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    // Get chain name
    const chainName = getSkillChainNameById(execution.chain_id);

    // Parse steps from JSON
    let steps: Array<Record<string, unknown>> = [];
    try {
      steps = JSON.parse(execution.steps || '[]');
    } catch {
      steps = [];
    }

    res.json({
      data: {
        executionId: execution.id,
        chainId: execution.chain_id,
        chainName: chainName || 'Unknown Chain',
        status: execution.status,
        steps,
        startedAt: execution.started_at,
        completedAt: execution.completed_at,
        duration: execution.duration,
      },
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
