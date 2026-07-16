import { logger } from '../../logger.js';
import type { HookHandler, HookModifier, HookEvent } from './types.js';

const INTERNAL_HOOKS_KEY = Symbol.for('cdf-know.internalHooks');

interface InternalHooksStore {
  handlers: Map<string, HookHandler[]>;
  modifiers: Map<string, HookModifier[]>;
}

function getStore(): InternalHooksStore {
  const store = globalThis as Record<symbol, InternalHooksStore>;
  if (!store[INTERNAL_HOOKS_KEY]) {
    store[INTERNAL_HOOKS_KEY] = {
      handlers: new Map(),
      modifiers: new Map(),
    };
  }
  return store[INTERNAL_HOOKS_KEY];
}

export function registerInternalHook(eventKey: string, handler: HookHandler): void {
  const store = getStore();
  const handlers = store.handlers.get(eventKey) ?? [];
  handlers.push(handler);
  store.handlers.set(eventKey, handlers);
  logger.debug(`[hooks:Internal] Registered internal hook: ${eventKey}`);
}

export function registerInternalModifier(eventKey: string, modifier: HookModifier): void {
  const store = getStore();
  const modifiers = store.modifiers.get(eventKey) ?? [];
  modifiers.push(modifier);
  store.modifiers.set(eventKey, modifiers);
  logger.debug(`[hooks:Internal] Registered internal modifier: ${eventKey}`);
}

export async function runInternalHooks(eventKey: string, event: HookEvent): Promise<void> {
  const store = getStore();
  const handlers = store.handlers.get(eventKey) ?? [];
  
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (err) {
      logger.error(`[hooks:Internal] Internal hook error [${eventKey}]: ${err}`);
    }
  }
}

export async function runInternalModifiers<T extends HookEvent>(eventKey: string, event: T): Promise<T> {
  const store = getStore();
  const modifiers = store.modifiers.get(eventKey) ?? [];
  
  let currentEvent = event;
  for (const modifier of modifiers) {
    try {
      const result = await modifier(currentEvent);
      if (result !== undefined) {
        currentEvent = result as T;
      }
    } catch (err) {
      logger.error(`[hooks:Internal] Internal modifier error [${eventKey}]: ${err}`);
    }
  }
  
  return currentEvent;
}

export function unregisterInternalHook(eventKey: string, handler?: HookHandler): void {
  const store = getStore();
  const handlers = store.handlers.get(eventKey);
  
  if (!handlers) return;
  
  if (handler) {
    const idx = handlers.indexOf(handler);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
  } else {
    store.handlers.delete(eventKey);
  }
  
  logger.debug(`[hooks:Internal] Unregistered internal hook: ${eventKey}`);
}

export function clearInternalHooks(): void {
  const store = getStore();
  store.handlers.clear();
  store.modifiers.clear();
  logger.debug('[hooks:Internal] All internal hooks cleared');
}