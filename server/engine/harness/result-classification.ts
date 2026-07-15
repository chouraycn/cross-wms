/**
 * 结果分类器 — 参考 OpenClaw harness/result-classification.ts
 *
 * 将线束尝试结果分类为标准化的结果类型，
 * 用于决定后续处理流程（重试、降级、通知等）。
 *
 * 分类优先级：
 * 1. 线束自定义分类（如果 harness.classify 存在）
 * 2. 钩子阻塞（promptErrorSource === 'hook:before_agent_run'）
 * 3. 提示词错误
 * 4. 外部中止
 * 5. 超时
 * 6. 压缩超时
 * 7. 默认成功
 */

import type {
  AgentHarness,
  HarnessAttemptParams,
  HarnessAttemptResult,
  HarnessResultClassification,
} from './types.js';

/** 分类上下文 */
export interface ClassificationContext {
  result: HarnessAttemptResult;
  params: HarnessAttemptParams;
  harness: AgentHarness;
}

/** 分类结果详情 */
export interface ClassificationDetail {
  classification: HarnessResultClassification;
  /** 是否可重试 */
  retryable: boolean;
  /** 阻塞来源（如果被阻塞） */
  blockedBy?: string;
  /** 建议的后续操作 */
  suggestedAction?: 'retry' | 'fallback' | 'abort' | 'notify' | 'continue';
}

/**
 * 应用线束结果分类
 *
 * @param ctx - 分类上下文
 * @returns 分类详情
 */
export function applyHarnessResultClassification(
  ctx: ClassificationContext,
): ClassificationDetail {
  const { result, params, harness } = ctx;

  // 1. 线束自定义分类
  if (harness.classify) {
    const custom = harness.classify(result, params);
    if (custom) {
      return buildClassificationDetail(custom, result);
    }
  }

  // 2. 钩子阻塞
  if (result.promptErrorSource === 'hook:before_agent_run') {
    return {
      classification: 'blocked',
      retryable: false,
      blockedBy: result.promptErrorSource,
      suggestedAction: 'notify',
    };
  }

  // 3. 提示词错误
  if (result.promptError) {
    return {
      classification: 'error',
      retryable: isRetryableError(result.promptError),
      suggestedAction: isRetryableError(result.promptError) ? 'retry' : 'abort',
    };
  }

  // 4. 外部中止
  if (result.externalAbort) {
    return {
      classification: 'aborted',
      retryable: false,
      suggestedAction: 'abort',
    };
  }

  // 5. 用户中止
  if (result.aborted) {
    return {
      classification: 'aborted',
      retryable: false,
      suggestedAction: 'continue',
    };
  }

  // 6. 超时
  if (result.timedOut || result.idleTimedOut) {
    return {
      classification: 'timeout',
      retryable: true,
      suggestedAction: 'retry',
    };
  }

  // 7. 压缩超时
  if (result.timedOutDuringCompaction) {
    return {
      classification: 'compaction_failure',
      retryable: true,
      suggestedAction: 'fallback',
    };
  }

  // 8. 默认成功
  return {
    classification: 'ok',
    retryable: false,
    suggestedAction: 'continue',
  };
}

/** 构建分类详情（基于预分类结果） */
function buildClassificationDetail(
  classification: HarnessResultClassification,
  result: HarnessAttemptResult,
): ClassificationDetail {
  switch (classification) {
    case 'ok':
      return { classification, retryable: false, suggestedAction: 'continue' };
    case 'error':
      return {
        classification,
        retryable: isRetryableError(result.promptError),
        suggestedAction: isRetryableError(result.promptError) ? 'retry' : 'abort',
      };
    case 'aborted':
      return { classification, retryable: false, suggestedAction: 'continue' };
    case 'blocked':
      return { classification, retryable: false, blockedBy: result.promptErrorSource, suggestedAction: 'notify' };
    case 'timeout':
      return { classification, retryable: true, suggestedAction: 'retry' };
    case 'compaction_failure':
      return { classification, retryable: true, suggestedAction: 'fallback' };
    default:
      return { classification, retryable: false, suggestedAction: 'continue' };
  }
}

/** 判断错误是否可重试 */
function isRetryableError(error?: string): boolean {
  if (!error) return false;
  const retryablePatterns = [
    /rate.?limit/i,
    /timeout/i,
    /connection.?reset/i,
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /5\d\d/,
    /service.?unavailable/i,
    /internal.?server.?error/i,
    /overloaded/i,
    /temporarily/i,
  ];
  return retryablePatterns.some((pattern) => pattern.test(error));
}

/** 判断分类是否为失败类型 */
export function isFailedClassification(classification: HarnessResultClassification): boolean {
  return classification !== 'ok';
}

/** 判断分类是否应该重试 */
export function shouldRetry(classification: HarnessResultClassification): boolean {
  return classification === 'timeout' || classification === 'compaction_failure';
}
