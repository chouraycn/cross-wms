import {
  createWorker,
  deleteWorker,
  findWorkerById,
  findWorkersByStatus,
  findWorkersByType,
  updateWorker,
  workerHeartbeat,
  claimTask as daoClaimTask,
  releaseTask as daoReleaseTask,
  completeTask as daoCompleteTask,
  failTask as daoFailTask,
  getAvailableTasks,
  getWorkerTasks,
  findTaskById,
  type WorkboardTask,
  type WorkboardWorker,
  type WorkerType,
  type WorkerStatus,
  type TaskStatus,
} from '../dao/workboardDao.js';
import { logger } from '../logger.js';

export type TaskAssignmentStrategy = 'round_robin' | 'priority' | 'load_balanced';

export interface WorkerProtocolOptions {
  heartbeatTimeoutMs?: number;
  heartbeatCheckIntervalMs?: number;
  assignmentStrategy?: TaskAssignmentStrategy;
  maxTasksPerWorker?: number;
}

export interface WorkerRegisterParams {
  name: string;
  type: WorkerType;
  status?: WorkerStatus;
  metadata?: Record<string, unknown>;
}

export interface WorkerProtocolEventMap {
  'worker:registered': (worker: WorkboardWorker) => void;
  'worker:unregistered': (workerId: string) => void;
  'worker:heartbeat': (worker: WorkboardWorker) => void;
  'worker:timeout': (worker: WorkboardWorker) => void;
  'task:claimed': (task: WorkboardTask, worker: WorkboardWorker) => void;
  'task:released': (task: WorkboardTask, worker: WorkboardWorker) => void;
  'task:completed': (task: WorkboardTask, worker: WorkboardWorker | undefined) => void;
  'task:failed': (task: WorkboardTask, worker: WorkboardWorker | undefined) => void;
  'task:assigned': (task: WorkboardTask, worker: WorkboardWorker) => void;
}

const DEFAULT_OPTIONS: Required<Omit<WorkerProtocolOptions, 'assignmentStrategy'>> & { assignmentStrategy: TaskAssignmentStrategy } = {
  heartbeatTimeoutMs: 60_000,
  heartbeatCheckIntervalMs: 10_000,
  assignmentStrategy: 'priority',
  maxTasksPerWorker: 5,
};

class WorkerProtocolEngine {
  private options: Required<WorkerProtocolOptions>;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private eventListeners = new Map<keyof WorkerProtocolEventMap, Set<WorkerProtocolEventMap[keyof WorkerProtocolEventMap]>>();
  private roundRobinIndex = new Map<WorkerType, number>();
  private started = false;

  constructor(options: WorkerProtocolOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    } as Required<WorkerProtocolOptions>;
  }

  configure(options: Partial<WorkerProtocolOptions>): void {
    this.options = { ...this.options, ...options } as Required<WorkerProtocolOptions>;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.checkTimer = setInterval(
      () => this.checkHeartbeats(),
      this.options.heartbeatCheckIntervalMs
    );
    logger.info('[WorkerProtocol] Engine started');
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    logger.info('[WorkerProtocol] Engine stopped');
  }

  on<K extends keyof WorkerProtocolEventMap>(
    event: K,
    handler: WorkerProtocolEventMap[K]
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler as WorkerProtocolEventMap[K]);
  }

  off<K extends keyof WorkerProtocolEventMap>(
    event: K,
    handler: WorkerProtocolEventMap[K]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(handler as WorkerProtocolEventMap[K]);
    }
  }

  private emit<K extends keyof WorkerProtocolEventMap>(
    event: K,
    ...args: Parameters<WorkerProtocolEventMap[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const handler of listeners) {
        try {
          (handler as (...args: unknown[]) => void)(...args);
        } catch (err) {
          logger.error(`[WorkerProtocol] Event handler error for ${event}:`, err);
        }
      }
    }
  }

  registerWorker(params: WorkerRegisterParams): WorkboardWorker {
    const worker = createWorker({
      name: params.name,
      type: params.type,
      status: params.status || 'idle',
    });
    logger.info(`[WorkerProtocol] Worker registered: ${worker.id} (${worker.name}, ${worker.type})`);
    this.emit('worker:registered', worker);
    return worker;
  }

  unregisterWorker(workerId: string): boolean {
    const worker = findWorkerById(workerId);
    if (!worker) return false;

    if (worker.currentTaskId) {
      try {
        daoReleaseTask(worker.currentTaskId, workerId);
      } catch {
        // ignore
      }
    }

    const success = deleteWorker(workerId);
    if (success) {
      logger.info(`[WorkerProtocol] Worker unregistered: ${workerId}`);
      this.emit('worker:unregistered', workerId);
    }
    return success;
  }

  heartbeat(workerId: string): WorkboardWorker | undefined {
    const worker = workerHeartbeat(workerId);
    if (worker) {
      this.emit('worker:heartbeat', worker);
    }
    return worker;
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    const timeoutMs = this.options.heartbeatTimeoutMs;

    const activeWorkers = [...findWorkersByStatus('idle'), ...findWorkersByStatus('busy')];

    for (const worker of activeWorkers) {
      if (!worker.lastHeartbeat) continue;

      const lastHeartbeatTime = new Date(worker.lastHeartbeat).getTime();
      if (now - lastHeartbeatTime > timeoutMs) {
        logger.warn(`[WorkerProtocol] Worker heartbeat timeout: ${worker.id}`);
        
        if (worker.currentTaskId) {
          try {
            daoFailTask(worker.currentTaskId, 'Worker heartbeat timeout');
          } catch {
            // ignore
          }
        }

        updateWorker(worker.id, { status: 'offline', currentTaskId: undefined });
        this.emit('worker:timeout', worker);
      }
    }
  }

  claimTask(taskId: string, workerId: string): WorkboardTask | undefined {
    const worker = findWorkerById(workerId);
    if (!worker) return undefined;
    if (worker.status === 'offline') return undefined;

    const workerTasks = getWorkerTasks(workerId, 'in_progress');
    if (workerTasks.length >= this.options.maxTasksPerWorker) {
      logger.warn(`[WorkerProtocol] Worker ${workerId} has reached max tasks limit`);
      return undefined;
    }

    const task = daoClaimTask(taskId, workerId);
    if (task) {
      logger.info(`[WorkerProtocol] Task ${taskId} claimed by worker ${workerId}`);
      this.emit('task:claimed', task, worker);
    }
    return task;
  }

  releaseTask(taskId: string, workerId: string): WorkboardTask | undefined {
    const worker = findWorkerById(workerId);
    const task = daoReleaseTask(taskId, workerId);
    if (task && worker) {
      logger.info(`[WorkerProtocol] Task ${taskId} released by worker ${workerId}`);
      this.emit('task:released', task, worker);
    }
    return task;
  }

  completeTask(taskId: string, result?: unknown): WorkboardTask | undefined {
    const task = daoCompleteTask(taskId, result);
    if (task) {
      const worker = task.assignedTo ? findWorkerById(task.assignedTo) : undefined;
      logger.info(`[WorkerProtocol] Task ${taskId} completed`);
      this.emit('task:completed', task, worker);
    }
    return task;
  }

  failTask(taskId: string, error: string): WorkboardTask | undefined {
    const task = daoFailTask(taskId, error);
    if (task) {
      const worker = task.assignedTo ? findWorkerById(task.assignedTo) : undefined;
      logger.info(`[WorkerProtocol] Task ${taskId} failed: ${error}`);
      this.emit('task:failed', task, worker);
    }
    return task;
  }

  getAvailableTasks(workerType?: WorkerType): WorkboardTask[] {
    return getAvailableTasks(workerType);
  }

  getWorkerTasks(workerId: string, status?: TaskStatus): WorkboardTask[] {
    return getWorkerTasks(workerId, status);
  }

  assignTask(taskId: string, workerType?: WorkerType): WorkboardTask | undefined {
    const task = findTaskById(taskId);
    if (!task) return undefined;
    if (task.status !== 'pending') return task;

    const worker = this.selectWorker(task, workerType);
    if (!worker) {
      logger.warn(`[WorkerProtocol] No available worker for task ${taskId}`);
      return undefined;
    }

    return this.claimTask(taskId, worker.id);
  }

  assignNextTask(workerId: string): WorkboardTask | undefined {
    const worker = findWorkerById(workerId);
    if (!worker) return undefined;
    if (worker.status === 'offline') return undefined;

    const workerTasks = getWorkerTasks(workerId, 'in_progress');
    if (workerTasks.length >= this.options.maxTasksPerWorker) {
      return undefined;
    }

    const availableTasks = getAvailableTasks(worker.type);
    if (availableTasks.length === 0) return undefined;

    return this.claimTask(availableTasks[0].id, workerId);
  }

  private selectWorker(task: WorkboardTask, workerType?: WorkerType): WorkboardWorker | undefined {
    const type = workerType || task.assignedTo ? undefined : 'agent';
    let availableWorkers: WorkboardWorker[];

    if (type) {
      availableWorkers = findWorkersByType(type as WorkerType).filter(w => w.status === 'idle');
    } else {
      availableWorkers = findWorkersByStatus('idle');
    }

    if (availableWorkers.length === 0) return undefined;

    switch (this.options.assignmentStrategy) {
      case 'round_robin':
        return this.selectRoundRobin(availableWorkers, type as WorkerType);
      case 'load_balanced':
        return this.selectLoadBalanced(availableWorkers);
      case 'priority':
      default:
        return this.selectPriority(availableWorkers, task);
    }
  }

  private selectRoundRobin(workers: WorkboardWorker[], workerType: WorkerType): WorkboardWorker {
    const currentIndex = this.roundRobinIndex.get(workerType) || 0;
    const worker = workers[currentIndex % workers.length];
    this.roundRobinIndex.set(workerType, (currentIndex + 1) % workers.length);
    return worker;
  }

  private selectLoadBalanced(workers: WorkboardWorker[]): WorkboardWorker {
    let minLoad = Infinity;
    let selected = workers[0];

    for (const worker of workers) {
      const tasks = getWorkerTasks(worker.id, 'in_progress');
      if (tasks.length < minLoad) {
        minLoad = tasks.length;
        selected = worker;
      }
    }

    return selected;
  }

  private selectPriority(workers: WorkboardWorker[], _task: WorkboardTask): WorkboardWorker {
    return workers[0];
  }

  getWorkerById(workerId: string): WorkboardWorker | undefined {
    return findWorkerById(workerId);
  }

  getWorkersByType(type: WorkerType): WorkboardWorker[] {
    return findWorkersByType(type);
  }

  getWorkersByStatus(status: WorkerStatus): WorkboardWorker[] {
    return findWorkersByStatus(status);
  }

  getAllWorkers(): WorkboardWorker[] {
    return findWorkersByStatus('idle')
      .concat(findWorkersByStatus('busy'))
      .concat(findWorkersByStatus('offline'));
  }

  getStats(): {
    totalWorkers: number;
    idleWorkers: number;
    busyWorkers: number;
    offlineWorkers: number;
    pendingTasks: number;
    inProgressTasks: number;
    completedTasks: number;
    failedTasks: number;
  } {
    const workers = this.getAllWorkers();
    const availableTasks = getAvailableTasks();
    
    let inProgressCount = 0;
    let completedCount = 0;
    let failedCount = 0;

    for (const worker of workers) {
      const tasks = getWorkerTasks(worker.id);
      for (const task of tasks) {
        if (task.status === 'in_progress') inProgressCount++;
        else if (task.status === 'done') completedCount++;
        else if (task.status === 'blocked') failedCount++;
      }
    }

    return {
      totalWorkers: workers.length,
      idleWorkers: workers.filter(w => w.status === 'idle').length,
      busyWorkers: workers.filter(w => w.status === 'busy').length,
      offlineWorkers: workers.filter(w => w.status === 'offline').length,
      pendingTasks: availableTasks.length,
      inProgressTasks: inProgressCount,
      completedTasks: completedCount,
      failedTasks: failedCount,
    };
  }
}

const WORKER_PROTOCOL_INSTANCE = new WorkerProtocolEngine();

export function getWorkerProtocolEngine(): WorkerProtocolEngine {
  return WORKER_PROTOCOL_INSTANCE;
}

export function startWorkerProtocolEngine(options?: WorkerProtocolOptions): void {
  if (options) {
    WORKER_PROTOCOL_INSTANCE.configure(options);
  }
  WORKER_PROTOCOL_INSTANCE.start();
}

export function stopWorkerProtocolEngine(): void {
  WORKER_PROTOCOL_INSTANCE.stop();
}
