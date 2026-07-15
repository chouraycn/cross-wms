/**
 * 线束生命周期管理 — 参考 OpenClaw harness/lifecycle.ts
 * 
 * 包装线束尝试，提供：
 * - 诊断追踪传播
 * - 结果分类（集成 result-classification 模块）
 * - 错误处理与重试判断
 * - 运行状态管理（流式/压缩状态跟踪）
 * - AbortController 中止支持
 */

import {
  createChildDiagnosticTraceContext,
  getActiveDiagnosticTraceContext,
  runWithDiagnosticTraceContext,
} from '../../infra/diagnostic-trace-context.js';
import {
  registerActiveRun,
  unregisterActiveRun,
  updateRunStatus,
  notifyRunEnded,
  type RunQueueHandle,
} from '../runManager.js';
import { logger } from '../../logger.js';
import { applyHarnessResultClassification } from './result-classification.js';
import type {
  AgentHarness,
  HarnessAttemptParams,
  HarnessAttemptResult,
} from './types.js';

/** 运行完成结果 */
interface RunCompletion {
  outcome: 'completed' | 'aborted' | 'blocked' | 'error';
  blockedBy?: string;
  error?: unknown;
}

/** 解析运行完成状态 */
function resolveCompletion(result: HarnessAttemptResult): RunCompletion {
  if (result.promptErrorSource === 'hook:before_agent_run') {
    return { outcome: 'blocked', blockedBy: result.promptErrorSource };
  }
  if (result.promptError) return { outcome: 'error', error: result.promptError };
  if (result.externalAbort || result.aborted) return { outcome: 'aborted' };
  if (result.timedOut || result.idleTimedOut) return { outcome: 'error', error: 'timeout' };
  return { outcome: 'completed' };
}

/** 运行线束生命周期尝试 */
export async function runHarnessLifecycleAttempt(
  harness: AgentHarness,
  params: HarnessAttemptParams,
): Promise<HarnessAttemptResult> {
  const { sessionId, runId } = params;

  // 创建或继承诊断追踪上下文
  const parentTrace = getActiveDiagnosticTraceContext();
  const trace = params.trace ?? (parentTrace
    ? createChildDiagnosticTraceContext(parentTrace)
    : createChildDiagnosticTraceContext({ traceId: runId, spanId: runId }));

  logger.info(`[HarnessLifecycle] 开始线束尝试: ${harness.id}, runId=${runId}`);

  // 创建中止控制器
  const abortController = new AbortController();
  const streaming = false;
  const compacting = false;

  // 注册活跃运行
  const handle: RunQueueHandle = {
    kind: 'embedded',
    queueMessage: async () => {},
    isStreaming: () => streaming,
    isCompacting: () => compacting,
    abort: (reason?: 'restart' | 'timeout' | 'error') => {
      logger.warn(`[HarnessLifecycle] 中止运行: ${runId}, 原因: ${reason ?? 'unknown'}`);
      abortController.abort();
    },
  };
  registerActiveRun(sessionId, handle);
  updateRunStatus(sessionId, 'running');

  try {
    // 在追踪上下文中运行
    const result = await runWithDiagnosticTraceContext(trace, () =>
      harness.runAttempt(params),
    );

    // 使用 result-classification 模块进行分类
    const classificationDetail = applyHarnessResultClassification({
      result,
      params,
      harness,
    });
    const completion = resolveCompletion(result);

    logger.info(
      `[HarnessLifecycle] 线束尝试完成: ${harness.id}, runId=${runId}, ` +
      `分类=${classificationDetail.classification}, 结果=${completion.outcome}, ` +
      `可重试=${classificationDetail.retryable}, 建议=${classificationDetail.suggestedAction ?? 'continue'}`,
    );

    // 附加分类到结果
    result.agentHarnessResultClassification = classificationDetail.classification;

    // 更新运行状态
    if (completion.outcome === 'completed') {
      updateRunStatus(sessionId, 'completed');
    } else if (completion.outcome === 'aborted') {
      updateRunStatus(sessionId, 'aborted');
    } else {
      updateRunStatus(sessionId, 'failed');
    }

    return result;
  } catch (err) {
    // 检查是否为中止
    if (abortController.signal.aborted) {
      logger.info(`[HarnessLifecycle] 运行被中止: ${harness.id}, runId=${runId}`);
      updateRunStatus(sessionId, 'aborted');
      return {
        text: '',
        aborted: true,
      };
    }

    logger.error(`[HarnessLifecycle] 线束尝试异常: ${harness.id}, runId=${runId}`, err);
    updateRunStatus(sessionId, 'failed');

    return {
      text: '',
      promptError: err instanceof Error ? err.message : String(err),
      aborted: false,
    };
  } finally {
    unregisterActiveRun(sessionId);
    notifyRunEnded(sessionId, true);
  }
}
