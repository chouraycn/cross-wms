/**
 * Subagent Active Context — 活跃上下文管理
 *
 * 子代理上下文追踪和上下文传递策略。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent } from './subagent-registry.state.js';

export type ContextTransferMode = 'isolated' | 'fork' | 'shared';
export type ContextScope = 'global' | 'session' | 'thread' | 'subagent';

export interface SubagentContextData {
  key: string;
  value: unknown;
  scope: ContextScope;
  transferable: boolean;
  createdAt: number;
  updatedAt: number;
  ttlMs?: number;
  metadata?: Record<string, unknown>;
}

export interface SubagentContextSnapshot {
  instanceId: string;
  timestamp: number;
  data: Map<string, SubagentContextData>;
}

export interface ContextInheritanceOptions {
  mode: ContextTransferMode;
  includeScopes?: ContextScope[];
  excludeKeys?: string[];
  includeKeys?: string[];
  maxItems?: number;
  maxSizeBytes?: number;
}

const DEFAULT_TTL_MS = 3600000;
const DEFAULT_MAX_ITEMS = 100;
const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

const contexts = new Map<string, Map<string, SubagentContextData>>();
const contextHierarchy = new Map<string, string | undefined>();

export function initSubagentContext(instanceId: string, parentInstanceId?: string): void {
  if (contexts.has(instanceId)) {
    return;
  }

  contexts.set(instanceId, new Map());
  contextHierarchy.set(instanceId, parentInstanceId);

  logger.debug(`[SubagentContext] Initialized context for ${instanceId}` +
    (parentInstanceId ? ` (parent: ${parentInstanceId})` : ''));
}

export function setContextValue(
  instanceId: string,
  key: string,
  value: unknown,
  options?: {
    scope?: ContextScope;
    transferable?: boolean;
    ttlMs?: number;
    metadata?: Record<string, unknown>;
  },
): void {
  let context = contexts.get(instanceId);
  if (!context) {
    context = new Map();
    contexts.set(instanceId, context);
  }

  const now = Date.now();
  const existing = context.get(key);

  const data: SubagentContextData = {
    key,
    value,
    scope: options?.scope ?? 'subagent',
    transferable: options?.transferable ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ttlMs: options?.ttlMs,
    metadata: options?.metadata,
  };

  context.set(key, data);
  enforceLimits(instanceId);
}

export function getContextValue(instanceId: string, key: string): unknown | undefined {
  const context = contexts.get(instanceId);
  if (!context) return undefined;

  const data = context.get(key);
  if (!data) return undefined;

  if (isExpired(data)) {
    context.delete(key);
    return undefined;
  }

  return data.value;
}

export function hasContextValue(instanceId: string, key: string): boolean {
  const context = contexts.get(instanceId);
  if (!context) return false;

  const data = context.get(key);
  if (!data) return false;

  if (isExpired(data)) {
    context.delete(key);
    return false;
  }

  return true;
}

export function deleteContextValue(instanceId: string, key: string): boolean {
  const context = contexts.get(instanceId);
  if (!context) return false;
  return context.delete(key);
}

export function clearSubagentContext(instanceId: string): void {
  contexts.delete(instanceId);
  contextHierarchy.delete(instanceId);
  logger.debug(`[SubagentContext] Cleared context for ${instanceId}`);
}

export function getContextKeys(instanceId: string): string[] {
  const context = contexts.get(instanceId);
  if (!context) return [];

  const keys: string[] = [];
  for (const [key, data] of context) {
    if (!isExpired(data)) {
      keys.push(key);
    }
  }
  return keys;
}

export function getAllContextValues(instanceId: string): Record<string, unknown> {
  const context = contexts.get(instanceId);
  if (!context) return {};

  const result: Record<string, unknown> = {};
  for (const [key, data] of context) {
    if (!isExpired(data)) {
      result[key] = data.value;
    }
  }
  return result;
}

export function getContextSnapshot(instanceId: string): SubagentContextSnapshot | undefined {
  const context = contexts.get(instanceId);
  if (!context) return undefined;

  const data = new Map<string, SubagentContextData>();
  for (const [key, value] of context) {
    if (!isExpired(value)) {
      data.set(key, value);
    }
  }

  return {
    instanceId,
    timestamp: Date.now(),
    data,
  };
}

export function transferContext(
  sourceInstanceId: string,
  targetInstanceId: string,
  options: ContextInheritanceOptions,
): number {
  const sourceContext = contexts.get(sourceInstanceId);
  if (!sourceContext) return 0;

  let targetContext = contexts.get(targetInstanceId);
  if (!targetContext) {
    targetContext = new Map();
    contexts.set(targetInstanceId, targetContext);
  }

  let transferred = 0;
  const now = Date.now();

  for (const [key, data] of sourceContext) {
    if (isExpired(data)) continue;
    if (!data.transferable) continue;

    if (options.excludeKeys?.includes(key)) continue;
    if (options.includeKeys && !options.includeKeys.includes(key)) continue;

    if (options.includeScopes && !options.includeScopes.includes(data.scope)) {
      continue;
    }

    if (options.maxItems && transferred >= options.maxItems) break;

    if (options.maxSizeBytes) {
      const size = estimateSize(data.value);
      const currentSize = estimateContextSize(targetContext);
      if (currentSize + size > options.maxSizeBytes) continue;
    }

    targetContext.set(key, {
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    transferred++;
  }

  logger.debug(
    `[SubagentContext] Transferred ${transferred} items from ${sourceInstanceId} to ${targetInstanceId}`,
  );

  return transferred;
}

export function inheritContextFromParent(
  instanceId: string,
  options?: Partial<ContextInheritanceOptions>,
): number {
  const parentId = contextHierarchy.get(instanceId);
  if (!parentId) return 0;

  const defaultOptions: ContextInheritanceOptions = {
    mode: options?.mode ?? 'fork',
    includeScopes: options?.includeScopes ?? ['global', 'session'],
    excludeKeys: options?.excludeKeys,
    includeKeys: options?.includeKeys,
    maxItems: options?.maxItems ?? DEFAULT_MAX_ITEMS,
    maxSizeBytes: options?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES,
  };

  return transferContext(parentId, instanceId, defaultOptions);
}

export function getParentContext(instanceId: string): string | undefined {
  return contextHierarchy.get(instanceId);
}

export function setParentContext(instanceId: string, parentInstanceId: string | undefined): void {
  contextHierarchy.set(instanceId, parentInstanceId);
}

export function getContextHierarchy(instanceId: string): string[] {
  const hierarchy: string[] = [];
  let current: string | undefined = instanceId;

  while (current) {
    hierarchy.push(current);
    current = contextHierarchy.get(current);
  }

  return hierarchy;
}

export function getContextDepth(instanceId: string): number {
  return getContextHierarchy(instanceId).length - 1;
}

export function resolveContextValue(instanceId: string, key: string): unknown | undefined {
  const hierarchy = getContextHierarchy(instanceId);

  for (const id of hierarchy) {
    const value = getContextValue(id, key);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function getContextStats(instanceId: string): {
  items: number;
  sizeEstimate: number;
  depth: number;
  hasParent: boolean;
} {
  const context = contexts.get(instanceId);
  const items = context ? countValidItems(context) : 0;
  const sizeEstimate = context ? estimateContextSize(context) : 0;

  return {
    items,
    sizeEstimate,
    depth: getContextDepth(instanceId),
    hasParent: contextHierarchy.has(instanceId) && contextHierarchy.get(instanceId) !== undefined,
  };
}

function isExpired(data: SubagentContextData): boolean {
  if (!data.ttlMs) return false;
  return Date.now() - data.updatedAt > data.ttlMs;
}

function countValidItems(context: Map<string, SubagentContextData>): number {
  let count = 0;
  for (const data of context.values()) {
    if (!isExpired(data)) {
      count++;
    }
  }
  return count;
}

function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function estimateContextSize(context: Map<string, SubagentContextData>): number {
  let total = 0;
  for (const data of context.values()) {
    if (!isExpired(data)) {
      total += estimateSize(data.value) + data.key.length;
    }
  }
  return total;
}

function enforceLimits(instanceId: string): void {
  const context = contexts.get(instanceId);
  if (!context) return;

  let size = estimateContextSize(context);
  const count = countValidItems(context);

  if (count <= DEFAULT_MAX_ITEMS && size <= DEFAULT_MAX_SIZE_BYTES) {
    return;
  }

  const entries = Array.from(context.entries())
    .filter(([, data]) => !isExpired(data))
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt);

  context.clear();

  for (const [key, data] of entries) {
    if (context.size >= DEFAULT_MAX_ITEMS) break;

    const itemSize = estimateSize(data.value) + key.length;
    if (size + itemSize > DEFAULT_MAX_SIZE_BYTES) break;

    context.set(key, data);
    size += itemSize;
  }
}

export function cleanupExpiredContexts(): number {
  let cleaned = 0;

  for (const [instanceId, context] of contexts) {
    const keysToDelete: string[] = [];
    for (const [key, data] of context) {
      if (isExpired(data)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      context.delete(key);
      cleaned++;
    }

    if (context.size === 0) {
      contexts.delete(instanceId);
      contextHierarchy.delete(instanceId);
    }
  }

  if (cleaned > 0) {
    logger.debug(`[SubagentContext] Cleaned up ${cleaned} expired context items`);
  }

  return cleaned;
}

export function buildInheritedContext(
  instanceId: string,
  options?: {
    scopes?: ContextScope[];
    maxDepth?: number;
  },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const hierarchy = getContextHierarchy(instanceId);
  const maxDepth = options?.maxDepth ?? 5;

  for (let i = Math.min(hierarchy.length - 1, maxDepth); i >= 0; i--) {
    const id = hierarchy[i];
    const context = contexts.get(id);
    if (!context) continue;

    for (const [key, data] of context) {
      if (isExpired(data)) continue;
      if (!data.transferable) continue;
      if (options?.scopes && !options.scopes.includes(data.scope)) continue;

      result[key] = data.value;
    }
  }

  return result;
}

export function initializeSubagentWithContext(
  instance: SubagentInstance,
  parentInstance?: SubagentInstance,
  options?: Partial<ContextInheritanceOptions>,
): void {
  initSubagentContext(instance.id, parentInstance?.id);

  if (parentInstance) {
    inheritContextFromParent(instance.id, options);
  }
}
