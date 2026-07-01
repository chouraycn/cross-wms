/**
 * 工作流 API 路由
 * 提供工作流的 CRUD、执行和历史查询接口
 */

import { Router, type Request, type Response } from 'express';
import { workflowStore } from '../engine/workflow/store.js';
import { workflowExecutor } from '../engine/workflow/executor.js';
import { logger } from '../logger.js';
import type {
  Workflow,
  WorkflowExecution,
  WorkflowTemplate,
} from '../engine/workflow/types.js';

const router = Router();

// ===================== 工作流 CRUD =====================

/**
 * GET /api/workflow
 * 获取工作流列表
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const status = req.query.status as 'draft' | 'published' | 'archived' | undefined;
    const search = req.query.search as string | undefined;

    const workflows = workflowStore.getAll({ status, search });

    res.json({
      data: workflows,
      total: workflows.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 获取工作流列表失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/workflow/:id
 * 获取单个工作流详情
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const workflow = workflowStore.getById(id);

    if (!workflow) {
      return res.status(404).json({ error: '工作流不存在' });
    }

    res.json({ data: workflow });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 获取工作流详情失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/workflow
 * 创建新工作流
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, nodes, triggers, variables, metadata, status, createdBy } = req.body;

    if (!name || !nodes || !triggers) {
      return res.status(400).json({ error: '缺少必要参数：name, nodes, triggers' });
    }

    const workflow = workflowStore.create({
      name,
      description: description || '',
      nodes,
      triggers,
      variables: variables || [],
      metadata,
      status: status || 'draft',
      createdBy,
    });

    logger.info('[WorkflowAPI] 创建工作流:', { id: workflow.id, name: workflow.name });
    res.json({ data: workflow, message: '工作流创建成功' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 创建工作流失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * PUT /api/workflow/:id
 * 更新工作流
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const workflow = workflowStore.update(id, updates);

    if (!workflow) {
      return res.status(404).json({ error: '工作流不存在' });
    }

    logger.info('[WorkflowAPI] 更新工作流:', { id, version: workflow.version });
    res.json({ data: workflow, message: '工作流更新成功' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 更新工作流失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/workflow/:id
 * 删除工作流
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = workflowStore.delete(id);

    if (!success) {
      return res.status(404).json({ error: '工作流不存在' });
    }

    logger.info('[WorkflowAPI] 删除工作流:', { id });
    res.json({ success: true, message: '工作流已删除' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 删除工作流失败:', message);
    res.status(500).json({ error: message });
  }
});

// ===================== 执行相关 =====================

/**
 * POST /api/workflow/:id/execute
 * 执行工作流
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { triggerType = 'manual', triggeredBy, variables } = req.body;

    const workflow = workflowStore.getById(id);
    if (!workflow) {
      return res.status(404).json({ error: '工作流不存在' });
    }

    if (workflow.status !== 'published') {
      return res.status(400).json({ error: '只有已发布的工作流才能执行' });
    }

    const executionId = await workflowExecutor.execute(
      workflow,
      triggerType,
      triggeredBy,
      variables
    );

    logger.info('[WorkflowAPI] 执行工作流:', { workflowId: id, executionId });

    res.json({
      executionId,
      message: '工作流执行已启动',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 执行工作流失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/workflow/:id/history
 * 获取执行历史
 */
router.get('/:id/history', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const history = workflowStore.getExecutionHistory(id, limit, offset);

    res.json({
      data: history,
      total: history.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 获取执行历史失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/workflow/executions
 * 获取所有执行历史（全局）
 */
router.get('/executions', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const executions = workflowStore.getAllExecutions(limit, offset);

    res.json({
      data: executions,
      total: executions.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 获取全局执行历史失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/workflow/execution/:executionId
 * 获取单个执行记录详情
 */
router.get('/execution/:executionId', (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const execution = workflowExecutor.getExecution(executionId);

    if (!execution) {
      return res.status(404).json({ error: '执行记录不存在' });
    }

    res.json({ data: execution });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 获取执行详情失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/workflow/execution/:executionId/cancel
 * 取消执行
 */
router.post('/execution/:executionId/cancel', (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const success = workflowExecutor.cancelExecution(executionId);

    if (!success) {
      return res.status(400).json({ error: '无法取消执行，可能已完成或不存在' });
    }

    logger.info('[WorkflowAPI] 取消执行:', { executionId });
    res.json({ success: true, message: '执行已取消' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 取消执行失败:', message);
    res.status(500).json({ error: message });
  }
});

// ===================== 版本管理 =====================

/**
 * GET /api/workflow/:id/versions
 * 获取版本历史
 */
router.get('/:id/versions', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const versions = workflowStore.getVersionHistory(id);

    res.json({
      data: versions,
      total: versions.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 获取版本历史失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/workflow/:id/rollback
 * 回滚到指定版本
 */
router.post('/:id/rollback', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    if (!version) {
      return res.status(400).json({ error: '缺少版本号参数' });
    }

    const workflow = workflowStore.rollback(id, version);

    if (!workflow) {
      return res.status(404).json({ error: '版本不存在' });
    }

    logger.info('[WorkflowAPI] 回滚工作流:', { workflowId: id, targetVersion: version });
    res.json({ data: workflow, message: '回滚成功' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 回滚失败:', message);
    res.status(500).json({ error: message });
  }
});

// ===================== 模板相关 =====================

/**
 * GET /api/workflow/templates
 * 获取模板列表
 */
router.get('/templates', (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const templates = workflowStore.getTemplates(category);

    res.json({
      data: templates,
      total: templates.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 获取模板列表失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/workflow/templates
 * 创建模板
 */
router.post('/templates', (req: Request, res: Response) => {
  try {
    const { name, description, category, icon, tags, workflow } = req.body;

    if (!name || !category || !workflow) {
      return res.status(400).json({ error: '缺少必要参数：name, category, workflow' });
    }

    const template = workflowStore.createTemplate({
      name,
      description,
      category,
      icon,
      tags: tags || [],
      workflow,
    });

    logger.info('[WorkflowAPI] 创建模板:', { id: template.id, name: template.name });
    res.json({ data: template, message: '模板创建成功' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 创建模板失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/workflow/from-template
 * 从模板创建工作流
 */
router.post('/from-template', (req: Request, res: Response) => {
  try {
    const { templateId, name, createdBy } = req.body;

    if (!templateId || !name) {
      return res.status(400).json({ error: '缺少必要参数：templateId, name' });
    }

    const workflow = workflowStore.createFromTemplate(templateId, name, createdBy);

    if (!workflow) {
      return res.status(404).json({ error: '模板不存在' });
    }

    logger.info('[WorkflowAPI] 从模板创建工作流:', { templateId, workflowId: workflow.id });
    res.json({ data: workflow, message: '工作流创建成功' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 从模板创建失败:', message);
    res.status(500).json({ error: message });
  }
});

// ===================== 导入/导出 =====================

/**
 * GET /api/workflow/:id/export
 * 导出工作流
 */
router.get('/:id/export', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const jsonData = workflowStore.export(id);

    if (!jsonData) {
      return res.status(404).json({ error: '工作流不存在' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="workflow-${id}.json"`);
    res.send(jsonData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 导出失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/workflow/import
 * 导入工作流
 */
router.post('/import', (req: Request, res: Response) => {
  try {
    const { jsonData, createdBy } = req.body;

    if (!jsonData) {
      return res.status(400).json({ error: '缺少 JSON 数据' });
    }

    const workflow = workflowStore.import(jsonData, createdBy);

    if (!workflow) {
      return res.status(400).json({ error: '导入失败，JSON 格式无效' });
    }

    logger.info('[WorkflowAPI] 导入工作流:', { id: workflow.id, name: workflow.name });
    res.json({ data: workflow, message: '工作流导入成功' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[WorkflowAPI] 导入失败:', message);
    res.status(500).json({ error: message });
  }
});

export default router;