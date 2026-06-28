/**
 * Reply Dispatcher
 * 回复调度器 - 统一管理回复的分发、延迟和类型模拟
 */

import type {
  ReplyPayload,
  ReplyDispatchKind,
  ReplyDispatchRuntimeInfo,
  ReplyDispatchOptions,
  ReplyDispatcher,
} from "./types.js";
import { getForegroundReplyFence } from "./foregroundReplyFence.js";
import { logger } from "../../logger.js";

const DEFAULT_HUMAN_DELAY_MIN_MS = 500;
const DEFAULT_HUMAN_DELAY_MAX_MS = 1500;
const DEFAULT_TYPING_SPEED_MIN = 30;
const DEFAULT_TYPING_SPEED_MAX = 80;

class ReplyDispatcherManager {
  private readonly dispatchers: ReplyDispatcher[] = [];
  private readonly dispatched = new Set<string>();

  register(dispatcher: ReplyDispatcher): void {
    this.dispatchers.push(dispatcher);
    this.dispatchers.sort((a, b) => b.priority - a.priority);
  }

  unregister(name: string): boolean {
    const index = this.dispatchers.findIndex((d) => d.name === name);
    if (index === -1) return false;
    this.dispatchers.splice(index, 1);
    return true;
  }

  async dispatch(
    payload: ReplyPayload,
    options: ReplyDispatchOptions = {},
  ): Promise<void> {
    if (this.dispatched.has(payload.id)) {
      return;
    }

    const kind: ReplyDispatchKind = options.kind ?? "normal";
    const info: ReplyDispatchRuntimeInfo = {
      kind,
      sessionKey: payload.metadata?.sessionKey,
      runId: payload.metadata?.runId,
    };

    // 静默回复直接分发，不加延迟
    if (options.silent || kind === "silent") {
      await this.dispatchToHandlers(payload, info);
      this.dispatched.add(payload.id);
      return;
    }

    // 前台回复栅栏检查
    if (options.fenceKey && options.fenceGeneration !== undefined) {
      const fence = getForegroundReplyFence(options.fenceKey);
      const shouldCancel = await fence.shouldCancelDelivery(options.fenceGeneration);
      if (shouldCancel) {
        this.dispatched.add(payload.id);
        return;
      }
    }

    // 模拟人类延迟
    const delayMs = options.delayMs ?? this.randomDelay();
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // 延迟后再次检查栅栏
    if (options.fenceKey && options.fenceGeneration !== undefined) {
      const fence = getForegroundReplyFence(options.fenceKey);
      const shouldCancel = await fence.shouldCancelDelivery(options.fenceGeneration);
      if (shouldCancel) {
        this.dispatched.add(payload.id);
        return;
      }
    }

    // 打字机效果
    if (options.typing?.enabled && payload.content.length > 0) {
      await this.dispatchWithTyping(payload, info, options.typing);
    } else {
      await this.dispatchToHandlers(payload, info);
    }

    // 标记可见回复
    if (options.fenceKey && options.fenceGeneration !== undefined && options.visible !== false) {
      if (payload.content && payload.content.trim().length > 0) {
        const fence = getForegroundReplyFence(options.fenceKey);
        fence.markVisibleSent(options.fenceGeneration);
      }
    }

    this.dispatched.add(payload.id);
  }

  private async dispatchWithTyping(
    payload: ReplyPayload,
    info: ReplyDispatchRuntimeInfo,
    typing: NonNullable<ReplyDispatchOptions["typing"]>,
  ): Promise<void> {
    const speed =
      (typing.minSpeed ?? DEFAULT_TYPING_SPEED_MIN) +
      Math.random() * ((typing.maxSpeed ?? DEFAULT_TYPING_SPEED_MAX) - (typing.minSpeed ?? DEFAULT_TYPING_SPEED_MIN));

    const charsPerTick = Math.max(1, Math.floor(speed / 10));
    const tickInterval = 100;

    for (let i = 0; i < payload.content.length; i += charsPerTick) {
      const chunk = payload.content.slice(0, i + charsPerTick);
      const partialPayload: ReplyPayload = {
        ...payload,
        content: chunk,
        metadata: { ...payload.metadata },
      };
      await this.dispatchToHandlers(partialPayload, info);
      await new Promise((resolve) => setTimeout(resolve, tickInterval));
    }
  }

  private async dispatchToHandlers(
    payload: ReplyPayload,
    info: ReplyDispatchRuntimeInfo,
  ): Promise<void> {
    for (const dispatcher of this.dispatchers) {
      try {
        if (dispatcher.canDispatch(payload)) {
          await dispatcher.dispatch(payload, info);
        }
      } catch (error) {
        logger.error(`[reply-dispatcher] Dispatcher ${dispatcher.name} failed:`, error);
      }
    }
  }

  private randomDelay(): number {
    return (
      DEFAULT_HUMAN_DELAY_MIN_MS +
      Math.random() * (DEFAULT_HUMAN_DELAY_MAX_MS - DEFAULT_HUMAN_DELAY_MIN_MS)
    );
  }

  clear(): void {
    this.dispatchers.length = 0;
    this.dispatched.clear();
  }

  getDispatcherCount(): number {
    return this.dispatchers.length;
  }

  markDispatched(id: string): void {
    this.dispatched.add(id);
  }

  isDispatched(id: string): boolean {
    return this.dispatched.has(id);
  }
}

const DISPATCHER_INSTANCE = new ReplyDispatcherManager();

export function getReplyDispatcher(): ReplyDispatcherManager {
  return DISPATCHER_INSTANCE;
}

export function registerReplyDispatcher(dispatcher: ReplyDispatcher): void {
  DISPATCHER_INSTANCE.register(dispatcher);
}

export function unregisterReplyDispatcher(name: string): boolean {
  return DISPATCHER_INSTANCE.unregister(name);
}

export async function dispatchReply(
  payload: ReplyPayload,
  options?: ReplyDispatchOptions,
): Promise<void> {
  await DISPATCHER_INSTANCE.dispatch(payload, options);
}

export function resetReplyDispatcherForTests(): void {
  DISPATCHER_INSTANCE.clear();
}

export type { ReplyDispatcherManager };
