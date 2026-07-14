import type { GatewayMethodContext } from './types.js';
import { registerGatewayMethod } from './methodRegistry.js';
import {
  getWorkerProtocolEngine,
  type WorkerRegisterParams,
  type TaskAssignmentStrategy,
} from '../engine/workerProtocol.js';
import {
  findTasksBySession,
  findTaskById,
  findSubtasks,
  createTask,
  updateTask,
  deleteTask,
  getBlockingTasks,
  getBlockedByTasks,
  findWorkerById,
  findWorkersByType,
  findWorkersByStatus,
  findAllWorkers,
  type TaskStatus,
  type TaskPriority,
  type WorkerType,
  type WorkerStatus,
} from '../dao/workboardDao.js';

async function workboardTasksList(params: unknown, _ctx: GatewayMethodContext) {
  const { sessionId } = params as { sessionId: string };
  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  const tasks = findTasksBySession(sessionId);
  return { tasks, total: tasks.length };
}

async function workboardTaskGet(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  if (!id) {
    throw new Error('id is required');
  }
  const task = findTaskById(id);
  if (!task) {
    throw new Error('Task not found');
  }
  return task;
}

async function workboardTaskCreate(params: unknown, _ctx: GatewayMethodContext) {
  const data = params as {
    sessionId: string;
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    orderIndex?: number;
    parentTaskId?: string;
    assignedTo?: string;
    dependsOn?: string[];
  };
  if (!data.sessionId) {
    throw new Error('sessionId is required');
  }
  if (!data.title?.trim()) {
    throw new Error('title is required');
  }
  const task = createTask(data);
  return task;
}

async function workboardTaskUpdate(params: unknown, _ctx: GatewayMethodContext) {
  const { id, ...data } = params as {
    id: string;
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    orderIndex?: number;
    parentTaskId?: string;
    assignedTo?: string;
    dependsOn?: string[];
    result?: unknown;
    error?: string;
  };
  if (!id) {
    throw new Error('id is required');
  }
  const task = updateTask(id, data);
  if (!task) {
    throw new Error('Task not found');
  }
  return task;
}

async function workboardTaskDelete(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  if (!id) {
    throw new Error('id is required');
  }
  const success = deleteTask(id);
  return { success };
}

async function workboardTaskSubtasks(params: unknown, _ctx: GatewayMethodContext) {
  const { parentTaskId } = params as { parentTaskId: string };
  if (!parentTaskId) {
    throw new Error('parentTaskId is required');
  }
  const subtasks = findSubtasks(parentTaskId);
  return { subtasks, total: subtasks.length };
}

async function workboardTaskBlocking(params: unknown, _ctx: GatewayMethodContext) {
  const { taskId } = params as { taskId: string };
  if (!taskId) {
    throw new Error('taskId is required');
  }
  const tasks = getBlockingTasks(taskId);
  return { tasks, total: tasks.length };
}

async function workboardTaskBlockedBy(params: unknown, _ctx: GatewayMethodContext) {
  const { taskId } = params as { taskId: string };
  if (!taskId) {
    throw new Error('taskId is required');
  }
  const tasks = getBlockedByTasks(taskId);
  return { tasks, total: tasks.length };
}

async function workboardTaskClaim(params: unknown, _ctx: GatewayMethodContext) {
  const { taskId, workerId } = params as { taskId: string; workerId: string };
  if (!taskId) {
    throw new Error('taskId is required');
  }
  if (!workerId) {
    throw new Error('workerId is required');
  }
  const engine = getWorkerProtocolEngine();
  const task = engine.claimTask(taskId, workerId);
  if (!task) {
    throw new Error('Failed to claim task');
  }
  return task;
}

async function workboardTaskRelease(params: unknown, _ctx: GatewayMethodContext) {
  const { taskId, workerId } = params as { taskId: string; workerId: string };
  if (!taskId) {
    throw new Error('taskId is required');
  }
  if (!workerId) {
    throw new Error('workerId is required');
  }
  const engine = getWorkerProtocolEngine();
  const task = engine.releaseTask(taskId, workerId);
  if (!task) {
    throw new Error('Failed to release task');
  }
  return task;
}

async function workboardTaskComplete(params: unknown, _ctx: GatewayMethodContext) {
  const { taskId, result } = params as { taskId: string; result?: unknown };
  if (!taskId) {
    throw new Error('taskId is required');
  }
  const engine = getWorkerProtocolEngine();
  const task = engine.completeTask(taskId, result);
  if (!task) {
    throw new Error('Failed to complete task');
  }
  return task;
}

async function workboardTaskFail(params: unknown, _ctx: GatewayMethodContext) {
  const { taskId, error } = params as { taskId: string; error: string };
  if (!taskId) {
    throw new Error('taskId is required');
  }
  if (!error) {
    throw new Error('error is required');
  }
  const engine = getWorkerProtocolEngine();
  const task = engine.failTask(taskId, error);
  if (!task) {
    throw new Error('Failed to fail task');
  }
  return task;
}

async function workboardTasksAvailable(params: unknown, _ctx: GatewayMethodContext) {
  const { workerType } = params as { workerType?: WorkerType };
  const engine = getWorkerProtocolEngine();
  const tasks = engine.getAvailableTasks(workerType);
  return { tasks, total: tasks.length };
}

async function workboardTaskAssign(params: unknown, _ctx: GatewayMethodContext) {
  const { taskId, workerType } = params as { taskId: string; workerType?: WorkerType };
  if (!taskId) {
    throw new Error('taskId is required');
  }
  const engine = getWorkerProtocolEngine();
  const task = engine.assignTask(taskId, workerType);
  if (!task) {
    throw new Error('Failed to assign task - no available workers');
  }
  return task;
}

async function workboardWorkersList(params: unknown, _ctx: GatewayMethodContext) {
  const { type, status } = params as { type?: WorkerType; status?: WorkerStatus };
  let workers;
  if (type) {
    workers = findWorkersByType(type);
  } else if (status) {
    workers = findWorkersByStatus(status);
  } else {
    workers = findAllWorkers();
  }
  return { workers, total: workers.length };
}

async function workboardWorkerGet(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  if (!id) {
    throw new Error('id is required');
  }
  const worker = findWorkerById(id);
  if (!worker) {
    throw new Error('Worker not found');
  }
  return worker;
}

async function workboardWorkerRegister(params: unknown, _ctx: GatewayMethodContext) {
  const data = params as WorkerRegisterParams;
  if (!data.name?.trim()) {
    throw new Error('name is required');
  }
  if (!data.type) {
    throw new Error('type is required');
  }
  const engine = getWorkerProtocolEngine();
  const worker = engine.registerWorker(data);
  return worker;
}

async function workboardWorkerUnregister(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  if (!id) {
    throw new Error('id is required');
  }
  const engine = getWorkerProtocolEngine();
  const success = engine.unregisterWorker(id);
  return { success };
}

async function workboardWorkerHeartbeat(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  if (!id) {
    throw new Error('id is required');
  }
  const engine = getWorkerProtocolEngine();
  const worker = engine.heartbeat(id);
  if (!worker) {
    throw new Error('Worker not found');
  }
  return worker;
}

async function workboardWorkerTasks(params: unknown, _ctx: GatewayMethodContext) {
  const { workerId, status } = params as { workerId: string; status?: TaskStatus };
  if (!workerId) {
    throw new Error('workerId is required');
  }
  const engine = getWorkerProtocolEngine();
  const tasks = engine.getWorkerTasks(workerId, status);
  return { tasks, total: tasks.length };
}

async function workboardWorkerAssignNext(params: unknown, _ctx: GatewayMethodContext) {
  const { workerId } = params as { workerId: string };
  if (!workerId) {
    throw new Error('workerId is required');
  }
  const engine = getWorkerProtocolEngine();
  const task = engine.assignNextTask(workerId);
  if (!task) {
    throw new Error('No available tasks to assign');
  }
  return task;
}

async function workboardStats(_params: unknown, _ctx: GatewayMethodContext) {
  const engine = getWorkerProtocolEngine();
  return engine.getStats();
}

async function workboardConfigure(params: unknown, _ctx: GatewayMethodContext) {
  const options = params as {
    heartbeatTimeoutMs?: number;
    heartbeatCheckIntervalMs?: number;
    assignmentStrategy?: TaskAssignmentStrategy;
    maxTasksPerWorker?: number;
  };
  const engine = getWorkerProtocolEngine();
  engine.configure(options);
  return { success: true };
}

export function registerWorkboardMethods(): void {
  registerGatewayMethod('workboard.tasks.list', workboardTasksList);
  registerGatewayMethod('workboard.tasks.get', workboardTaskGet);
  registerGatewayMethod('workboard.tasks.create', workboardTaskCreate);
  registerGatewayMethod('workboard.tasks.update', workboardTaskUpdate);
  registerGatewayMethod('workboard.tasks.delete', workboardTaskDelete);
  registerGatewayMethod('workboard.tasks.subtasks', workboardTaskSubtasks);
  registerGatewayMethod('workboard.tasks.blocking', workboardTaskBlocking);
  registerGatewayMethod('workboard.tasks.blockedBy', workboardTaskBlockedBy);
  registerGatewayMethod('workboard.tasks.available', workboardTasksAvailable);
  registerGatewayMethod('workboard.tasks.assign', workboardTaskAssign);

  registerGatewayMethod('workboard.task.claim', workboardTaskClaim);
  registerGatewayMethod('workboard.task.release', workboardTaskRelease);
  registerGatewayMethod('workboard.task.complete', workboardTaskComplete);
  registerGatewayMethod('workboard.task.fail', workboardTaskFail);

  registerGatewayMethod('workboard.workers.list', workboardWorkersList);
  registerGatewayMethod('workboard.workers.get', workboardWorkerGet);
  registerGatewayMethod('workboard.workers.register', workboardWorkerRegister);
  registerGatewayMethod('workboard.workers.unregister', workboardWorkerUnregister);
  registerGatewayMethod('workboard.workers.heartbeat', workboardWorkerHeartbeat);
  registerGatewayMethod('workboard.workers.tasks', workboardWorkerTasks);
  registerGatewayMethod('workboard.workers.assignNext', workboardWorkerAssignNext);

  registerGatewayMethod('workboard.stats', workboardStats);
  registerGatewayMethod('workboard.configure', workboardConfigure);
}
