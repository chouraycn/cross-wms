/**
 * Provider 认证状态 — 管理 Provider 级别的认证状态缓存
 *
 * 维护每个 Provider 的认证状态，支持状态变更通知、
 * 批量检查和自动刷新。
 */

import { logger } from '../../logger.js';
import type { AuthStatus, AuthSource, ResolvedProviderAuth } from './model-auth-runtime-shared.js';

export interface ProviderAuthStateEntry {
  providerId: string;
  status: AuthStatus;
  source: AuthSource;
  lastCheckedAt: number;
  lastSuccessAt?: number;
  lastError?: string;
  retryCount: number;
  nextRetryAt?: number;
}

export type AuthStateChangeListener = (
  providerId: string,
  oldState: ProviderAuthStateEntry | null,
  newState: ProviderAuthStateEntry,
) => void;

export interface ProviderAuthStateStoreOptions {
  cacheTtlMs?: number;
  maxRetryDelayMs?: number;
  baseRetryDelayMs?: number;
}

export class ProviderAuthStateStore {
  private states = new Map<string, ProviderAuthStateEntry>();
  private listeners = new Set<AuthStateChangeListener>();
  private cacheTtlMs: number;
  private maxRetryDelayMs: number;
  private baseRetryDelayMs: number;

  constructor(options: ProviderAuthStateStoreOptions = {}) {
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 30 * 60 * 1000;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 10_000;
  }

  setState(providerId: string, auth: ResolvedProviderAuth): void {
    const oldState = this.states.get(providerId) || null;

    const newState: ProviderAuthStateEntry = {
      providerId,
      status: auth.status,
      source: auth.source,
      lastCheckedAt: auth.lastCheckedAt,
      lastSuccessAt: auth.status === 'authenticated' ? auth.lastCheckedAt : oldState?.lastSuccessAt,
      lastError: auth.errorMessage,
      retryCount: auth.status === 'authenticated' ? 0 : (oldState?.retryCount ?? 0) + 1,
      nextRetryAt: this.calculateNextRetry(
        auth.status === 'error' ? (oldState?.retryCount ?? 0) + 1 : 0,
      ),
    };

    this.states.set(providerId, newState);

    if (oldState?.status !== newState.status) {
      logger.debug(
        `[ProviderAuthState] ${providerId} 状态变更: ${oldState?.status ?? 'unknown'} → ${newState.status}`,
      );
      this.notifyListeners(providerId, oldState, newState);
    }
  }

  getState(providerId: string): ProviderAuthStateEntry | undefined {
    return this.states.get(providerId);
  }

  getAllStates(): ProviderAuthStateEntry[] {
    return Array.from(this.states.values());
  }

  getStatus(providerId: string): AuthStatus {
    return this.states.get(providerId)?.status ?? 'pending';
  }

  isAuthenticated(providerId: string): boolean {
    return this.getStatus(providerId) === 'authenticated';
  }

  isStale(providerId: string): boolean {
    const state = this.states.get(providerId);
    if (!state) return true;
    return Date.now() - state.lastCheckedAt > this.cacheTtlMs;
  }

  shouldRetry(providerId: string): boolean {
    const state = this.states.get(providerId);
    if (!state) return true;
    if (state.status === 'authenticated') return this.isStale(providerId);
    if (state.nextRetryAt) return Date.now() >= state.nextRetryAt;
    return true;
  }

  getAuthenticatedProviders(): string[] {
    const result: string[] = [];
    for (const [providerId, state] of this.states) {
      if (state.status === 'authenticated') {
        result.push(providerId);
      }
    }
    return result;
  }

  getUnauthenticatedProviders(): string[] {
    const result: string[] = [];
    for (const [providerId, state] of this.states) {
      if (state.status === 'unauthenticated' || state.status === 'error') {
        result.push(providerId);
      }
    }
    return result;
  }

  addChangeListener(listener: AuthStateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  removeChangeListener(listener: AuthStateChangeListener): void {
    this.listeners.delete(listener);
  }

  invalidate(providerId: string): void {
    const state = this.states.get(providerId);
    if (state) {
      state.lastCheckedAt = 0;
      logger.debug(`[ProviderAuthState] 失效缓存: ${providerId}`);
    }
  }

  invalidateAll(): void {
    for (const state of this.states.values()) {
      state.lastCheckedAt = 0;
    }
    logger.debug('[ProviderAuthState] 已失效所有缓存');
  }

  clear(): void {
    this.states.clear();
    logger.debug('[ProviderAuthState] 已清空所有状态');
  }

  getSummary(): {
    total: number;
    authenticated: number;
    unauthenticated: number;
    pending: number;
    error: number;
  } {
    let authenticated = 0;
    let unauthenticated = 0;
    let pending = 0;
    let error = 0;

    for (const state of this.states.values()) {
      switch (state.status) {
        case 'authenticated':
          authenticated++;
          break;
        case 'unauthenticated':
          unauthenticated++;
          break;
        case 'pending':
          pending++;
          break;
        case 'error':
          error++;
          break;
      }
    }

    return {
      total: this.states.size,
      authenticated,
      unauthenticated,
      pending,
      error,
    };
  }

  private calculateNextRetry(retryCount: number): number | undefined {
    if (retryCount <= 0) return undefined;
    const delay = Math.min(
      this.baseRetryDelayMs * Math.pow(2, retryCount - 1),
      this.maxRetryDelayMs,
    );
    return Date.now() + delay;
  }

  private notifyListeners(
    providerId: string,
    oldState: ProviderAuthStateEntry | null,
    newState: ProviderAuthStateEntry,
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(providerId, oldState, newState);
      } catch (e) {
        logger.error('[ProviderAuthState] 状态变更监听器出错:', e);
      }
    }
  }
}

let globalAuthStateStore: ProviderAuthStateStore | null = null;

export function getProviderAuthStateStore(): ProviderAuthStateStore {
  if (!globalAuthStateStore) {
    globalAuthStateStore = new ProviderAuthStateStore();
  }
  return globalAuthStateStore;
}
