/**
 * Session Actor Queue
 * 会话参与者队列 - 确保每个会话的请求串行执行
 */

type ActorOperation<T> = () => Promise<T>;

interface QueuedActor {
  key: string;
  operation: ActorOperation<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export class SessionActorQueue {
  private readonly queuesByActor = new Map<string, QueuedActor[]>();
  private readonly runningActors = new Set<string>();

  /**
   * 执行会话参与者操作，确保同一会话的操作串行执行
   */
  run<T>(actorKey: string, operation: ActorOperation<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queued: QueuedActor = {
        key: actorKey,
        operation: operation as ActorOperation<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject: reject,
      };

      if (!this.runningActors.has(actorKey)) {
        this.startExecution(queued);
      } else {
        const queue = this.queuesByActor.get(actorKey) || [];
        queue.push(queued);
        this.queuesByActor.set(actorKey, queue);
      }
    });
  }

  private async startExecution(queued: QueuedActor): Promise<void> {
    const { key, operation, resolve, reject } = queued;
    this.runningActors.add(key);

    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.runningActors.delete(key);
      this.dequeueNext(key);
    }
  }

  private dequeueNext(actorKey: string): void {
    const queue = this.queuesByActor.get(actorKey);
    if (!queue || queue.length === 0) {
      this.queuesByActor.delete(actorKey);
      return;
    }

    const next = queue.shift();
    if (next) {
      this.startExecution(next);
    }
  }

  /**
   * 获取指定会话参与者的待执行操作数量
   */
  getPendingCount(actorKey: string): number {
    return this.queuesByActor.get(actorKey)?.length || 0;
  }

  /**
   * 获取所有待执行操作总数
   */
  getTotalPendingCount(): number {
    let total = 0;
    for (const queue of Array.from(this.queuesByActor.values())) {
      total += queue.length;
    }
    return total;
  }

  /**
   * 检查指定会话参与者是否正在运行
   */
  isRunning(actorKey: string): boolean {
    return this.runningActors.has(actorKey);
  }

  /**
   * 清除所有队列（用于测试）
   */
  clear(): void {
    this.queuesByActor.clear();
    this.runningActors.clear();
  }
}
