import { z } from 'zod';
import { logger } from '../../logger.js';

export const AsyncTaskStatusSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  agentId: z.string(),
  type: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout']),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  progress: z.number().default(0),
  total: z.number().default(0),
  message: z.string().default(''),
  result: z.unknown().optional(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AsyncTaskStatus = z.infer<typeof AsyncTaskStatusSchema>;

const taskStore = new Map<string, AsyncTaskStatus>();
const sessionTaskIndex = new Map<string, Set<string>>();

export function createAsyncTask(params: {
  taskId?: string;
  sessionId: string;
  agentId: string;
  type: string;
  total?: number;
  metadata?: Record<string, unknown>;
}): AsyncTaskStatus {
  const taskId = params.taskId ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();

  const task: AsyncTaskStatus = {
    taskId,
    sessionId: params.sessionId,
    agentId: params.agentId,
    type: params.type,
    status: 'pending',
    createdAt: now,
    progress: 0,
    total: params.total ?? 0,
    message: '',
    metadata: params.metadata ?? {},
  };

  const result = AsyncTaskStatusSchema.safeParse(task);
  if (!result.success) {
    throw new Error(`Invalid async task: ${result.error.message}`);
  }

  taskStore.set(taskId, result.data);

  if (!sessionTaskIndex.has(params.sessionId)) {
    sessionTaskIndex.set(params.sessionId, new Set());
  }
  sessionTaskIndex.get(params.sessionId)!.add(taskId);

  logger.debug(`[Agents:AsyncTask] Created task ${taskId} (${params.type}) for session ${params.sessionId}`);
  return result.data;
}

export function getAsyncTask(taskId: string): AsyncTaskStatus | undefined {
  return taskStore.get(taskId);
}

export function updateAsyncTask(taskId: string, updates: Partial<AsyncTaskStatus>): AsyncTaskStatus | undefined {
  const task = taskStore.get(taskId);
  if (!task) return undefined;

  const updated: AsyncTaskStatus = {
    ...task,
    ...updates,
    taskId,
  };

  taskStore.set(taskId, updated);
  return updated;
}

export function startAsyncTask(taskId: string): boolean {
  const task = taskStore.get(taskId);
  if (!task || task.status !== 'pending') return false;

  task.status = 'running';
  task.startedAt = Date.now();
  logger.debug(`[Agents:AsyncTask] Started task ${taskId}`);
  return true;
}

export function completeAsyncTask(taskId: string, result?: unknown, message?: string): boolean {
  const task = taskStore.get(taskId);
  if (!task || task.status !== 'running') return false;

  task.status = 'completed';
  task.completedAt = Date.now();
  task.progress = task.total > 0 ? task.total : task.progress;
  task.result = result;
  if (message) task.message = message;

  logger.debug(`[Agents:AsyncTask] Completed task ${taskId}`);
  return true;
}

export function failAsyncTask(taskId: string, error: string): boolean {
  const task = taskStore.get(taskId);
  if (!task) return false;

  task.status = 'failed';
  task.completedAt = Date.now();
  task.error = error;

  logger.debug(`[Agents:AsyncTask] Failed task ${taskId}: ${error}`);
  return true;
}

export function cancelAsyncTask(taskId: string): boolean {
  const task = taskStore.get(taskId);
  if (!task) return false;

  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    return false;
  }

  task.status = 'cancelled';
  task.completedAt = Date.now();

  logger.debug(`[Agents:AsyncTask] Cancelled task ${taskId}`);
  return true;
}

export function updateTaskProgress(taskId: string, progress: number, message?: string): boolean {
  const task = taskStore.get(taskId);
  if (!task || task.status !== 'running') return false;

  task.progress = progress;
  if (message) task.message = message;
  return true;
}

export function listSessionTasks(sessionId: string): AsyncTaskStatus[] {
  const taskIds = sessionTaskIndex.get(sessionId);
  if (!taskIds) return [];

  const tasks: AsyncTaskStatus[] = [];
  for (const taskId of taskIds) {
    const task = taskStore.get(taskId);
    if (task) tasks.push(task);
  }

  return tasks.sort((a, b) => b.createdAt - a.createdAt);
}

export function getActiveTaskCount(sessionId: string): number {
  const tasks = listSessionTasks(sessionId);
  return tasks.filter(t => t.status === 'pending' || t.status === 'running').length;
}

export function cleanupCompletedTasks(maxAgeMs: number = 86400000): number {
  const now = Date.now();
  let count = 0;

  for (const [taskId, task] of taskStore.entries()) {
    if (task.completedAt && now - task.completedAt > maxAgeMs) {
      taskStore.delete(taskId);
      
      const sessionTasks = sessionTaskIndex.get(task.sessionId);
      if (sessionTasks) {
        sessionTasks.delete(taskId);
        if (sessionTasks.size === 0) {
          sessionTaskIndex.delete(task.sessionId);
        }
      }
      
      count++;
    }
  }

  if (count > 0) {
    logger.debug(`[Agents:AsyncTask] Cleaned up ${count} completed tasks`);
  }
  return count;
}

export function clearAsyncTasks(): void {
  taskStore.clear();
  sessionTaskIndex.clear();
}

logger.debug('[Agents:SessionAsyncTaskStatus] Module loaded');
