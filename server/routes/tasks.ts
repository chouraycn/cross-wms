/**
 * Tasks routes — REST API for tasks
 * GET    /api/tasks           — 查询全部任务（?projectId= 可选过滤）
 * GET    /api/tasks/:id       — 查询单条任务
 * POST   /api/tasks           — 新建任务
 * PUT    /api/tasks/:id       — 更新任务
 * DELETE /api/tasks/:id       — 删除任务
 * POST   /api/tasks/migrate   — 从 localStorage 迁移任务
 *
 * 数据访问通过 engine/tasks/ 层调用，engine 层内部委托 dao/taskDao.js。
 */

import express from 'express';
import {
  findAllTasks,
  findTaskById,
  createTask as daoCreateTask,
  updateTask as daoUpdateTask,
  deleteTask as daoDeleteTask,
  migrateTasksToDb,
} from '../engine/tasks/index.js';
import { ok, fail, notFound, created, serverError, BizCode } from './_shared/respond.js';

const router = express.Router();

/** GET /api/tasks — 查询全部任务 */
router.get('/', (_req, res) => {
  try {
    const projectId = _req.query.projectId as string | undefined;
    const tasks = findAllTasks(projectId);
    return ok(res, tasks);
  } catch (err) {
    return serverError(res, (err as Error).message);
  }
});

/** GET /api/tasks/:id — 查询单条任务 */
router.get('/:id', (req, res) => {
  try {
    const task = findTaskById(req.params.id);
    if (!task) return notFound(res, '任务不存在');
    return ok(res, task);
  } catch (err) {
    return serverError(res, (err as Error).message);
  }
});

/** POST /api/tasks — 新建任务 */
router.post('/', (req, res) => {
  try {
    const { title, description, status, priority, assignee, tags, dueDate, projectId } = req.body;
    if (!title) return fail(res, BizCode.BAD_REQUEST, 'title 不能为空', 400);
    if (!projectId) return fail(res, BizCode.BAD_REQUEST, 'projectId 不能为空', 400);
    const task = daoCreateTask({
      title,
      description: description || '',
      status: status || 'todo',
      priority: priority || 'medium',
      assignee: assignee || '',
      tags: tags || [],
      dueDate: dueDate || '',
      projectId,
    });
    return ok(res, task);
  } catch (err) {
    return serverError(res, (err as Error).message);
  }
});

/** PUT /api/tasks/:id — 更新任务 */
router.put('/:id', (req, res) => {
  try {
    const { title, description, status, priority, assignee, tags, dueDate } = req.body;
    const task = daoUpdateTask(req.params.id, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assignee !== undefined && { assignee }),
      ...(tags !== undefined && { tags }),
      ...(dueDate !== undefined && { dueDate }),
    });
    if (!task) return notFound(res, '任务不存在');
    return ok(res, task);
  } catch (err) {
    return serverError(res, (err as Error).message);
  }
});

/** DELETE /api/tasks/:id — 删除任务 */
router.delete('/:id', (req, res) => {
  try {
    const ok = daoDeleteTask(req.params.id);
    if (!ok) return notFound(res, '任务不存在');
    return ok(res, { success: true });
  } catch (err) {
    return serverError(res, (err as Error).message);
  }
});

/** POST /api/tasks/migrate — 从 localStorage 迁移任务 */
router.post('/migrate', (req, res) => {
  try {
    const { tasks } = req.body;
    if (!Array.isArray(tasks)) return fail(res, BizCode.BAD_REQUEST, 'tasks 必须是数组', 400);
    const result = migrateTasksToDb(tasks);
    return ok(res, result);
  } catch (err) {
    return serverError(res, (err as Error).message);
  }
});

export default router;
