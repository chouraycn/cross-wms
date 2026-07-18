/**
 * tasks/task-runtime.ts — 运行时
 *
 * 组合 store / lifecycle / scheduler / executor / events / monitor / recorder / hooks，
 * 提供一站式任务提交与执行 API。
 */
import { logger } from '../../logger.js';
import { TaskStore } from './task-store.js';
import { TaskLifecycle } from './task-lifecycle.js';
import { TaskScheduler } from './task-scheduler.js';
import { TaskEventBus } from './task-events.js';
import { TaskMonitor } from './task-monitor.js';
import { TaskRecorder } from './task-recorder.js';
import { TaskHooks } from './task-hooks.js';
import { CancellationRegistry, createToken } from './task-cancellation.js';
import { executeTask } from './task-executor.js';
import { DEFAULT_RETRY_POLICY } from './task-retry.js';
import { nowIso } from './types.js';
import type { Task, TaskHandler, TaskHandlerFactory, TaskOptions, TaskResult } from './types.js';

export interface RuntimeOptions {
  concurrency?: number;
  maxRecorderEntries?: number;
  maxMonitorHistory?: number;
}

export interface SubmitResult {
  taskId: string;
  task: Task;
}

export interface RunOutcome {
  taskId: string;
  result: TaskResult;
  output: unknown;
}

export class TaskRuntime {
  readonly store: TaskStore;
  readonly lifecycle: TaskLifecycle;
  readonly scheduler: TaskScheduler;
  readonly events: TaskEventBus;
  readonly monitor: TaskMonitor;
  readonly recorder: TaskRecorder;
  readonly hooks: TaskHooks;
  readonly cancellations = new CancellationRegistry();
  private handlers = new Map<string, TaskHandlerFactory>();
  private defaultHandler?: TaskHandlerFactory;
  private runningPromises = new Map<string, Promise<RunOutcome>>();

  constructor(opts: RuntimeOptions = {}) {
    this.store = new TaskStore();
    this.events = new TaskEventBus();
    this.lifecycle = new TaskLifecycle(this.store, this.events);
    this.scheduler = new TaskScheduler(this.store, {
      concurrency: opts.concurrency ?? 4,
      events: this.events,
    });
    this.monitor = new TaskMonitor(opts.maxMonitorHistory ?? 1000);
    this.recorder = new TaskRecorder(opts.maxRecorderEntries ?? 5000);
    this.hooks = new TaskHooks();
  }

  /** 注册按 name 匹配的 handler 工厂。 */
  registerHandler(name: string, factory: TaskHandlerFactory): void {
    this.handlers.set(name, factory);
  }

  /** 注册默认 handler 工厂（找不到具名时使用）。 */
  setDefaultHandler(factory: TaskHandlerFactory): void {
    this.defaultHandler = factory;
  }

  /** 提交任务：创建并入队。 */
  submit(opts: TaskOptions): SubmitResult {
    const task = this.store.create(opts);
    this.events.emit('task:created', task.id);
    this.scheduler.enqueue(task.id);
    return { taskId: task.id, task };
  }

  /** 取消任务（级联其子任务）。 */
  cancel(taskId: string, reason?: string): boolean {
    const token = this.cancellations.get(taskId);
    if (token) {
      this.cancellations.cancelCascade(taskId, reason);
      return true;
    }
    // 未运行也允许取消（pending/queued）
    const task = this.store.get(taskId);
    if (!task) return false;
    this.scheduler.dequeue(taskId);
    this.lifecycle.cancel(taskId, reason);
    return true;
  }

  /** 执行单个任务（使用注册的 handler）。 */
  async run(taskId: string): Promise<RunOutcome> {
    const task = this.store.get(taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    // 已在运行则返回同一 promise
    const existing = this.runningPromises.get(taskId);
    if (existing) return existing;

    const factory = this.handlers.get(task.name) ?? this.defaultHandler;
    const handler = factory ? factory(task) : null;
    if (!handler) {
      this.lifecycle.fail(taskId, `no handler for task: ${task.name}`);
      const t = this.store.get(taskId)!;
      return { taskId, result: t.result!, output: undefined };
    }

    this.lifecycle.start(taskId);
    this.events.emit('task:started', taskId);
    const token = this.cancellations.register(taskId, createToken());
    this.scheduler.markRunning(taskId);

    const promise = (async () => {
      try {
        await this.hooks.run('beforeStart', { task });
        const { result, output } = await executeTask(task, {
          handler,
          retryPolicy: DEFAULT_RETRY_POLICY,
          token,
        });
        this.applyResult(taskId, result);
        await this.hooks.run('afterComplete', { task: this.store.get(taskId)!, result });
        return { taskId, result, output };
      } catch (err) {
        // executeTask 不会抛出（内部捕获），此处为防御
        const error = err instanceof Error ? err : new Error(String(err));
        await this.hooks.run('onError', { task, error });
        this.lifecycle.fail(taskId, error.message);
        const t = this.store.get(taskId)!;
        return { taskId, result: t.result ?? { status: 'failed', error: error.message, durationMs: 0, attempts: 1, startedAt: nowIso(), completedAt: nowIso() }, output: undefined };
      } finally {
        this.scheduler.release(taskId);
        this.scheduler.rebuildGraph();
        this.cancellations.unregister(taskId);
        this.runningPromises.delete(taskId);
        const finalTask = this.store.get(taskId);
        if (finalTask) this.recorder.recordFinal(finalTask);
      }
    })();

    this.runningPromises.set(taskId, promise);
    return promise;
  }

  /** 推进一轮：挑选就绪任务并并发执行。返回本轮启动的任务 ID。 */
  async tick(): Promise<string[]> {
    const ready = this.scheduler.pickReady();
    if (ready.length === 0) return [];
    const ids = ready.map(t => t.id);
    await Promise.all(ids.map(id => this.run(id).catch(() => {})));
    return ids;
  }

  /** 阻塞直到所有任务结束（或超时）。 */
  async drain(timeoutMs = 30000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.scheduler.isIdle() || this.runningPromises.size > 0) {
      if (Date.now() > deadline) {
        logger.warn(`[Runtime] drain 超时 ${timeoutMs}ms`);
        return;
      }
      await this.tick();
      const pending = [...this.runningPromises.values()];
      if (pending.length > 0) await Promise.race([...pending, resolvedAfter(50)] as Promise<unknown>[]);
      else await resolvedAfter(10);
    }
  }

  /** 监控采样。 */
  snapshot(): ReturnType<TaskMonitor['sample']> {
    return this.monitor.sample(this.store.all());
  }

  /** 关闭：清空调度。 */
  shutdown(): void {
    this.scheduler.clear();
    this.events.clear();
  }

  private applyResult(taskId: string, result: TaskResult): void {
    const task = this.store.get(taskId);
    if (!task) return;
    task.result = result;
    if (result.status === 'completed') {
      this.lifecycle.complete(taskId);
      this.events.emit('task:completed', taskId, result);
    } else if (result.status === 'timeout') {
      this.lifecycle.timeout(taskId);
      this.events.emit('task:timeout', taskId, result);
    } else if (result.status === 'cancelled') {
      this.lifecycle.cancel(taskId);
      this.events.emit('task:cancelled', taskId, result);
    } else {
      this.lifecycle.fail(taskId, result.error ?? 'failed');
      this.events.emit('task:failed', taskId, result);
    }
  }
}

function resolvedAfter(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
