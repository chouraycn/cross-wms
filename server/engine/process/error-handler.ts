/**
 * 错误处理
 *
 * 错误分类、恢复建议与日志记录。
 */

import { logger } from '../../logger.js';
import type { ProcessConfig, TerminationReason } from './types.js';

/** 错误类别 */
export type ErrorCategory =
  | 'spawn-error'
  | 'exit-nonzero'
  | 'signal'
  | 'timeout'
  | 'crash'
  | 'ipc-error'
  | 'stdin-error'
  | 'resource-limit'
  | 'unknown';

/** 分类后的进程错误 */
export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  cause?: unknown;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  /** 建议的终止原因 */
  suggestedReason: TerminationReason;
  /** 是否可恢复（可重启） */
  recoverable: boolean;
}

/** 错误处理结果 */
export interface HandleResult {
  classified: ClassifiedError;
  logged: boolean;
}

/**
 * 错误处理器
 *
 * 接收进程抛出的错误/退出信息，分类并记录日志。
 */
export class ProcessErrorHandler {
  /** 主分类入口 */
  classify(params: {
    error?: unknown;
    exitCode?: number | null;
    signal?: NodeJS.Signals | null;
    timeoutMs?: number;
    durationMs?: number;
    config: ProcessConfig;
  }): ClassifiedError {
    const { error, exitCode, signal, timeoutMs, durationMs, config } = params;

    if (error !== undefined) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ENOENT')) {
        return {
          category: 'spawn-error',
          message,
          cause: error,
          suggestedReason: 'spawn-error',
          recoverable: false,
        };
      }
      if (message.includes('EACCES')) {
        return {
          category: 'spawn-error',
          message,
          cause: error,
          suggestedReason: 'spawn-error',
          recoverable: false,
        };
      }
      if (message.includes('timed out') || (timeoutMs && durationMs !== undefined && durationMs >= timeoutMs)) {
        return {
          category: 'timeout',
          message,
          cause: error,
          suggestedReason: 'overall-timeout',
          recoverable: true,
        };
      }
      if (message.includes('ipc') || message.includes('channel')) {
        return {
          category: 'ipc-error',
          message,
          cause: error,
          suggestedReason: 'crash',
          recoverable: true,
        };
      }
      return {
        category: 'unknown',
        message,
        cause: error,
        suggestedReason: 'crash',
        recoverable: true,
      };
    }

    if (signal !== null && signal !== undefined) {
      return {
        category: 'signal',
        message: `process killed by signal ${signal}`,
        signal,
        exitCode: exitCode ?? null,
        suggestedReason: 'signal',
        recoverable: true,
      };
    }

    if (exitCode !== null && exitCode !== 0 && exitCode !== undefined) {
      // 124 是约定俗成的超时退出码（来自 coreutils `timeout`）
      if (exitCode === 124) {
        return {
          category: 'timeout',
          message: `process exited with timeout code ${exitCode}`,
          exitCode,
          suggestedReason: 'overall-timeout',
          recoverable: true,
        };
      }
      if (exitCode >= 128 && exitCode < 128 + 32) {
        // 128+signal 是 bash 风格的信号退出
        const sig = exitCode - 128;
        return {
          category: 'signal',
          message: `process exited with signal code ${sig} (exit ${exitCode})`,
          exitCode,
          suggestedReason: 'crash',
          recoverable: true,
        };
      }
      return {
        category: 'exit-nonzero',
        message: `process exited with code ${exitCode}`,
        exitCode,
        suggestedReason: 'crash',
        recoverable: true,
      };
    }

    return {
      category: 'unknown',
      message: 'process ended with no error and zero exit code',
      exitCode: exitCode ?? 0,
      suggestedReason: 'exit',
      recoverable: false,
    };
  }

  /** 记录日志 */
  handle(
    classified: ClassifiedError,
    config: ProcessConfig,
    processId: string,
  ): HandleResult {
    const level = this.logLevelFor(classified);
    if (level === 'error') {
      logger.error(
        `[Process:Error] ${config.name}/${processId} category=${classified.category} reason=${classified.suggestedReason} message=${classified.message}`,
      );
    } else if (level === 'warn') {
      logger.warn(
        `[Process:Error] ${config.name}/${processId} category=${classified.category} reason=${classified.suggestedReason} message=${classified.message}`,
      );
    } else {
      logger.debug(
        `[Process:Error] ${config.name}/${processId} category=${classified.category} reason=${classified.suggestedReason} message=${classified.message}`,
      );
    }
    return { classified, logged: true };
  }

  /** 根据错误类别决定日志级别 */
  private logLevelFor(classified: ClassifiedError): 'error' | 'warn' | 'debug' {
    switch (classified.category) {
      case 'spawn-error':
        return 'error';
      case 'crash':
      case 'ipc-error':
      case 'resource-limit':
        return 'warn';
      case 'exit-nonzero':
      case 'signal':
      case 'timeout':
        return 'warn';
      default:
        return 'debug';
    }
  }
}

/** 判断是否为致命错误（不可恢复） */
export function isFatalError(classified: ClassifiedError): boolean {
  return !classified.recoverable;
}
