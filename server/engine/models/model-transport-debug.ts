/**
 * 传输调试 — 模型 API 传输的调试工具
 *
 * 提供传输层的调试功能，包括请求/响应日志、
 * 性能追踪、错误诊断等。
 */

import { logger } from '../../logger.js';
import { redactApiKey } from './model-auth-markers.js';

export interface TransportDebugInfo {
  requestId: string;
  provider: string;
  model: string;
  endpoint: string;
  method: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  statusCode?: number;
  requestSize?: number;
  responseSize?: number;
  error?: string;
  errorType?: string;
  retryCount: number;
  tokensIn?: number;
  tokensOut?: number;
  cacheHit?: boolean;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

export interface TransportDebugOptions {
  enabled: boolean;
  logRequests: boolean;
  logResponses: boolean;
  logHeaders: boolean;
  logBody: boolean;
  maxBodyLogSize: number;
  captureTiming: boolean;
  captureSizes: boolean;
  redactSensitive: boolean;
}

const DEFAULT_OPTIONS: TransportDebugOptions = {
  enabled: false,
  logRequests: false,
  logResponses: false,
  logHeaders: false,
  logBody: false,
  maxBodyLogSize: 1024,
  captureTiming: true,
  captureSizes: true,
  redactSensitive: true,
};

export class TransportDebugger {
  private options: TransportDebugOptions;
  private requests = new Map<string, TransportDebugInfo>();
  private requestHistory: TransportDebugInfo[] = [];
  private maxHistorySize = 100;

  constructor(options: Partial<TransportDebugOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setOptions(options: Partial<TransportDebugOptions>): void {
    this.options = { ...this.options, ...options };
    logger.debug(`[TransportDebug] 更新配置: enabled=${this.options.enabled}`);
  }

  getOptions(): TransportDebugOptions {
    return { ...this.options };
  }

  startRequest(params: {
    provider: string;
    model: string;
    endpoint: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): string {
    const requestId = this.generateRequestId();
    const info: TransportDebugInfo = {
      requestId,
      provider: params.provider,
      model: params.model,
      endpoint: params.endpoint,
      method: params.method,
      startTime: Date.now(),
      retryCount: 0,
    };

    this.requests.set(requestId, info);

    if (this.options.enabled && this.options.logRequests) {
      this.logRequest(info, params.headers, params.body);
    }

    return requestId;
  }

  endRequest(
    requestId: string,
    params: {
      statusCode?: number;
      responseSize?: number;
      error?: string;
      errorType?: string;
      tokensIn?: number;
      tokensOut?: number;
      headers?: Record<string, string>;
      body?: unknown;
    },
  ): TransportDebugInfo | undefined {
    const info = this.requests.get(requestId);
    if (!info) return undefined;

    info.endTime = Date.now();
    info.durationMs = info.endTime - info.startTime;
    info.statusCode = params.statusCode;
    info.responseSize = params.responseSize;
    info.error = params.error;
    info.errorType = params.errorType;
    info.tokensIn = params.tokensIn;
    info.tokensOut = params.tokensOut;

    if (params.headers) {
      info.rateLimitRemaining = parseInt(params.headers['x-ratelimit-remaining-requests'] ?? params.headers['x-rate-limit-remaining'] ?? '', 10) || undefined;
      info.rateLimitReset = parseInt(params.headers['x-ratelimit-reset-requests'] ?? params.headers['x-rate-limit-reset'] ?? '', 10) || undefined;
    }

    this.requests.delete(requestId);
    this.addToHistory(info);

    if (this.options.enabled && this.options.logResponses) {
      this.logResponse(info, params.headers, params.body);
    }

    return info;
  }

  incrementRetry(requestId: string): void {
    const info = this.requests.get(requestId);
    if (info) {
      info.retryCount++;
    }
  }

  setRequestSize(requestId: string, size: number): void {
    const info = this.requests.get(requestId);
    if (info) {
      info.requestSize = size;
    }
  }

  getActiveRequests(): TransportDebugInfo[] {
    return Array.from(this.requests.values());
  }

  getRequestHistory(): TransportDebugInfo[] {
    return [...this.requestHistory];
  }

  getStats(): {
    activeRequests: number;
    totalRequests: number;
    avgDurationMs: number;
    errorRate: number;
    avgRetryCount: number;
  } {
    const total = this.requestHistory.length;
    if (total === 0) {
      return {
        activeRequests: this.requests.size,
        totalRequests: 0,
        avgDurationMs: 0,
        errorRate: 0,
        avgRetryCount: 0,
      };
    }

    const totalDuration = this.requestHistory.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
    const errorCount = this.requestHistory.filter(r => r.error).length;
    const totalRetries = this.requestHistory.reduce((sum, r) => sum + r.retryCount, 0);

    return {
      activeRequests: this.requests.size,
      totalRequests: total,
      avgDurationMs: totalDuration / total,
      errorRate: errorCount / total,
      avgRetryCount: totalRetries / total,
    };
  }

  clearHistory(): void {
    this.requestHistory = [];
    logger.debug('[TransportDebug] 已清空历史记录');
  }

  private generateRequestId(): string {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private addToHistory(info: TransportDebugInfo): void {
    this.requestHistory.push(info);
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }
  }

  private logRequest(
    info: TransportDebugInfo,
    headers?: Record<string, string>,
    body?: unknown,
  ): void {
    const parts = [
      `→ ${info.method} ${info.endpoint}`,
      `provider=${info.provider}`,
      `model=${info.model}`,
    ];

    logger.debug(`[TransportDebug] ${parts.join(' | ')}`);

    if (this.options.logHeaders && headers) {
      const redacted = this.redactHeaders(headers);
      logger.debug('[TransportDebug] 请求头:', JSON.stringify(redacted));
    }

    if (this.options.logBody && body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      if (bodyStr.length > this.options.maxBodyLogSize) {
        logger.debug(`[TransportDebug] 请求体: ${bodyStr.slice(0, this.options.maxBodyLogSize)}... (truncated)`);
      } else {
        logger.debug('[TransportDebug] 请求体:', bodyStr);
      }
    }
  }

  private logResponse(
    info: TransportDebugInfo,
    headers?: Record<string, string>,
    body?: unknown,
  ): void {
    const parts = [
      `← ${info.statusCode ?? '?'} ${info.method} ${info.endpoint}`,
      `duration=${info.durationMs}ms`,
      `retry=${info.retryCount}`,
    ];

    if (info.tokensIn !== undefined || info.tokensOut !== undefined) {
      parts.push(`tokens=${info.tokensIn ?? 0}/${info.tokensOut ?? 0}`);
    }

    if (info.error) {
      parts.push(`error=${info.error}`);
    }

    logger.debug(`[TransportDebug] ${parts.join(' | ')}`);

    if (this.options.logHeaders && headers) {
      logger.debug('[TransportDebug] 响应头:', JSON.stringify(headers));
    }
  }

  private redactHeaders(headers: Record<string, string>): Record<string, string> {
    if (!this.options.redactSensitive) return headers;

    const redacted: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('authorization') || lowerKey.includes('api-key') || lowerKey.includes('x-api-key')) {
        redacted[key] = redactApiKey(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }
}

let globalTransportDebugger: TransportDebugger | null = null;

export function getTransportDebugger(): TransportDebugger {
  if (!globalTransportDebugger) {
    globalTransportDebugger = new TransportDebugger();
  }
  return globalTransportDebugger;
}

export function enableTransportDebug(): void {
  getTransportDebugger().setOptions({
    enabled: true,
    logRequests: true,
    logResponses: true,
    captureTiming: true,
  });
  logger.info('[TransportDebug] 传输调试已启用');
}

export function disableTransportDebug(): void {
  getTransportDebugger().setOptions({ enabled: false });
  logger.info('[TransportDebug] 传输调试已禁用');
}
