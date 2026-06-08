/**
 * Tasks routes — REST API for tasks
 * GET    /api/tasks           — 查询全部任务（?projectId= 可选过滤）
 * GET    /api/tasks/:id       — 查询单条任务
 * POST   /api/tasks           — 新建任务
 * PUT    /api/tasks/:id       — 更新任务
 * DELETE /api/tasks/:id       — 删除任务
 * POST   /api/tasks/migrate   — 从 localStorage 迁移任务
 */

import express from 'express';
import {
  findAllTasks,
  findTaskById,
  createTask as daoCreateTask,
  updateTask as daoUpdateTask,
  deleteTask as daoDeleteTask,
  migrateTasks,
} from '../dao/taskDao.js';

const router = express.Router();

/** GET /api/tasks — 查询全部任务 */
router.get('/', (_req, res) => {
  try {
    const projectId = _req.query.projectId as string | undefined;
    const tasks = findAllTasks(projectId);
    res.json({ data: tasks });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/tasks/:id — 查询单条任务 */
router.get('/:id', (req, res) => {
  try {
    const task = findTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/tasks — 新建任务 */
router.post('/', (req, res) => {
  try {
    const { title, description, status, priority, assignee, tags, dueDate, projectId } = req.body;
    if (!title) return res.status(400).json({ error: 'title 不能为空' });
    if (!projectId) return res.status(400).json({ error: 'projectId 不能为空' });
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
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    if (!task) return res.status(404).json({ error: '任务不存在' });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** DELETE /api/tasks/:id — 删除任务 */
router.delete('/:id', (req, res) => {
  try {
    const ok = daoDeleteTask(req.params.id);
    if (!ok) return res.status(404).json({ error: '任务不存在' });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/tasks/migrate — 从 localStorage 迁移任务 */
router.post('/migrate', (req, res) => {
  try {
    const { tasks } = req.body;
    if (!Array.isArray(tasks)) return res.status(400).json({ error: 'tasks 必须是数组' });
    const result = migrateTasks(tasks);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
