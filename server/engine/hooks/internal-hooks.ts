import { logger } from '../../logger.js';
import type {
  HookHandler,
  HookModifier,
  HookEvent,
  InternalHookEvent,
  InternalHookHandler,
  InternalHookEventType,
  AgentBootstrapHookEvent,
  GatewayStartupHookEvent,
  MessageReceivedHookEvent,
  MessageSentHookEvent,
  MessageTranscribedHookEvent,
  MessagePreprocessedHookEvent,
  SessionPatchHookEvent,
  ToolCallHookEvent,
  ToolResultHookEvent,
} from './types.js';

const INTERNAL_HOOKS_KEY = Symbol.for('cdf-know.internalHooks');

interface InternalHooksStore {
  handlers: Map<string, InternalHookHandler[]>;
  modifiers: Map<string, HookModifier[]>;
  enabled: boolean;
}

function getStore(): InternalHooksStore {
  const store = globalThis as Record<symbol, InternalHooksStore>;
  if (!store[INTERNAL_HOOKS_KEY]) {
    store[INTERNAL_HOOKS_KEY] = {
      handlers: new Map(),
      modifiers: new Map(),
      enabled: true,
    };
  }
  return store[INTERNAL_HOOKS_KEY];
}

export function registerInternalHook(eventKey: string, handler: InternalHookHandler): void {
  const store = getStore();
  const handlers = store.handlers.get(eventKey) ?? [];
  handlers.push(handler);
  store.handlers.set(eventKey, handlers);
  logger.debug(`[hooks:Internal] Registered internal hook: ${eventKey}`);
}

export function registerInternalModifier<T extends InternalHookEvent>(
  eventKey: string,
  modifier: (event: T) => Promise<T> | T,
): void {
  const store = getStore();
  const modifiers = store.modifiers.get(eventKey) ?? [];
  modifiers.push(modifier as unknown as HookModifier);
  store.modifiers.set(eventKey, modifiers);
  logger.debug(`[hooks:Internal] Registered internal modifier: ${eventKey}`);
}

export function setInternalHooksEnabled(enabled: boolean): void {
  const store = getStore();
  store.enabled = enabled;
  logger.debug(`[hooks:Internal] Internal hooks ${enabled ? 'enabled' : 'disabled'}`);
}

export function areInternalHooksEnabled(): boolean {
  return getStore().enabled;
}

export function getRegisteredEventKeys(): string[] {
  const store = getStore();
  return Array.from(store.handlers.keys());
}

export function hasInternalHookListeners(type: InternalHookEventType, action: string): boolean {
  const store = getStore();
  const typeHandlers = store.handlers.get(type)?.length ?? 0;
  const actionHandlers = store.handlers.get(`${type}:${action}`)?.length ?? 0;
  const typeModifiers = store.modifiers.get(type)?.length ?? 0;
  const actionModifiers = store.modifiers.get(`${type}:${action}`)?.length ?? 0;
  return typeHandlers > 0 || actionHandlers > 0 || typeModifiers > 0 || actionModifiers > 0;
}

export async function runInternalHooks(eventKey: string, event: InternalHookEvent): Promise<void> {
  const store = getStore();
  if (!store.enabled) return;

  const handlers = store.handlers.get(eventKey) ?? [];

  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (err) {
      logger.error(`[hooks:Internal] Internal hook error [${eventKey}]: ${String(err)}`);
    }
  }
}

export async function runInternalModifiers<T extends InternalHookEvent>(
  eventKey: string,
  event: T,
): Promise<T> {
  const store = getStore();
  if (!store.enabled) return event;

  const modifiers = store.modifiers.get(eventKey) ?? [];

  let currentEvent = event;
  for (const modifier of modifiers) {
    try {
      const result = await modifier(currentEvent);
      if (result !== undefined) {
        currentEvent = result as T;
      }
    } catch (err) {
      logger.error(`[hooks:Internal] Internal modifier error [${eventKey}]: ${String(err)}`);
    }
  }

  return currentEvent;
}

export async function triggerInternalHook(event: InternalHookEvent): Promise<void> {
  const store = getStore();
  if (!store.enabled) return;
  if (!hasInternalHookListeners(event.type, event.action)) return;

  const typeEvent = event.type;
  const actionEvent = `${event.type}:${event.action}`;

  let modifiedEvent = event;
  modifiedEvent = await runInternalModifiers(typeEvent, modifiedEvent);
  modifiedEvent = await runInternalModifiers(actionEvent, modifiedEvent);

  await runInternalHooks(typeEvent, modifiedEvent);
  await runInternalHooks(actionEvent, modifiedEvent);
}

export function unregisterInternalHook(eventKey: string, handler?: InternalHookHandler): void {
  const store = getStore();
  const handlers = store.handlers.get(eventKey);

  if (!handlers) return;

  if (handler) {
    const idx = handlers.indexOf(handler);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
    if (handlers.length === 0) {
      store.handlers.delete(eventKey);
    }
  } else {
    store.handlers.delete(eventKey);
  }

  logger.debug(`[hooks:Internal] Unregistered internal hook: ${eventKey}`);
}

export function unregisterInternalModifier(eventKey: string, modifier?: HookModifier): void {
  const store = getStore();
  const modifiers = store.modifiers.get(eventKey);

  if (!modifiers) return;

  if (modifier) {
    const idx = modifiers.indexOf(modifier);
    if (idx !== -1) {
      modifiers.splice(idx, 1);
    }
    if (modifiers.length === 0) {
      store.modifiers.delete(eventKey);
    }
  } else {
    store.modifiers.delete(eventKey);
  }

  logger.debug(`[hooks:Internal] Unregistered internal modifier: ${eventKey}`);
}

export function clearInternalHooks(): void {
  const store = getStore();
  store.handlers.clear();
  store.modifiers.clear();
  logger.debug('[hooks:Internal] All internal hooks cleared');
}

export function createInternalHookEvent(
  type: InternalHookEventType,
  action: string,
  sessionKey: string,
  context: Record<string, unknown> = {},
): InternalHookEvent {
  return {
    type,
    action,
    sessionKey,
    context,
    timestamp: new Date(),
    messages: [],
  };
}

// ============================================================================
// 事件类型守卫
// ============================================================================

function isHookEventTypeAndAction(
  event: InternalHookEvent,
  type: InternalHookEventType,
  action: string,
): boolean {
  return event.type === type && event.action === action;
}

function getHookContext<T extends Record<string, unknown>>(
  event: InternalHookEvent,
): Partial<T> | null {
  const context = event.context as Partial<T> | null;
  if (!context || typeof context !== 'object') {
    return null;
  }
  return context;
}

function hasStringContextField<T extends Record<string, unknown>>(
  context: Partial<T>,
  key: keyof T,
): boolean {
  return typeof context[key] === 'string';
}

function hasBooleanContextField<T extends Record<string, unknown>>(
  context: Partial<T>,
  key: keyof T,
): boolean {
  return typeof context[key] === 'boolean';
}

export function isAgentBootstrapEvent(event: InternalHookEvent): event is AgentBootstrapHookEvent {
  if (!isHookEventTypeAndAction(event, 'agent', 'bootstrap')) {
    return false;
  }
  const context = getHookContext<AgentBootstrapHookEvent['context']>(event);
  if (!context) {
    return false;
  }
  if (!hasStringContextField(context, 'workspaceDir')) {
    return false;
  }
  return Array.isArray(context.bootstrapFiles);
}

export function isGatewayStartupEvent(event: InternalHookEvent): event is GatewayStartupHookEvent {
  if (!isHookEventTypeAndAction(event, 'gateway', 'startup')) {
    return false;
  }
  return Boolean(getHookContext<GatewayStartupHookEvent['context']>(event));
}

export function isMessageReceivedEvent(
  event: InternalHookEvent,
): event is MessageReceivedHookEvent {
  if (!isHookEventTypeAndAction(event, 'message', 'received')) {
    return false;
  }
  const context = getHookContext<MessageReceivedHookEvent['context']>(event);
  if (!context) {
    return false;
  }
  return (
    hasStringContextField(context, 'from') &&
    hasStringContextField(context, 'content') &&
    hasStringContextField(context, 'channelId')
  );
}

export function isMessageSentEvent(event: InternalHookEvent): event is MessageSentHookEvent {
  if (!isHookEventTypeAndAction(event, 'message', 'sent')) {
    return false;
  }
  const context = getHookContext<MessageSentHookEvent['context']>(event);
  if (!context) {
    return false;
  }
  return (
    hasStringContextField(context, 'to') &&
    hasStringContextField(context, 'content') &&
    hasStringContextField(context, 'channelId') &&
    hasBooleanContextField(context, 'success')
  );
}

export function isMessageTranscribedEvent(
  event: InternalHookEvent,
): event is MessageTranscribedHookEvent {
  if (!isHookEventTypeAndAction(event, 'message', 'transcribed')) {
    return false;
  }
  const context = getHookContext<MessageTranscribedHookEvent['context']>(event);
  if (!context) {
    return false;
  }
  return hasStringContextField(context, 'transcript') && hasStringContextField(context, 'channelId');
}

export function isMessagePreprocessedEvent(
  event: InternalHookEvent,
): event is MessagePreprocessedHookEvent {
  if (!isHookEventTypeAndAction(event, 'message', 'preprocessed')) {
    return false;
  }
  const context = getHookContext<MessagePreprocessedHookEvent['context']>(event);
  if (!context) {
    return false;
  }
  return hasStringContextField(context, 'channelId');
}

export function isSessionPatchEvent(event: InternalHookEvent): event is SessionPatchHookEvent {
  if (!isHookEventTypeAndAction(event, 'session', 'patch')) {
    return false;
  }
  const context = getHookContext<SessionPatchHookEvent['context']>(event);
  if (!context) {
    return false;
  }
  return (
    typeof context.patch === 'object' &&
    context.patch !== null &&
    typeof context.cfg === 'object' &&
    context.cfg !== null &&
    typeof context.sessionEntry === 'object' &&
    context.sessionEntry !== null
  );
}

export function isToolCallEvent(event: InternalHookEvent): event is ToolCallHookEvent {
  if (!isHookEventTypeAndAction(event, 'tool', 'call')) {
    return false;
  }
  const context = getHookContext<ToolCallHookEvent['context']>(event);
  if (!context) {
    return false;
  }
  return hasStringContextField(context, 'toolName');
}

export function isToolResultEvent(event: InternalHookEvent): event is ToolResultHookEvent {
  if (!isHookEventTypeAndAction(event, 'tool', 'result')) {
    return false;
  }
  const context = getHookContext<ToolResultHookEvent['context']>(event);
  if (!context) {
    return false;
  }
  return hasStringContextField(context, 'toolName') && hasBooleanContextField(context, 'success');
}
