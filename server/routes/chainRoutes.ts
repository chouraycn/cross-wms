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
 */

import express from 'express';
import {
  createSkillChain as dbCreateChain,
  getSkillChain as dbGetChain,
  getAllSkillChains as dbGetAllChains,
  updateSkillChain as dbUpdateChain,
  deleteSkillChain as dbDeleteChain,
  createChainNode as dbCreateNode,
  getChainNodes as dbGetNodes,
  deleteChainNodes as dbDeleteNodes,
  createSkillExecution as dbCreateExecution,
  updateSkillExecution as dbUpdateExecution,
} from '../db.js';
import { executeChain, abortExecution } from '../services/chainExecutor.js';

const router = express.Router();

// ===================== 链 CRUD =====================

// GET /api/skill-chains — 获取所有链
router.get('/', (_req, res) => {
  res.json({ data: [] });
});

// GET /api/skill-chains/:id — 获取单个链
router.get('/:id', (req, res) => {
  res.json({ data: null });
});

// POST /api/skill-chains — 创建链
router.post('/', (req, res) => {
  try {
    const { name, description, failStrategy, nodes } = req.body;
    const chainId = `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // 创建链
    dbCreateChain({
      id: chainId,
      name: name || 'New Chain',
      description: description || '',
      failStrategy: failStrategy || 'stop',
      createdAt: now,
      updatedAt: now,
    });

    // 创建节点
    if (Array.isArray(nodes)) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        dbCreateNode({
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
        });
      }
    }

    const chain = dbGetChain(chainId);
    res.status(201).json({ data: chain });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// PUT /api/skill-chains/:id — 更新链
router.put('/:id', (req, res) => {
  try {
    const { name, description, failStrategy, nodes } = req.body;
    const now = new Date().toISOString();

    dbUpdateChain(req.params.id, {
      name,
      description,
      fail_strategy: failStrategy,
      updatedAt: now,
    });

    // 更新节点：先删除旧节点，再创建新节点
    dbDeleteNodes(req.params.id);
    if (Array.isArray(nodes)) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        dbCreateNode({
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
        });
      }
    }

    const chain = dbGetChain(req.params.id);
    res.json({ data: chain });
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

// POST /api/skill-chains/:id/duplicate — 复制链
router.post('/:id/duplicate', (req, res) => {
  try {
    const chain = dbGetChain(req.params.id);
    if (!chain) {
      res.status(404).json({ error: 'Chain not found' });
      return;
    }

    const newChainId = `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const chainData = chain as unknown as Record<string, unknown>;

    dbCreateChain({
      id: newChainId,
      name: `${chainData.name} (Copy)`,
      description: (chainData.description as string) || '',
      failStrategy: chainData.fail_strategy as string || 'stop',
      createdAt: now,
      updatedAt: now,
    });

    // 复制节点
    const nodes = dbGetNodes(req.params.id);
    for (const node of nodes) {
      const nodeData = node as unknown as Record<string, unknown>;
      dbCreateNode({
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        chainId: newChainId,
        skillId: nodeData.skill_id as string,
        skillName: nodeData.skill_name as string,
        skillIcon: nodeData.skill_icon as string,
        dataPassMode: nodeData.data_pass_mode as string,
        selectedFields: nodeData.selected_fields as string,
        customMapping: nodeData.custom_mapping as string,
        timeout: nodeData.timeout as number,
        retryCount: nodeData.retry_count as number,
        nodeOrder: nodeData.node_order as number,
      });
    }

    const newChain = dbGetChain(newChainId);
    res.json({ data: newChain });
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

export default router;
