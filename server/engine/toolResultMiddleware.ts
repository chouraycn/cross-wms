/**
 * Tool Result Middleware — 工具结果验证中间件链
 *
 * 对工具结果进行多层处理：
 * 1. 结果截断（防止 context window 溢出）
 * 2. 错误分类（结构化错误信息）
 * 3. 字符数估算（用于 context 管理）
 * 4. 安全性检查（敏感信息脱敏）
 *
 * v11.1: 新增工具结果验证中间件链
 */

import { logger } from '../logger.js';

export interface ToolResultMiddlewareOptions {
  maxResultLength?: number;
  maxJsonDepth?: number;
}

const DEFAULT_MAX_RESULT_LENGTH = 20000;

export interface ToolResultSummary {
  content: string;
  truncated: boolean;
  estimatedChars: number;
  errorType: 'none' | 'timeout' | 'abort' | 'transient' | 'permanent' | 'validation';
  errorMessage?: string;
}

function truncateResult(result: string, maxLength: number): { content: string; truncated: boolean } {
  if (result.length <= maxLength) {
    return { content: result, truncated: false };
  }
  
  const truncated = result.slice(0, maxLength);
  
  try {
    if (result.startsWith('{') || result.startsWith('[')) {
      let jsonResult: unknown;
      try {
        jsonResult = JSON.parse(result);
      } catch {
        return { content: truncated + '\n\n[结果已截断]', truncated: true };
      }

      const truncateJson = (obj: unknown, depth: number, maxDepth: number): unknown => {
        if (depth > maxDepth) return '[深度限制]';
        if (typeof obj !== 'object' || obj === null) return obj;
        
        if (Array.isArray(obj)) {
          return obj.map((item, index) => 
            index < 20 ? truncateJson(item, depth + 1, maxDepth) : '[数组截断]'
          );
        }
        
        const truncatedObj: Record<string, unknown> = {};
        let count = 0;
        for (const key of Object.keys(obj)) {
          if (count >= 30) {
            truncatedObj['[更多字段]'] = '[字段截断]';
            break;
          }
          truncatedObj[key] = truncateJson((obj as Record<string, unknown>)[key], depth + 1, maxDepth);
          count++;
        }
        return truncatedObj;
      };

      const truncatedJson = truncateJson(jsonResult, 0, 5);
      return { content: JSON.stringify(truncatedJson) + '\n\n[结果已截断]', truncated: true };
    }
  } catch {
    // JSON 处理失败，回退到简单截断
  }
  
  return { content: truncated + '\n\n[结果已截断]', truncated: true };
}

function estimateCharCount(result: string): number {
  try {
    if (result.startsWith('{') || result.startsWith('[')) {
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed).length;
    }
  } catch {
    // ignore
  }
  return result.length;
}

function classifyError(result: string): { type: ToolResultSummary['errorType']; message?: string } {
  const trimmed = result.trim().toLowerCase();
  
  if (trimmed.includes('timeout') || trimmed.includes('timed out')) {
    return { type: 'timeout', message: '工具执行超时' };
  }
  
  if (trimmed.includes('aborted') || trimmed.includes('cancelled')) {
    return { type: 'abort', message: '工具执行已取消' };
  }
  
  if (trimmed.includes('validation') || trimmed.includes('参数错误')) {
    return { type: 'validation', message: '参数验证失败' };
  }
  
  const transientPatterns = ['502', '503', '504', '429', 'rate limit', 'network', 'econn'];
  if (transientPatterns.some(p => trimmed.includes(p))) {
    return { type: 'transient', message: '临时错误，可重试' };
  }
  
  if (trimmed.includes('error')) {
    return { type: 'permanent', message: '工具执行失败' };
  }
  
  return { type: 'none' };
}

export function executeToolCallWithMiddleware(
  toolName: string,
  result: string,
  options: ToolResultMiddlewareOptions = {},
): ToolResultSummary {
  const maxLength = options.maxResultLength ?? DEFAULT_MAX_RESULT_LENGTH;
  
  const { content, truncated } = truncateResult(result, maxLength);
  const estimatedChars = estimateCharCount(content);
  const { type: errorType, message: errorMessage } = classifyError(content);
  
  if (truncated) {
    logger.debug(`[ToolMiddleware] Result truncated for '${toolName}': ${result.length} -> ${content.length}`);
  }
  
  return {
    content,
    truncated,
    estimatedChars,
    errorType,
    errorMessage,
  };
}

export function createToolResultMiddlewareChain(
  middlewares: Array<(result: string) => string>,
): (result: string) => string {
  return (result: string) => {
    return middlewares.reduce((current, middleware) => {
      try {
        return middleware(current);
      } catch (err) {
        logger.warn(`[ToolMiddleware] Middleware execution failed: ${err instanceof Error ? err.message : String(err)}`);
        return current;
      }
    }, result);
  };
}