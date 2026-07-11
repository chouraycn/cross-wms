import EventEmitter from 'eventemitter3';
import type { PluginHookCapability, PluginHookContext, PluginHookResult, HookRunOptions, HookRunnerLogger } from './types';

const DEFAULT_VOID_HOOK_TIMEOUT_MS = 30_000;
const DEFAULT_MODIFYING_HOOK_TIMEOUT_MS = 15_000;

export type HookMergeStrategy = 'first' | 'last' | 'concat' | 'merge';

export type HookRegistration<T = unknown> = {
  event: string;
  handler: (payload: T, ctx?: { sessionId?: string }) => Promise<unknown> | unknown;
  priority?: number;
  mergeStrategy?: HookMergeStrategy;
};

export interface HookRunnerEvents {
  hook_registered: [event: string];
  hook_unregistered: [event: string];
  hook_error: [event: string, error: Error];
}

type ModifyingHookPolicy<TResult> = {
  mergeResults?: (
    accumulated: TResult | undefined,
    next: TResult,
    registration: PluginHookCapability,
  ) => TResult;
  mergeNullResults?: boolean;
  shouldStop?: (result: TResult) => boolean;
  terminalLabel?: string;
};

export class HookRunner extends EventEmitter<HookRunnerEvents> {
  private hooks: Map<string, PluginHookCapability[]> = new Map();
  private logger: HookRunnerLogger;
  private catchErrors: boolean;
  private failurePolicyByHook: Partial<Record<string, 'fail-open' | 'fail-closed'>>;
  private voidHookTimeoutMsByHook: Partial<Record<string, number>>;
  private modifyingHookTimeoutMsByHook: Partial<Record<string, number>>;

  constructor(options: HookRunOptions = {}) {
    super();
    this.logger = {
      debug: options.catchErrors ? undefined : console.debug.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    this.catchErrors = options.catchErrors ?? true;
    this.failurePolicyByHook = options.failurePolicyByHook ?? {};
    this.voidHookTimeoutMsByHook = options.voidHookTimeoutMsByHook ?? {};
    this.modifyingHookTimeoutMsByHook = options.modifyingHookTimeoutMsByHook ?? {};
  }

  register<T = unknown>(registration: HookRegistration<T>): void {
    const hook: PluginHookCapability = {
      kind: 'hook',
      event: registration.event,
      handler: registration.handler as unknown as (payload: unknown, ctx?: PluginHookContext) => Promise<PluginHookResult | void>,
      priority: registration.priority,
    };

    let list = this.hooks.get(hook.event);
    if (!list) {
      list = [];
      this.hooks.set(hook.event, list);
    }
    list.push(hook);
    list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.emit('hook_registered', hook.event);
  }

  unregister<T = unknown>(registration: HookRegistration<T>): void {
    const list = this.hooks.get(registration.event);
    if (!list) return;
    const idx = list.findIndex(
      (h) => h.handler === registration.handler,
    );
    if (idx >= 0) {
      list.splice(idx, 1);
      this.emit('hook_unregistered', registration.event);
    }
  }

  getHooks(event: string): PluginHookCapability[] {
    return this.hooks.get(event) ?? [];
  }

  async run<T = unknown>(
    event: string,
    payload: T,
    ctx?: { sessionId?: string },
  ): Promise<T | undefined> {
    const hooks = this.getHooks(event);
    if (hooks.length === 0) return payload;

    let currentPayload: unknown = payload;

    for (const hook of hooks) {
      try {
        const result = await hook.handler(currentPayload, { pluginId: hook.event, sessionId: ctx?.sessionId });
        if (result !== undefined && result !== null) {
          currentPayload = result;
        }
      } catch (err) {
        this.emit('hook_error', event, err instanceof Error ? err : new Error(String(err)));
        if (!this.shouldCatchErrors(event)) {
          throw err;
        }
      }
    }

    return currentPayload as T | undefined;
  }

  async runAsync(
    event: string,
    payload: unknown,
    ctx?: { sessionId?: string },
  ): Promise<void> {
    const hooks = this.getHooks(event);
    if (hooks.length === 0) return;

    const promises = hooks.map(async (hook) => {
      try {
        await hook.handler(payload, { pluginId: hook.event, sessionId: ctx?.sessionId });
      } catch (err) {
        this.emit('hook_error', event, err instanceof Error ? err : new Error(String(err)));
      }
    });

    await Promise.all(promises);
  }

  private shouldCatchErrors(event: string): boolean {
    return this.catchErrors && (this.failurePolicyByHook[event] ?? 'fail-open') === 'fail-open';
  }
}

export class PluginHookRunner {
  private hooks: Map<string, PluginHookCapability[]> = new Map();
  private logger: HookRunnerLogger;
  private catchErrors: boolean;
  private failurePolicyByHook: Partial<Record<string, 'fail-open' | 'fail-closed'>>;
  private voidHookTimeoutMsByHook: Partial<Record<string, number>>;
  private modifyingHookTimeoutMsByHook: Partial<Record<string, number>>;

  constructor(options: HookRunOptions = {}) {
    this.logger = {
      debug: options.catchErrors ? undefined : console.debug.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    this.catchErrors = options.catchErrors ?? true;
    this.failurePolicyByHook = options.failurePolicyByHook ?? {};
    this.voidHookTimeoutMsByHook = options.voidHookTimeoutMsByHook ?? {};
    this.modifyingHookTimeoutMsByHook = options.modifyingHookTimeoutMsByHook ?? {};
  }

  register(hook: PluginHookCapability): void {
    let list = this.hooks.get(hook.event);
    if (!list) {
      list = [];
      this.hooks.set(hook.event, list);
    }
    list.push(hook);
    list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  unregister(hook: PluginHookCapability): void {
    const list = this.hooks.get(hook.event);
    if (!list) return;
    const idx = list.findIndex((h) => h === hook);
    if (idx >= 0) list.splice(idx, 1);
  }

  getHooksForEvent(event: string): PluginHookCapability[] {
    return this.hooks.get(event) ?? [];
  }

  async runVoidHook(
    event: string,
    payload: unknown,
    ctx?: { sessionId?: string },
    options?: { unrefTimeout?: boolean },
  ): Promise<void> {
    const hooks = this.getHooksForEvent(event);
    if (hooks.length === 0) return;

    this.logger.debug?.(`[hooks] running ${event} (${hooks.length} handlers)`);

    const promises = hooks.map(async (hook) => {
      try {
        const promise = Promise.resolve(
          hook.handler(payload, { pluginId: hook.event, sessionId: ctx?.sessionId }),
        );
        const timeoutMs = this.getVoidHookTimeoutMs(event);
        if (timeoutMs) {
          await this.withTimeout(promise, timeoutMs, { unref: options?.unrefTimeout ?? true });
        } else {
          await promise;
        }
      } catch (err) {
        this.handleHookError({ event, hook, error: err });
      }
    });

    await Promise.all(promises);
  }

  async runModifyingHook<TResult>(
    event: string,
    payload: unknown,
    ctx?: { sessionId?: string },
    policy: ModifyingHookPolicy<TResult> = {},
  ): Promise<TResult | undefined> {
    const hooks = this.getHooksForEvent(event);
    if (hooks.length === 0) return undefined;

    this.logger.debug?.(`[hooks] running ${event} (${hooks.length} handlers, sequential)`);

    let result: TResult | undefined;

    for (const hook of hooks) {
      try {
        const handler = hook.handler as (event: unknown, ctx: unknown) => Promise<TResult>;
        const promise = Promise.resolve(handler(payload, { pluginId: hook.event, sessionId: ctx?.sessionId }));
        const timeoutMs = this.getModifyingHookTimeoutMs(event);
        const handlerResult = timeoutMs ? await this.withTimeout(promise, timeoutMs) : await promise;

        const shouldMergeResult =
          handlerResult !== undefined && (handlerResult !== null || policy.mergeNullResults);
        if (shouldMergeResult) {
          if (policy.mergeResults) {
            result = policy.mergeResults(result, handlerResult, hook);
          } else {
            result = handlerResult;
          }
          if (result && policy.shouldStop?.(result)) {
            const terminalLabel = policy.terminalLabel ? ` ${policy.terminalLabel}` : '';
            const priority = hook.priority ?? 0;
            this.logger.debug?.(
              `[hooks] ${event}${terminalLabel} decided (priority=${priority}); skipping remaining handlers`,
            );
            break;
          }
        }
      } catch (err) {
        this.handleHookError({ event, hook, error: err });
      }
    }

    return result;
  }

  async runClaimingHook<TResult extends { handled: boolean }>(
    event: string,
    payload: unknown,
    ctx?: { sessionId?: string },
  ): Promise<TResult | undefined> {
    const hooks = this.getHooksForEvent(event);
    if (hooks.length === 0) return undefined;

    this.logger.debug?.(`[hooks] running ${event} (${hooks.length} handlers, first-claim wins)`);

    for (const hook of hooks) {
      try {
        const promise = Promise.resolve(
          hook.handler(payload, { pluginId: hook.event, sessionId: ctx?.sessionId }) as Promise<TResult | void>,
        );
        const timeoutMs = this.getModifyingHookTimeoutMs(event);
        const handlerResult = timeoutMs ? await this.withTimeout(promise, timeoutMs) : await promise;
        if (handlerResult?.handled) {
          return handlerResult;
        }
      } catch (err) {
        this.handleHookError({ event, hook, error: err });
      }
    }

    return undefined;
  }

  private getVoidHookTimeoutMs(event: string): number | undefined {
    return this.voidHookTimeoutMsByHook[event] ?? DEFAULT_VOID_HOOK_TIMEOUT_MS;
  }

  private getModifyingHookTimeoutMs(event: string): number | undefined {
    return this.modifyingHookTimeoutMsByHook[event] ?? DEFAULT_MODIFYING_HOOK_TIMEOUT_MS;
  }

  private shouldCatchHookErrors(event: string): boolean {
    return this.catchErrors && (this.failurePolicyByHook[event] ?? 'fail-open') === 'fail-open';
  }

  private handleHookError(params: { event: string; hook: PluginHookCapability; error: unknown }): never | void {
    const msg = `[hooks] ${params.event} handler failed: ${String(params.error)}`;
    if (this.shouldCatchHookErrors(params.event)) {
      this.logger.error(msg);
      return;
    }
    throw new Error(msg, { cause: params.error });
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    options: { unref?: boolean } = {},
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      if (options.unref) {
        timer.unref?.();
      }
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  mergeFirstDefined = <T>(prev: T | undefined, next: T | undefined): T | undefined => prev ?? next;

  mergeLastDefined = <T>(prev: T | undefined, next: T | undefined): T | undefined => next ?? prev;

  mergeConcat = (prev?: string, next?: string): string | undefined => {
    if (!prev) return next;
    if (!next) return prev;
    return `${prev}\n${next}`;
  };

  mergeStickyTrue = (prev?: boolean, next?: boolean): true | undefined =>
    prev === true || next === true ? true : undefined;
}

export const hookRunner = new PluginHookRunner();

export function onHook(event: string, handler: (payload: unknown, ctx?: { sessionId?: string }) => Promise<void> | void): void {
  hookRunner.register({ kind: 'hook', event, handler: handler as unknown as (payload: unknown, ctx?: PluginHookContext) => Promise<PluginHookResult | void> });
}

export function offHook(event: string, handler: (payload: unknown, ctx?: { sessionId?: string }) => Promise<void> | void): void {
  hookRunner.unregister({ kind: 'hook', event, handler: handler as unknown as (payload: unknown, ctx?: PluginHookContext) => Promise<PluginHookResult | void> });
}