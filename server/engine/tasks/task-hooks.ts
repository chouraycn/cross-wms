/**
 * tasks/task-hooks.ts — 任务钩子
 *
 * 在生命周期关键点插入同步/异步钩子，按注册顺序串行执行。
 * 钩子抛错不影响主流程（仅记录），但会标记 hasError。
 */
import { logger } from '../../logger.js';
import type { TaskHookContext, TaskHookFn, TaskHookName } from './types.js';

export class TaskHooks {
  private hooks = new Map<TaskHookName, TaskHookFn[]>();

  /** 注册钩子，返回取消注册函数。 */
  on(name: TaskHookName, fn: TaskHookFn): () => void {
    if (!this.hooks.has(name)) this.hooks.set(name, []);
    this.hooks.get(name)!.push(fn);
    return () => {
      const arr = this.hooks.get(name);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  /** 移除指定钩子。 */
  off(name: TaskHookName, fn: TaskHookFn): void {
    const arr = this.hooks.get(name);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }

  /** 是否有该钩子。 */
  has(name: TaskHookName): boolean {
    return (this.hooks.get(name)?.length ?? 0) > 0;
  }

  /** 串行执行钩子；返回是否全部成功。 */
  async run(name: TaskHookName, ctx: TaskHookContext): Promise<boolean> {
    const arr = this.hooks.get(name);
    if (!arr || arr.length === 0) return true;
    for (const fn of arr) {
      try {
        await fn(ctx);
      } catch (err) {
        logger.warn(`[TaskHooks] ${name} 钩子异常:`, err instanceof Error ? err.message : String(err));
        return false;
      }
    }
    return true;
  }

  /** 清空全部钩子。 */
  clear(): void {
    this.hooks.clear();
  }

  /** 某事件的钩子数量。 */
  count(name: TaskHookName): number {
    return this.hooks.get(name)?.length ?? 0;
  }
}
