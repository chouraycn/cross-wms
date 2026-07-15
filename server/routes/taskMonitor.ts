import express from 'express';
import {
  findTodosBySession,
  findTodoById,
  createTodo as daoCreateTodo,
  updateTodo as daoUpdateTodo,
  deleteTodo as daoDeleteTodo,
  batchCreateTodos,
  updateTodoPriority,
  updateTodoOrder,
  deleteTodosBatch,
  reorderTodos,
  getTodoStats,
  findArtifactsBySession,
  findArtifactById,
  createArtifact as daoCreateArtifact,
  deleteArtifactsBatch,
  findToolCallsBySession,
  findToolCallById,
  getToolCallStats,
  retryToolCall,
  scheduleRetryForFailedToolCalls,
  getTrajectoryBySession,
  getSessionTraces,
  exportTrajectoryBundle,
  searchTrajectoryEvents,
  getTrajectoryStats,
  importTodos,
  exportTodos,
  exportAllTodos,
  exportArtifacts,
  exportToolCalls,
  exportTrajectory,
  createTaskFlow,
  findTaskFlowById,
  findTaskFlowsBySession,
  findTaskFlowSteps,
  startTaskFlow,
  completeTaskFlowStep,
  cancelTaskFlow,
  retryTaskFlow,
  type TodoStatus,
  type TodoPriority,
  type TodoSource,
  type ToolType,
  type ToolCallStatus,
} from '../dao/taskMonitorDao.js';
import {
  publishTodoCreated,
  publishTodoUpdated,
  publishTodoDeleted,
  publishArtifactCreated,
  publishArtifactDeleted,
  publishToolCallCreated,
  publishToolCallUpdated,
  publishTrajectoryEventCreated,
} from '../engine/taskMonitorEvents.js';
import { cleanupOldRecords, getCleanupStats } from '../utils/cleanup.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// ===================== Todo Items =====================

router.get('/todos/session/:sessionId', (req, res) => {
  try {
    const { status, priority, sortBy, sortOrder } = req.query;
    const todos = findTodosBySession(req.params.sessionId, {
      status: status as TodoStatus | undefined,
      priority: priority as TodoPriority | undefined,
      sortBy: sortBy as 'orderIndex' | 'createdAt' | 'updatedAt' | 'priority' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });
    res.json({ data: todos });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/todos/session/:sessionId/stats', (req, res) => {
  try {
    const stats = getTodoStats(req.params.sessionId);
    res.json({ data: stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/todos/:id/priority', (req, res) => {
  try {
    const { priority } = req.body;
    if (!priority) return res.status(400).json({ error: 'priority 不能为空' });
    const todo = updateTodoPriority(req.params.id, priority as TodoPriority);
    if (!todo) return res.status(404).json({ error: '待办不存在' });
    res.json({ data: todo });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/todos/:id/order', (req, res) => {
  try {
    const { orderIndex } = req.body;
    if (orderIndex === undefined || orderIndex === null) {
      return res.status(400).json({ error: 'orderIndex 不能为空' });
    }
    const todo = updateTodoOrder(req.params.id, Number(orderIndex));
    if (!todo) return res.status(404).json({ error: '待办不存在' });
    res.json({ data: todo });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/todos/batch', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids 数组不能为空' });
    }
    const count = deleteTodosBatch(ids);
    res.json({ data: { success: true, deletedCount: count } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/todos/reorder', (req, res) => {
  try {
    const { sessionId, orderedIds } = req.body;
    if (!sessionId || !Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'sessionId 和 orderedIds 数组不能为空' });
    }
    const count = reorderTodos(sessionId, orderedIds);
    res.json({ data: { success: true, updatedCount: count } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/todos', (req, res) => {
  try {
    const { sessionId, text, status, source, priority, orderIndex } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId 不能为空' });
    if (!text?.trim()) return res.status(400).json({ error: 'text 不能为空' });
    const todo = daoCreateTodo({
      sessionId,
      text: text.trim(),
      status: status as TodoStatus | undefined,
      source: source as TodoSource | undefined,
      priority: priority as TodoPriority | undefined,
      orderIndex,
    });
    publishTodoCreated(sessionId, todo);
    res.json({ data: todo });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/todos/batch', (req, res) => {
  try {
    const { sessionId, todos } = req.body;
    if (!sessionId || !Array.isArray(todos)) {
      return res.status(400).json({ error: 'sessionId 和 todos 数组不能为空' });
    }
    const created = batchCreateTodos(
      todos.map((t: { text: string; source?: TodoSource; priority?: TodoPriority }) => ({
        sessionId,
        text: t.text,
        source: t.source,
        priority: t.priority,
      }))
    );
    for (const todo of created) {
      publishTodoCreated(sessionId, todo);
    }
    res.json({ data: created });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/todos/:id', (req, res) => {
  try {
    const { text, status, priority, orderIndex } = req.body;
    const todo = daoUpdateTodo(req.params.id, {
      ...(text !== undefined && { text }),
      ...(status !== undefined && { status: status as TodoStatus }),
      ...(priority !== undefined && { priority: priority as TodoPriority }),
      ...(orderIndex !== undefined && { orderIndex }),
    });
    if (!todo) return res.status(404).json({ error: '待办不存在' });
    publishTodoUpdated(todo.sessionId, todo);
    res.json({ data: todo });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/todos/:id', (req, res) => {
  try {
    const todo = findTodoById(req.params.id);
    if (!todo) return res.status(404).json({ error: '待办不存在' });
    const success = daoDeleteTodo(req.params.id);
    if (!success) return res.status(404).json({ error: '待办不存在' });
    publishTodoDeleted(todo.sessionId, { id: req.params.id });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ===================== Artifacts =====================

router.get('/artifacts/session/:sessionId', (req, res) => {
  try {
    const { type, search, sortBy, sortOrder } = req.query;
    const artifacts = findArtifactsBySession(req.params.sessionId, {
      type: type as string | undefined,
      search: search as string | undefined,
      sortBy: sortBy as 'createdAt' | 'fileName' | 'fileSize' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });
    res.json({ data: artifacts });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/artifacts/batch', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids 数组不能为空' });
    }
    const artifacts = ids.map(id => findArtifactById(id)).filter(Boolean);
    const sessionId = artifacts[0]?.sessionId;
    const count = deleteArtifactsBatch(ids);
    if (sessionId) {
      for (const id of ids) {
        publishArtifactDeleted(sessionId, { id });
      }
    }
    res.json({ data: { success: true, deletedCount: count } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/artifacts/:id', (req, res) => {
  try {
    const artifact = findArtifactById(req.params.id);
    if (!artifact) return res.status(404).json({ error: '产物不存在' });
    res.json({ data: artifact });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/artifacts/:id/download', (req, res) => {
  try {
    const artifact = findArtifactById(req.params.id);
    if (!artifact) return res.status(404).json({ error: '产物不存在' });

    const filePath = artifact.filePath;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: '不能下载目录' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(artifact.fileName)}"`);
    res.setHeader('Content-Type', artifact.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(stat.size));

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/artifacts/:id/preview', (req, res) => {
  try {
    const artifact = findArtifactById(req.params.id);
    if (!artifact) return res.status(404).json({ error: '产物不存在' });

    const filePath = artifact.filePath;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const stat = fs.statSync(filePath);
    const maxPreviewSize = 5 * 1024 * 1024;

    if (stat.size > maxPreviewSize) {
      return res.status(413).json({ error: '文件过大，无法预览（>5MB）' });
    }

    const isText =
      artifact.mimeType.startsWith('text/') ||
      /\.(txt|md|json|csv|xml|html|css|js|ts|py|java|c|cpp|h|go|rs|yaml|yml|ini|conf|log)$/i.test(
        artifact.fileName
      );
    const isImage = artifact.mimeType.startsWith('image/');

    if (isText) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({
        data: {
          type: 'text',
          content,
          mimeType: artifact.mimeType,
          fileName: artifact.fileName,
          size: stat.size,
        },
      });
    } else if (isImage) {
      const content = fs.readFileSync(filePath).toString('base64');
      res.json({
        data: {
          type: 'image',
          content: `data:${artifact.mimeType};base64,${content}`,
          mimeType: artifact.mimeType,
          fileName: artifact.fileName,
          size: stat.size,
        },
      });
    } else {
      res.status(415).json({ error: '不支持预览该文件类型' });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/artifacts', (req, res) => {
  try {
    const { sessionId, messageId, fileName, filePath, fileSize, mimeType, description } =
      req.body;
    if (!sessionId || !messageId || !fileName || !filePath) {
      return res.status(400).json({ error: 'sessionId, messageId, fileName, filePath 不能为空' });
    }
    const artifact = daoCreateArtifact({
      sessionId,
      messageId,
      fileName,
      filePath,
      fileSize,
      mimeType,
      description,
    });
    publishArtifactCreated(sessionId, artifact);
    res.json({ data: artifact });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ===================== Tool Calls =====================

router.get('/tool-calls/session/:sessionId', (req, res) => {
  try {
    const { type, status, search, sortBy, sortOrder } = req.query;
    const toolCalls = findToolCallsBySession(req.params.sessionId, {
      type: type as ToolType | undefined,
      status: status as ToolCallStatus | undefined,
      search: search as string | undefined,
      sortBy: sortBy as 'startedAt' | 'completedAt' | 'duration' | 'toolName' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });
    res.json({ data: toolCalls });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/tool-calls/session/:sessionId/stats', (req, res) => {
  try {
    const stats = getToolCallStats(req.params.sessionId);
    res.json({ data: stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/tool-calls/:id', (req, res) => {
  try {
    const toolCall = findToolCallById(req.params.id);
    if (!toolCall) return res.status(404).json({ error: '工具调用不存在' });
    res.json({ data: toolCall });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ===================== Trajectory =====================

router.get('/trajectory/session/:sessionId', (req, res) => {
  try {
    const events = getTrajectoryBySession(req.params.sessionId);
    res.json({ data: events });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/trajectory/session/:sessionId/search', (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({ error: 'keyword 查询参数不能为空' });
    }
    const events = searchTrajectoryEvents(req.params.sessionId, keyword);
    res.json({ data: events });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/trajectory/session/:sessionId/stats', (req, res) => {
  try {
    const stats = getTrajectoryStats(req.params.sessionId);
    res.json({ data: stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/trajectory/session/:sessionId/traces', (req, res) => {
  try {
    const traces = getSessionTraces(req.params.sessionId);
    res.json({ data: traces });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/trajectory/export/:traceId', (req, res) => {
  try {
    const bundle = exportTrajectoryBundle(req.params.traceId);
    const fileName = `trajectory-${req.params.traceId.slice(0, 8)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ===================== Import / Export =====================

router.post('/todos/session/:sessionId/import', (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items 数组不能为空' });
    }
    const result = importTodos(req.params.sessionId, items);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/todos/session/:sessionId/export', (req, res) => {
  try {
    const result = exportTodos(req.params.sessionId);
    const fileName = `todos-${req.params.sessionId.slice(0, 8)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/todos/export/all', (req, res) => {
  try {
    const result = exportAllTodos();
    const fileName = `todos-all-${Date.now()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/artifacts/session/:sessionId/export', (req, res) => {
  try {
    const result = exportArtifacts(req.params.sessionId);
    const fileName = `artifacts-${req.params.sessionId.slice(0, 8)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/tool-calls/session/:sessionId/export', (req, res) => {
  try {
    const result = exportToolCalls(req.params.sessionId);
    const fileName = `tool-calls-${req.params.sessionId.slice(0, 8)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/trajectory/session/:sessionId/export', (req, res) => {
  try {
    const result = exportTrajectory(req.params.sessionId);
    const fileName = `trajectory-${req.params.sessionId.slice(0, 8)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ===================== Tool Call Retry =====================

router.post('/tool-calls/:id/retry', (req, res) => {
  try {
    const toolCall = retryToolCall(req.params.id);
    if (!toolCall) return res.status(404).json({ error: '工具调用不存在' });
    res.json({ data: toolCall });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/tool-calls/session/:sessionId/retry-all-failed', (req, res) => {
  try {
    const count = scheduleRetryForFailedToolCalls(req.params.sessionId);
    res.json({ data: { success: true, retriedCount: count } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ===================== Task Flow Orchestration =====================

router.post('/task-flows', (req, res) => {
  try {
    const { sessionId, name, description, syncMode, steps } = req.body;
    if (!sessionId || !name || !Array.isArray(steps)) {
      return res.status(400).json({ error: 'sessionId, name 和 steps 数组不能为空' });
    }
    const flow = createTaskFlow({ sessionId, name, description, syncMode, steps });
    res.json({ data: flow });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/task-flows/session/:sessionId', (req, res) => {
  try {
    const flows = findTaskFlowsBySession(req.params.sessionId);
    res.json({ data: flows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/task-flows/:id', (req, res) => {
  try {
    const flow = findTaskFlowById(req.params.id);
    if (!flow) return res.status(404).json({ error: '任务流不存在' });
    res.json({ data: flow });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/task-flows/:id/steps', (req, res) => {
  try {
    const steps = findTaskFlowSteps(req.params.id);
    res.json({ data: steps });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/task-flows/:id/start', (req, res) => {
  try {
    const flow = startTaskFlow(req.params.id);
    if (!flow) return res.status(400).json({ error: '无法启动任务流' });
    res.json({ data: flow });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/task-flows/steps/:stepId/complete', (req, res) => {
  try {
    const { success, result, error } = req.body;
    const step = completeTaskFlowStep(req.params.stepId, { success, result, error });
    if (!step) return res.status(404).json({ error: '步骤不存在' });
    res.json({ data: step });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/task-flows/:id/cancel', (req, res) => {
  try {
    const flow = cancelTaskFlow(req.params.id);
    if (!flow) return res.status(404).json({ error: '任务流不存在' });
    res.json({ data: flow });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/task-flows/:id/retry', (req, res) => {
  try {
    const flow = retryTaskFlow(req.params.id);
    if (!flow) return res.status(400).json({ error: '无法重试任务流' });
    res.json({ data: flow });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ===================== Cleanup =====================

router.get('/cleanup/stats', (req, res) => {
  try {
    const stats = getCleanupStats();
    res.json({ data: stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/cleanup/run', (req, res) => {
  try {
    cleanupOldRecords();
    const stats = getCleanupStats();
    res.json({ data: { success: true, remaining: stats } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
