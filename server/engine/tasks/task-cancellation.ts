/**
 * tasks/task-cancellation.ts — 取消处理
 *
 * - CancellationToken：协作式取消（AbortSignal 封装）
 * - 强制取消：标记 cancelled 并断言
 * - 级联取消：父取消时取消所有子 token
 */
import { logger } from '../../logger.js';

export class CancellationError extends Error {
  constructor(message = 'task cancelled') {
    super(message);
    this.name = 'CancellationError';
  }
}

export interface CancellationToken {
  readonly signal: AbortSignal;
  readonly cancelled: boolean;
  readonly reason?: string;
  cancel: (reason?: string) => void;
  /** 抛出 CancellationError（如已取消）。 */
  throwIfCancelled: () => void;
  /** 注册回调：取消时调用一次。 */
  onCancel: (cb: () => void) => () => void;
}

/** 创建独立的取消令牌。 */
export function createToken(): CancellationToken {
  const controller = new AbortController();
  let cancelled = false;
  let reason: string | undefined;
  const cbs = new Set<() => void>();
  controller.signal.addEventListener('abort', () => {
    cancelled = true;
    for (const cb of cbs) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
    cbs.clear();
  });
  return {
    get signal() {
      return controller.signal;
    },
    get cancelled() {
      return cancelled;
    },
    get reason() {
      return reason;
    },
    cancel(r?: string) {
      reason = r;
      controller.abort();
    },
    throwIfCancelled() {
      if (cancelled) throw new CancellationError(reason);
    },
    onCancel(cb) {
      if (cancelled) {
        cb();
        return () => {};
      }
      cbs.add(cb);
      return () => cbs.delete(cb);
    },
  };
}

/** 协作式取消检查点：若已取消抛出 CancellationError。 */
export function checkCancelled(token: CancellationToken): void {
  token.throwIfCancelled();
}

/**
 * 级联取消：parent 取消时，所有 child 一并取消。
 * child 取消不影响 parent。
 */
export function linkCancellation(parent: CancellationToken, child: CancellationToken): () => void {
  return parent.onCancel(() => {
    if (!child.cancelled) child.cancel(parent.reason ?? 'parent cancelled');
  });
}

/** 已取消令牌（单例，便于测试）。 */
export const CANCELLED_TOKEN: CancellationToken = (() => {
  const t = createToken();
  t.cancel('pre-cancelled');
  return t;
})();

/** 永不取消令牌。 */
export const NEVER_TOKEN: CancellationToken = createToken();

/**
 * 取消注册表：按 taskId 管理令牌，支持级联取消子任务。
 */
export class CancellationRegistry {
  private tokens = new Map<string, CancellationToken>();
  private children = new Map<string, Set<string>>();
  private unlinkers = new Map<string, Array<() => void>>();

  register(taskId: string, token?: CancellationToken): CancellationToken {
    const t = token ?? createToken();
    this.tokens.set(taskId, t);
    return t;
  }

  get(taskId: string): CancellationToken | null {
    return this.tokens.get(taskId) ?? null;
  }

  /** 建立父子关系：parent 取消时取消 child。 */
  link(parentId: string, childId: string): void {
    if (!this.children.has(parentId)) this.children.set(parentId, new Set());
    this.children.get(parentId)!.add(childId);
    const parent = this.tokens.get(parentId);
    const child = this.tokens.get(childId);
    if (parent && child) {
      const unlink = linkCancellation(parent, child);
      if (!this.unlinkers.has(childId)) this.unlinkers.set(childId, []);
      this.unlinkers.get(childId)!.push(unlink);
    }
  }

  /** 取消单个任务（不级联）。 */
  cancel(taskId: string, reason?: string): boolean {
    const t = this.tokens.get(taskId);
    if (!t || t.cancelled) return false;
    t.cancel(reason);
    logger.debug(`[Cancellation] cancel task=${taskId} reason=${reason ?? ''}`);
    return true;
  }

  /** 级联取消：取消该任务及其所有后代。 */
  cancelCascade(taskId: string, reason?: string): string[] {
    const cancelled: string[] = [];
    const stack = [taskId];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      if (this.cancel(cur, reason)) cancelled.push(cur);
      const kids = this.children.get(cur);
      if (kids) for (const k of kids) stack.push(k);
    }
    return cancelled;
  }

  /** 注销任务（清理）。 */
  unregister(taskId: string): void {
    this.tokens.delete(taskId);
    this.children.delete(taskId);
    const unlinks = this.unlinkers.get(taskId);
    if (unlinks) {
      for (const u of unlinks) u();
      this.unlinkers.delete(taskId);
    }
  }

  clear(): void {
    this.tokens.clear();
    this.children.clear();
    this.unlinkers.clear();
  }
}
