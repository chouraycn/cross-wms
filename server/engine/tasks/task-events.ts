/**
 * tasks/task-events.ts — 事件系统
 *
 * 类型安全的发布订阅，支持：
 * - on / off / once
 * - 通配 '*' 监听全部
 * - 事件过滤器
 */
import { nowIso } from './types.js';
import type { TaskEvent, TaskEventType } from './types.js';

type Listener = (event: TaskEvent) => void;
type Filter = (event: TaskEvent) => boolean;

interface Subscription {
  type: TaskEventType | '*';
  listener: Listener;
  filter?: Filter;
  once: boolean;
}

export class TaskEventBus {
  private subs: Subscription[] = [];

  /** 订阅指定事件类型；'*' 订阅全部。返回取消订阅函数。 */
  on(type: TaskEventType | '*', listener: Listener, filter?: Filter): () => void {
    const sub: Subscription = { type, listener, filter, once: false };
    this.subs.push(sub);
    return () => this.off(listener, type);
  }

  /** 仅监听一次。 */
  once(type: TaskEventType | '*', listener: Listener, filter?: Filter): () => void {
    const sub: Subscription = { type, listener, filter, once: true };
    this.subs.push(sub);
    return () => this.off(listener, type);
  }

  /** 取消订阅（按 listener + 可选 type 匹配）。 */
  off(listener: Listener, type?: TaskEventType | '*'): void {
    this.subs = this.subs.filter(
      s => !(s.listener === listener && (type === undefined || s.type === type)),
    );
  }

  /** 移除所有订阅。 */
  clear(): void {
    this.subs = [];
  }

  /** 发布事件。返回实际派发到的订阅数。 */
  emit(event: TaskEvent): number;
  emit(type: TaskEventType, taskId: string, data?: unknown): number;
  emit(arg1: TaskEvent | TaskEventType, taskId?: string, data?: unknown): number {
    const event: TaskEvent =
      typeof arg1 === 'string'
        ? { type: arg1, taskId: taskId as string, timestamp: nowIso(), data }
        : arg1;
    let delivered = 0;
    const fired = new Set<Listener>();
    for (const sub of this.subs) {
      if (sub.type !== '*' && sub.type !== event.type) continue;
      if (sub.filter && !sub.filter(event)) continue;
      if (fired.has(sub.listener)) continue;
      fired.add(sub.listener);
      try {
        sub.listener(event);
      } catch {
        // 监听器异常不影响其他订阅者
      }
      delivered++;
    }
    // 移除 once 订阅
    if (delivered > 0) {
      this.subs = this.subs.filter(s => !(s.once && fired.has(s.listener)));
    }
    return delivered;
  }

  /** 当前订阅数。 */
  size(): number {
    return this.subs.length;
  }
}
