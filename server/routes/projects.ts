import { Router, type Request, type Response } from 'express';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectTasks,
} from '../dao/projectDao.js';

const router = Router();

/**
 * GET /api/projects
 * 获取所有项目列表
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const projects = getAllProjects();
    res.json({ data: projects, total: projects.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/projects
 * 创建新项目
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, status, category, agentId } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const project = createProject({
      name: String(name),
      description: description || '',
      status: status || 'active',
      category: category || 'custom',
      agent_id: agentId || null,
    });

    res.status(201).json(project);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/projects/:id
 * 获取单个项目详情
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const project = getProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * PUT /api/projects/:id
 * 更新项目
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = getProjectById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.status !== undefined) updateData.status = req.body.status;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.agentId !== undefined) updateData.agent_id = req.body.agentId || null;

    const updated = updateProject(req.params.id, updateData);
    if (!updated) {
      res.status(404).json({ error: 'Project not found after update' });
      return;
    }

    res.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/projects/:id
 * 删除项目
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const project = getProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const deleted = deleteProject(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/projects/:id/tasks
 * 获取项目下的任务列表
 */
router.get('/:id/tasks', (req: Request, res: Response) => {
  try {
    const project = getProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const tasks = getProjectTasks(req.params.id);
    res.json({ data: tasks, total: tasks.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

export default router;
