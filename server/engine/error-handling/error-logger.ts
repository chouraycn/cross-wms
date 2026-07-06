import { logger } from '../../logger.js';

export type ErrorSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface ErrorContext {
  service?: string;
  operation?: string;
  requestId?: string;
  sessionId?: string;
  userId?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface ErrorLogEntry {
  id: string;
  severity: ErrorSeverity;
  message: string;
  error?: Error;
  context: ErrorContext;
  timestamp: number;
}

export class ErrorLogger {
  private logs: ErrorLogEntry[] = [];
  private maxLogs = 1000;

  log(severity: ErrorSeverity, message: string, context: ErrorContext = {}, error?: Error): void {
    const entry: ErrorLogEntry = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      severity,
      message,
      error,
      context: {
        timestamp: Date.now(),
        ...context,
      },
      timestamp: Date.now(),
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.writeToLogger(severity, message, context, error);
  }

  debug(message: string, context?: ErrorContext, error?: Error): void {
    this.log('debug', message, context, error);
  }

  info(message: string, context?: ErrorContext, error?: Error): void {
    this.log('info', message, context, error);
  }

  warn(message: string, context?: ErrorContext, error?: Error): void {
    this.log('warn', message, context, error);
  }

  error(message: string, context?: ErrorContext, error?: Error): void {
    this.log('error', message, context, error);
  }

  critical(message: string, context?: ErrorContext, error?: Error): void {
    this.log('critical', message, context, error);
  }

  private writeToLogger(severity: ErrorSeverity, message: string, context: ErrorContext, error?: Error): void {
    const contextStr = Object.keys(context).length > 0
      ? ` [${JSON.stringify(context)}]`
      : '';
    
    switch (severity) {
      case 'debug':
        logger.debug(`${message}${contextStr}`, error);
        break;
      case 'info':
        logger.info(`${message}${contextStr}`, error);
        break;
      case 'warn':
        logger.warn(`${message}${contextStr}`, error);
        break;
      case 'error':
        logger.error(`${message}${contextStr}`, error);
        break;
      case 'critical':
        logger.error(`[CRITICAL] ${message}${contextStr}`, error);
        break;
    }
  }

  getLogs(limit?: number): ErrorLogEntry[] {
    const count = limit || this.logs.length;
    return this.logs.slice(-count);
  }

  getLogsBySeverity(severity: ErrorSeverity, limit?: number): ErrorLogEntry[] {
    const filtered = this.logs.filter(l => l.severity === severity);
    const count = limit || filtered.length;
    return filtered.slice(-count);
  }

  getLogsByService(service: string, limit?: number): ErrorLogEntry[] {
    const filtered = this.logs.filter(l => l.context.service === service);
    const count = limit || filtered.length;
    return filtered.slice(-count);
  }

  clear(): void {
    this.logs = [];
  }

  getCount(): number {
    return this.logs.length;
  }

  getCountBySeverity(): Record<ErrorSeverity, number> {
    const counts: Record<ErrorSeverity, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      critical: 0,
    };

    for (const log of this.logs) {
      counts[log.severity]++;
    }

    return counts;
  }
}

export const errorLogger = new ErrorLogger();