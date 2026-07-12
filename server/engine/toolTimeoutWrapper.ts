/**
 * Tool Timeout Wrapper — 工具执行超时与取消传播
 *
 * 为每个工具调用提供独立的超时保护和 AbortSignal 传播机制：
 * 1. 为每个工具调用创建独立的 AbortController
 * 2. 合并外部 signal + 工具级超时 signal
 * 3. 工具执行超时自动取消并抛出错误
 * 4. 用户取消时立即停止正在执行的工具
 * 5. 支持工具级别超时配置
 *
 * v11.1: 新增工具执行超时机制
 */

import { logger } from '../logger.js';
import { getToolTimeout } from './toolTimeoutConfig.js';
import { abortPrimitives } from './abortPrimitives.js';
// P1-3: 使用统一的错误类型类（支持 instanceof）
import { ToolTimeoutError, ToolAbortError } from '../errors/toolErrors.js';

export interface ToolTimeoutOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * 执行工具调用，附带超时与取消传播。
 *
 * P2-4: 纳入 abortPrimitives 管理树：
 * - 使用 createTimeoutController 注册受管控制器，使 abortAll()/dispose() 能级联到工具级超时
 * - 外部 signal 通过事件监听桥接到受管控制器（无需 AbortSignal.any 组合）
 * - finally 中调用 release() 清理受管资源
 * - 错误分类基于 abortReason.reason（'timeout' vs 'cascaded'），比原先的 signal.aborted 推断更准确
 */
export async function executeToolCallWithTimeout<T>(
  toolName: string,
  executor: (signal: AbortSignal) => Promise<T>,
  options: ToolTimeoutOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? getToolTimeout(toolName);
  const externalSignal = options.signal;

  // P2-4: 创建受管理的超时控制器，纳入 abortPrimitives 管理树
  const controllerId = `tool-timeout:${toolName}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const managedController = abortPrimitives.createTimeoutController(controllerId, timeoutMs);

  // 桥接外部 signal：外部中止时级联到受管控制器
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortPrimitives.abort(controllerId, {
        reason: 'cascaded',
        source: 'external',
        timestamp: Date.now(),
        message: 'External signal already aborted',
      });
    } else {
      // P0: 存储 listener 并注册到 cleanupFns，在 release 时自动移除
      const externalListener = () => {
        abortPrimitives.abort(controllerId, {
          reason: 'cascaded',
          source: 'external',
          timestamp: Date.now(),
          message: 'External signal aborted',
        });
      };
      externalSignal.addEventListener('abort', externalListener);
      if (!managedController.cleanupFns) managedController.cleanupFns = [];
      managedController.cleanupFns.push(() => externalSignal.removeEventListener('abort', externalListener));
    }
  }

  const combinedSignal = managedController.signal;

  try {
    // 预检：外部 signal 已中止时立即抛出，不调用 executor
    if (combinedSignal.aborted) {
      const abortReason = abortPrimitives.getAbortReason(controllerId);
      const isTimeout = abortReason?.reason === 'timeout';
      if (isTimeout) {
        throw new ToolTimeoutError(toolName, timeoutMs);
      } else {
        throw new ToolAbortError(toolName, abortReason?.reason ?? 'cascaded');
      }
    }
    const result = await executor(combinedSignal);
    return result;
  } catch (error) {
    if (combinedSignal.aborted) {
      // P2-4: 基于 abortReason.reason 精确分类（timeout vs cascaded）
      const abortReason = abortPrimitives.getAbortReason(controllerId);
      const isTimeout = abortReason?.reason === 'timeout';
      if (isTimeout) {
        // P1-3: 使用统一错误类
        const timeoutErr = new ToolTimeoutError(toolName, timeoutMs, error);
        logger.warn(`[ToolTimeout] Tool execution timeout: ${toolName}, timeout=${timeoutMs}ms`);
        throw timeoutErr;
      } else {
        const abortErr = new ToolAbortError(toolName, abortReason?.reason ?? 'cascaded', error);
        logger.debug(`[ToolTimeout] Tool execution aborted: ${toolName} (reason=${abortReason?.reason})`);
        throw abortErr;
      }
    }
    throw error;
  } finally {
    // P2-4: 释放受管资源（从 abortPrimitives Map 中移除，并中止仍在 pending 的控制器）
    abortPrimitives.release(controllerId);
  }
}