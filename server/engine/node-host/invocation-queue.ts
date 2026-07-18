import { logger } from '../../logger.js';
import type { Invocation, ExecutionResult, InvocationQueueOptions, QueueStats } from './types.js';

type QueueItem = {
  invocation: Invocation;
  resolve: (result: ExecutionResult) => void;
  reject: (error: Error) => void;
  execute: () => Promise<ExecutionResult>;
};

export class InvocationQueue {
  private options: Required<InvocationQueueOptions>;
  private pending: QueueItem[] = [];
  private running = new Map<string, QueueItem>();
  private completedCount = 0;
  private failedCount = 0;
  private totalDurationMs = 0;
  private isProcessing = false;

  constructor(options: InvocationQueueOptions = {}) {
    this.options = {
      maxSize: options.maxSize ?? 1000,
      maxConcurrent: options.maxConcurrent ?? 5,
      defaultTimeoutMs: options.defaultTimeoutMs ?? 30_000,
    };
  }

  async enqueue(
    invocation: Omit<Invocation, 'id' | 'createdAt' | 'status'> & { id?: string; createdAt?: number },
    execute: () => Promise<ExecutionResult>,
  ): Promise<ExecutionResult> {
    if (this.pending.length >= this.options.maxSize) {
      throw new Error(`Queue is full (max size: ${this.options.maxSize})`);
    }

    const fullInvocation: Invocation = {
      id: invocation.id ?? `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      command: invocation.command,
      args: invocation.args,
      cwd: invocation.cwd,
      env: invocation.env,
      timeoutMs: invocation.timeoutMs ?? this.options.defaultTimeoutMs,
      stdin: invocation.stdin,
      priority: invocation.priority ?? 0,
      metadata: invocation.metadata,
      createdAt: invocation.createdAt ?? Date.now(),
      status: 'pending',
    };

    logger.debug(`[InvocationQueue] Enqueued: ${fullInvocation.id} (command: ${fullInvocation.command})`);

    return new Promise<ExecutionResult>((resolve, reject) => {
      const item: QueueItem = {
        invocation: fullInvocation,
        resolve,
        reject,
        execute,
      };

      this.insertByPriority(item);
      void this.processQueue();
    });
  }

  private insertByPriority(item: QueueItem): void {
    const priority = item.invocation.priority ?? 0;
    let index = this.pending.length;

    for (let i = 0; i < this.pending.length; i++) {
      const pendingPriority = this.pending[i].invocation.priority ?? 0;
      if (priority > pendingPriority) {
        index = i;
        break;
      }
    }

    this.pending.splice(index, 0, item);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.pending.length > 0 && this.running.size < this.options.maxConcurrent) {
        const item = this.pending.shift();
        if (!item) break;

        void this.runItem(item);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async runItem(item: QueueItem): Promise<void> {
    const { invocation, resolve, reject, execute } = item;
    invocation.status = 'running';
    invocation.startedAt = Date.now();
    this.running.set(invocation.id, item);

    logger.debug(`[InvocationQueue] Running: ${invocation.id}`);

    try {
      const result = await execute();
      invocation.status = result.success ? 'completed' : 'failed';
      invocation.completedAt = Date.now();

      if (result.success) {
        this.completedCount++;
      } else {
        this.failedCount++;
      }
      this.totalDurationMs += result.durationMs;

      resolve({ ...result, invocationId: invocation.id });
    } catch (err) {
      invocation.status = 'failed';
      invocation.completedAt = Date.now();
      this.failedCount++;

      const error = err instanceof Error ? err : new Error(String(err));
      reject(error);
    } finally {
      this.running.delete(invocation.id);
      void this.processQueue();
    }
  }

  cancel(invocationId: string): boolean {
    const pendingIndex = this.pending.findIndex(item => item.invocation.id === invocationId);
    if (pendingIndex !== -1) {
      const item = this.pending[pendingIndex];
      this.pending.splice(pendingIndex, 1);
      item.invocation.status = 'cancelled';
      item.reject(new Error(`Invocation cancelled: ${invocationId}`));
      logger.debug(`[InvocationQueue] Cancelled pending: ${invocationId}`);
      return true;
    }

    const running = this.running.get(invocationId);
    if (running) {
      running.invocation.status = 'cancelled';
      logger.debug(`[InvocationQueue] Cancelling running: ${invocationId}`);
      return true;
    }

    return false;
  }

  getStats(): QueueStats {
    const totalProcessed = this.completedCount + this.failedCount;
    return {
      pending: this.pending.length,
      running: this.running.size,
      completed: this.completedCount,
      failed: this.failedCount,
      totalProcessed,
      averageDurationMs: totalProcessed > 0 ? this.totalDurationMs / totalProcessed : 0,
    };
  }

  getPendingCount(): number {
    return this.pending.length;
  }

  getRunningCount(): number {
    return this.running.size;
  }

  clear(): void {
    for (const item of this.pending) {
      item.invocation.status = 'cancelled';
      item.reject(new Error('Queue cleared'));
    }
    this.pending = [];
    logger.debug('[InvocationQueue] Queue cleared');
  }

  getPendingInvocationIds(): string[] {
    return this.pending.map(item => item.invocation.id);
  }

  getRunningInvocationIds(): string[] {
    return Array.from(this.running.keys());
  }

  getMaxConcurrent(): number {
    return this.options.maxConcurrent;
  }

  setMaxConcurrent(max: number): void {
    this.options.maxConcurrent = Math.max(1, max);
    void this.processQueue();
  }

  getMaxSize(): number {
    return this.options.maxSize;
  }
}

export function createInvocationQueue(options?: InvocationQueueOptions): InvocationQueue {
  return new InvocationQueue(options);
}
