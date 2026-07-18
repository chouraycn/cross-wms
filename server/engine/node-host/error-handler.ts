import { logger } from '../../logger.js';
import type { NodeHostError, ErrorHandlerOptions, RetryableError } from './types.js';

const DEFAULT_MAX_ERROR_HISTORY = 100;
const RETRYABLE_ERROR_CODES = new Set([
  'NETWORK_ERROR',
  'TIMEOUT',
  'RESOURCE_EXHAUSTED',
  'CONNECTION_FAILED',
  'RATE_LIMITED',
  'TRANSIENT_ERROR',
]);

export class ErrorHandler {
  private options: Required<ErrorHandlerOptions>;
  private errorHistory: NodeHostError[] = [];
  private retryableErrors: Map<string, RetryableError> = new Map();

  constructor(options: ErrorHandlerOptions = {}) {
    this.options = {
      onError: options.onError ?? (() => {}),
      maxErrorHistory: options.maxErrorHistory ?? DEFAULT_MAX_ERROR_HISTORY,
      enableRetryableTracking: options.enableRetryableTracking ?? true,
    };
  }

  handle(error: Error | NodeHostError | string, invocationId?: string): NodeHostError {
    const normalized = this.normalizeError(error, invocationId);

    this.errorHistory.push(normalized);

    if (this.errorHistory.length > this.options.maxErrorHistory) {
      this.errorHistory.shift();
    }

    logger.error(`[ErrorHandler] ${normalized.code}: ${normalized.message}`, normalized.details ?? {});

    if (this.options.enableRetryableTracking && this.isRetryable(normalized)) {
      this.trackRetryable(normalized);
    }

    try {
      this.options.onError(normalized);
    } catch {
      // ignore callback errors
    }

    return normalized;
  }

  private normalizeError(error: Error | NodeHostError | string, invocationId?: string): NodeHostError {
    if (typeof error === 'string') {
      return {
        code: 'UNKNOWN_ERROR',
        message: error,
        invocationId,
        timestamp: Date.now(),
      };
    }

    if ('code' in error && typeof error.code === 'string') {
      return {
        code: error.code,
        message: error.message,
        details: error.details,
        stack: error.stack,
        invocationId: error.invocationId ?? invocationId,
        timestamp: error.timestamp ?? Date.now(),
      };
    }

    return {
      code: this.inferErrorCode(error as Error),
      message: error.message,
      stack: error.stack,
      invocationId,
      timestamp: Date.now(),
    };
  }

  private inferErrorCode(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) return 'TIMEOUT';
    if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) return 'NETWORK_ERROR';
    if (message.includes('memory') || message.includes('heap')) return 'OUT_OF_MEMORY';
    if (message.includes('permission') || message.includes('access denied')) return 'PERMISSION_DENIED';
    if (message.includes('not found') || message.includes('enoent')) return 'NOT_FOUND';
    if (message.includes('invalid') || message.includes('bad request')) return 'INVALID_INPUT';
    if (message.includes('rate limit') || message.includes('too many requests')) return 'RATE_LIMITED';

    return 'UNKNOWN_ERROR';
  }

  isRetryable(error: NodeHostError): boolean {
    return RETRYABLE_ERROR_CODES.has(error.code);
  }

  private trackRetryable(error: NodeHostError): void {
    const key = error.invocationId ?? error.code;
    const existing = this.retryableErrors.get(key);

    if (existing) {
      existing.retryCount++;
      existing.nextRetryAt = this.calculateNextRetry(existing.retryCount);
    } else {
      this.retryableErrors.set(key, {
        error,
        retryCount: 1,
        maxRetries: 3,
        nextRetryAt: this.calculateNextRetry(1),
      });
    }
  }

  private calculateNextRetry(retryCount: number): number {
    const baseDelay = 1000;
    const delay = baseDelay * Math.pow(2, Math.min(retryCount - 1, 5));
    return Date.now() + delay;
  }

  canRetry(invocationId: string): boolean {
    const retryable = this.retryableErrors.get(invocationId);
    if (!retryable) return false;
    return retryable.retryCount < retryable.maxRetries;
  }

  getRetryCount(invocationId: string): number {
    return this.retryableErrors.get(invocationId)?.retryCount ?? 0;
  }

  clearRetryTracking(invocationId: string): boolean {
    return this.retryableErrors.delete(invocationId);
  }

  getErrorHistory(limit?: number): NodeHostError[] {
    const history = [...this.errorHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  getErrorsByCode(code: string): NodeHostError[] {
    return this.errorHistory.filter(e => e.code === code);
  }

  getErrorCountByCode(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const error of this.errorHistory) {
      counts[error.code] = (counts[error.code] ?? 0) + 1;
    }
    return counts;
  }

  clearHistory(): void {
    this.errorHistory = [];
    this.retryableErrors.clear();
    logger.debug('[ErrorHandler] History cleared');
  }

  getHistorySize(): number {
    return this.errorHistory.length;
  }

  getRetryableCount(): number {
    return this.retryableErrors.size;
  }

  wrap<T>(fn: () => Promise<T>, invocationId?: string): Promise<T> {
    return fn().catch(err => {
      this.handle(err, invocationId);
      throw err;
    });
  }

  wrapSync<T>(fn: () => T, invocationId?: string): T {
    try {
      return fn();
    } catch (err) {
      this.handle(err instanceof Error ? err : String(err), invocationId);
      throw err;
    }
  }
}

export function createErrorHandler(options?: ErrorHandlerOptions): ErrorHandler {
  return new ErrorHandler(options);
}

export const errorHandler = new ErrorHandler();
