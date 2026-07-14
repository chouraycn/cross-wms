import express from 'express';
import {
  findTasksBySession,
  findTaskById,
  findSubtasks,
  createTask as daoCreateTask,
  updateTask as daoUpdateTask,
  deleteTask as daoDeleteTask,
  claimTask as daoClaimTask,
  completeTask as daoCompleteTask,
  getBlockingTasks,
  getBlockedByTasks,
  findAllWorkers,
  findWorkerById,
  findWorkersByType,
  findWorkersByStatus,
  createWorker as daoCreateWorker,
  updateWorker as daoUpdateWorker,
  deleteWorker as daoDeleteWorker,
  workerHeartbeat,
  type TaskStatus,
  type TaskPriority,
  type WorkerType,
  type WorkerStatus,
} from '../dao/workboardDao.js';

const router = express.Router();

// ===================== Tasks =====================

router.get('/tasks/session/:sessionId', (req, res) => {
  try {
    const tasks = findTasksBySession(req.params.sessionId);
    res.json({ data: tasks });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/tasks/:id', (req, res) => {
  try {
    const task = findTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/tasks/:id/subtasks', (req, res) => {
  try {
    const subtasks = findSubtasks(req.params.id);
    res.json({ data: subtasks });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/tasks/:id/blocking', (req, res) => {
  try {
    const blocking = getBlockingTasks(req.params.id);
    res.json({ data: blocking });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/tasks/:id/blocked-by', (req, res) => {
  try {
    const blockedBy = getBlockedByTasks(req.params.id);
    res.json({ data: blockedBy });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/tasks', (req, res) => {
  try {
    const {
      sessionId,
      title,
      description,
      status,
      priority,
      orderIndex,
      parentTaskId,
      assignedTo,
      dependsOn,
    } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId 不能为空' });
    if (!title?.trim()) return res.status(400).json({ error: 'title 不能为空' });

    const task = daoCreateTask({
      sessionId,
      title: title.trim(),
      description,
      status: status as TaskStatus | undefined,
      priority: priority as TaskPriority | undefined,
      orderIndex,
      parentTaskId,
      assignedTo,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : undefined,
    });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/tasks/:id', (req, res) => {
  try {
    const {
      title,
      description,
      status,
      priority,
      orderIndex,
      parentTaskId,
      assignedTo,
      dependsOn,
    } = req.body;

    const task = daoUpdateTask(req.params.id, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status: status as TaskStatus }),
      ...(priority !== undefined && { priority: priority as TaskPriority }),
      ...(orderIndex !== undefined && { orderIndex }),
      ...(parentTaskId !== undefined && { parentTaskId }),
      ...(assignedTo !== undefined && { assignedTo }),
      ...(dependsOn !== undefined && { dependsOn: Array.isArray(dependsOn) ? dependsOn : [] }),
    });
    if (!task) return res.status(404).json({ error: '任务不存在' });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/tasks/:id', (req, res) => {
  try {
    const success = daoDeleteTask(req.params.id);
    if (!success) return res.status(404).json({ error: '任务不存在' });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/tasks/:id/claim', (req, res) => {
  try {
    const { workerId } = req.body;
    if (!workerId) return res.status(400).json({ error: 'workerId 不能为空' });

    const task = daoClaimTask(req.params.id, workerId);
    if (!task) return res.status(400).json({ error: '任务无法认领（状态不匹配或已分配给其他人）' });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/tasks/:id/complete', (req, res) => {
  try {
    const task = daoCompleteTask(req.params.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ===================== Workers =====================

router.get('/workers', (req, res) => {
  try {
    const { type, status } = req.query;
    let workers;
    if (type) {
      workers = findWorkersByType(type as WorkerType);
    } else if (status) {
      workers = findWorkersByStatus(status as WorkerStatus);
    } else {
      workers = findAllWorkers();
    }
    res.json({ data: workers });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/workers/:id', (req, res) => {
  try {
    const worker = findWorkerById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker 不存在' });
    res.json({ data: worker });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/workers', (req, res) => {
  try {
    const { name, type, status } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name 不能为空' });

    const worker = daoCreateWorker({
      name: name.trim(),
      type: type as WorkerType | undefined,
      status: status as WorkerStatus | undefined,
    });
    res.json({ data: worker });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/workers/:id', (req, res) => {
  try {
    const { name, type, status, currentTaskId } = req.body;

    const worker = daoUpdateWorker(req.params.id, {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type: type as WorkerType }),
      ...(status !== undefined && { status: status as WorkerStatus }),
      ...(currentTaskId !== undefined && { currentTaskId }),
    });
    if (!worker) return res.status(404).json({ error: 'Worker 不存在' });
    res.json({ data: worker });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/workers/:id', (req, res) => {
  try {
    const success = daoDeleteWorker(req.params.id);
    if (!success) return res.status(404).json({ error: 'Worker 不存在' });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/workers/:id/heartbeat', (req, res) => {
  try {
    const worker = workerHeartbeat(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker 不存在' });
    res.json({ data: worker });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
