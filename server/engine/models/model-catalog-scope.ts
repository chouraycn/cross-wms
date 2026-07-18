/**
 * 目录作用域 — 模型目录的作用域管理
 *
 * 管理模型目录的不同作用域（全局、工作区、项目、会话等），
 * 支持作用域继承和覆盖。
 */

import { logger } from '../../logger.js';

export type CatalogScope =
  | 'global'
  | 'workspace'
  | 'project'
  | 'session'
  | 'agent'
  | 'temporary';

export interface CatalogScopeEntry {
  scope: CatalogScope;
  scopeId?: string;
  priority: number;
  modelOverrides?: Record<string, Record<string, unknown>>;
  hiddenModels?: string[];
  visibleModels?: string[];
  defaultModel?: string;
}

export interface CatalogScopeStack {
  scopes: CatalogScopeEntry[];
}

const SCOPE_PRIORITY: Record<CatalogScope, number> = {
  global: 0,
  workspace: 10,
  project: 20,
  agent: 30,
  session: 40,
  temporary: 50,
};

export function createScopeStack(): CatalogScopeStack {
  return { scopes: [] };
}

export function pushScope(
  stack: CatalogScopeStack,
  entry: Omit<CatalogScopeEntry, 'priority'> & { priority?: number },
): CatalogScopeStack {
  const priority = entry.priority ?? SCOPE_PRIORITY[entry.scope] ?? 0;

  const newEntry: CatalogScopeEntry = {
    ...entry,
    priority,
  };

  const scopes = [...stack.scopes, newEntry].sort((a, b) => a.priority - b.priority);

  logger.debug(`[CatalogScope] 压入作用域: ${entry.scope} (priority=${priority})`);

  return { scopes };
}

export function popScope(stack: CatalogScopeStack, scope: CatalogScope, scopeId?: string): CatalogScopeStack {
  const scopes = stack.scopes.filter(s => {
    if (s.scope !== scope) return true;
    if (scopeId && s.scopeId !== scopeId) return true;
    return false;
  });

  logger.debug(`[CatalogScope] 弹出作用域: ${scope}`);

  return { scopes };
}

export function getScopeEntry(
  stack: CatalogScopeStack,
  scope: CatalogScope,
  scopeId?: string,
): CatalogScopeEntry | undefined {
  return stack.scopes.find(s => {
    if (s.scope !== scope) return false;
    if (scopeId && s.scopeId !== scopeId) return false;
    return true;
  });
}

export function resolveScopedModelConfig(
  stack: CatalogScopeStack,
  modelId: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const scope of stack.scopes) {
    const overrides = scope.modelOverrides?.[modelId];
    if (overrides) {
      Object.assign(result, overrides);
    }
  }

  return result;
}

export function isModelVisibleInScopes(
  stack: CatalogScopeStack,
  modelId: string,
): boolean {
  let visible = true;

  for (const scope of stack.scopes) {
    if (scope.visibleModels) {
      if (!scope.visibleModels.includes(modelId)) {
        visible = false;
      }
    }
    if (scope.hiddenModels?.includes(modelId)) {
      visible = false;
    }
  }

  return visible;
}

export function resolveDefaultModelFromScopes(
  stack: CatalogScopeStack,
): string | undefined {
  for (let i = stack.scopes.length - 1; i >= 0; i--) {
    const scope = stack.scopes[i];
    if (scope.defaultModel) {
      return scope.defaultModel;
    }
  }
  return undefined;
}

export function mergeScopeOverrides<T extends Record<string, unknown>>(
  base: T,
  overrides: Record<string, unknown> | undefined,
): T {
  if (!overrides) return base;
  return { ...base, ...overrides } as T;
}

export function getScopePriority(scope: CatalogScope): number {
  return SCOPE_PRIORITY[scope] ?? 0;
}

export function compareScopePriority(a: CatalogScope, b: CatalogScope): number {
  return getScopePriority(a) - getScopePriority(b);
}
