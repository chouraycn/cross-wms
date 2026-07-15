/**
 * 线束生命周期管理 — 参考 OpenClaw harness/lifecycle.ts
 * 
 * 包装线束尝试，提供：
 * - 诊断追踪传播
 * - 结果分类
 * - 错误处理
 * - 运行状态管理
 */

import {
  createChildDiagnosticTraceContext,
  freezeDiagnosticTraceContext,
  getActiveDiagnosticTraceContext,
  runWithDiagnosticTraceContext,
  type DiagnosticTraceContext,
} from '../../infra/diagnostic-trace-context.js';
import {
  registerActiveRun,
  unregisterActiveRun,
  updateRunStatus,
  notifyRunEnded,
} from '../runManager.js';
import { logger } from '../../logger.js';
import type {
  AgentHarness,
  HarnessAttemptParams,
  HarnessAttemptResult,
  HarnessResultClassification,
} from './types.js';

/** 生命周期阶段 */
type LifecyclePhase = 'starting' | 'running' | 'streaming' | 'completing' | 'completed' | 'error' | 'aborted';

/** 运行完成结果 */
interface RunCompletion {
  outcome: 'completed' | 'aborted' | 'blocked' | 'error';
  blockedBy?: string;
  error?: unknown;
}

/** 分类结果 */
function classifyResult(
  harness: AgentHarness,
  result: HarnessAttemptResult,
  params: HarnessAttemptParams,
): HarnessResultClassification {
  if (harness.classify) {
    const custom = harness.classify(result, params);
    if (custom) return custom;
  }
  if (result.promptError) return 'error';
  if (result.externalAbort || result.aborted) return 'aborted';
  if (result.timedOut || result.idleTimedOut) return 'timeout';
  if (result.timedOutDuringCompaction) return 'compaction_failure';
  return 'ok';
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

  // 注册活跃运行
  const handle = {
    kind: 'embedded' as const,
    queueMessage: async () => {},
    isStreaming: () => false,
    isCompacting: () => false,
    abort: (reason?: string) => {
      logger.warn(`[HarnessLifecycle] 中止运行: ${runId}, 原因: ${reason ?? 'unknown'}`);
    },
  };
  registerActiveRun(sessionId, handle);
  updateRunStatus(sessionId, 'running');

  try {
    // 在追踪上下文中运行
    const result = await runWithDiagnosticTraceContext(trace, () =>
      harness.runAttempt(params),
    );

    // 分类结果
    const classification = classifyResult(harness, result, params);
    const completion = resolveCompletion(result);

    logger.info(
      `[HarnessLifecycle] 线束尝试完成: ${harness.id}, runId=${runId}, ` +
      `分类=${classification}, 结果=${completion.outcome}`,
    );

    // 附加分类到结果
    result.agentHarnessResultClassification = classification;

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
