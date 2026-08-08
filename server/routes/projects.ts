import { Router, type Request, type Response } from 'express';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectTasks,
} from '../dao/projectDao.js';
import { ok, fail, notFound, created, serverError, BizCode } from './_shared/respond.js';

const router = Router();

/**
 * GET /api/projects
 * 获取所有项目列表
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const projects = getAllProjects();
    return ok(res, { data: projects, total: projects.length });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
      return fail(res, BizCode.BAD_REQUEST, 'name is required', 400);
    }

    const project = createProject({
      name: String(name),
      description: description || '',
      status: status || 'active',
      category: category || 'custom',
      agent_id: agentId || null,
    });

    return created(res, project);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
      return notFound(res, 'Project not found');
    }
    return ok(res, project);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
      return notFound(res, 'Project not found');
    }

    const updateData: Record<string, any> = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.status !== undefined) updateData.status = req.body.status;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.agentId !== undefined) updateData.agent_id = req.body.agentId || null;

    const updated = updateProject(req.params.id, updateData);
    if (!updated) {
      return notFound(res, 'Project not found after update');
    }

    return ok(res, updated);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
      return notFound(res, 'Project not found');
    }

    const deleted = deleteProject(req.params.id);
    if (!deleted) {
      return notFound(res, 'Project not found');
    }

    return ok(res, { success: true });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
      return notFound(res, 'Project not found');
    }

    const tasks = getProjectTasks(req.params.id);
    return ok(res, { data: tasks, total: tasks.length });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
  }
});

export default router;
