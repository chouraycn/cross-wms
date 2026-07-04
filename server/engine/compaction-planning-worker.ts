/**
 * Compaction Planning Worker — 工作线程调度器
 *
 * 将 CPU 密集的压缩规划任务卸载到工作线程
 */

import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { logger } from '../logger.js';
import {
  buildSummaryChunks,
  buildOversizedFallbackPlan,
  buildStageSplitPlan,
  buildHistoryPrunePlan,
  pruneHistoryForContextShare,
  computeAdaptiveChunkRatio,
  estimateMessagesTokens,
  type OversizedFallbackPlan,
  type StageSplitPlan,
  type HistoryPruneResult,
} from './compaction-planning.js';
import type { AgentMessage } from './context-engine/types.js';

const __dirname = path.dirname(__filename);
import type {
  CompactionPlanningWorkerInput,
  CompactionPlanningWorkerValue,
  CompactionPlanningWorkerResult,
} from './compaction-planning.worker.js';

const COMPACTION_PLANNING_WORKER_TIMEOUT_MS = 60_000;
const COMPACTION_PLANNING_WORKER_MIN_MESSAGES = 64;

class CompactionPlanningWorkerError extends Error {
  constructor(
    message: string,
    readonly code: 'unavailable' | 'timeout' | 'failed',
  ) {
    super(message);
    this.name = 'CompactionPlanningWorkerError';
  }
}

function resolveCompactionPlanningWorkerUrl(): URL {
  const currentPath = __dirname.replaceAll(path.sep, '/');
  const distMarker = '/dist/';
  const distIndex = currentPath.lastIndexOf(distMarker);
  if (distIndex >= 0) {
    const distRoot = __dirname.slice(0, distIndex + distMarker.length);
    return new URL(`file://${path.join(distRoot, 'engine', 'compaction-planning.worker.js').replaceAll(path.sep, '/')}`);
  }
  return new URL(`file://${path.join(__dirname, 'compaction-planning.worker.js').replaceAll(path.sep, '/')}`);
}

function runCompactionPlanningWorker(params: {
  input: CompactionPlanningWorkerInput;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<CompactionPlanningWorkerValue> {
  if (params.signal?.aborted) {
    return Promise.reject(params.signal.reason ?? new Error('compaction planning aborted'));
  }

  const workerUrl = resolveCompactionPlanningWorkerUrl();
  const sourceWorkerExecArgv = workerUrl.pathname.endsWith('.ts') ? ['--import', 'tsx'] : undefined;

  let worker: Worker;
  try {
    worker = new Worker(workerUrl, {
      workerData: params.input,
      execArgv: sourceWorkerExecArgv,
    });
  } catch (error) {
    logger.warn('[CompactionWorker] Worker 创建失败，回退到主线程', { error });
    return Promise.reject(
      new CompactionPlanningWorkerError(
        error instanceof Error ? error.message : String(error),
        'unavailable',
      ),
    );
  }

  worker.unref?.();

  return new Promise<CompactionPlanningWorkerValue>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(
      () => {
        settle(
          () =>
            reject(new CompactionPlanningWorkerError('compaction planning worker timed out', 'timeout')),
          true,
        );
      },
      params.timeoutMs ?? COMPACTION_PLANNING_WORKER_TIMEOUT_MS,
    );

    const abort = () => {
      settle(
        () => reject(params.signal?.reason ?? new Error('compaction planning aborted')),
        true,
      );
    };

    const settle = (finish: () => void, terminate: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      params.signal?.removeEventListener('abort', abort);
      worker.removeAllListeners();
      if (terminate) {
        void worker.terminate();
      }
      finish();
    };

    params.signal?.addEventListener('abort', abort, { once: true });

    worker.once('message', (message: CompactionPlanningWorkerResult) => {
      settle(() => {
        if (message.status === 'ok') {
          resolve(message.value);
          return;
        }
        reject(new CompactionPlanningWorkerError(message.error, 'failed'));
      }, false);
    });

    worker.once('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      settle(() => reject(new CompactionPlanningWorkerError(message, 'unavailable')), true);
    });

    worker.once('exit', (code) => {
      if (code === 0) return;
      settle(
        () =>
          reject(
            new CompactionPlanningWorkerError(
              `compaction planning worker exited with code ${code}`,
              'unavailable',
            ),
          ),
        false,
      );
    });
  });
}

function shouldFallbackToMainThread(error: unknown): boolean {
  return error instanceof CompactionPlanningWorkerError && error.code === 'unavailable';
}

function shouldUsePlanningWorker(messageCount: number): boolean {
  return messageCount >= COMPACTION_PLANNING_WORKER_MIN_MESSAGES;
}

async function runWithUnavailableFallback<T extends CompactionPlanningWorkerValue>(params: {
  input: CompactionPlanningWorkerInput;
  signal?: AbortSignal;
  fallback: () => T;
  isExpected: (value: CompactionPlanningWorkerValue) => value is T;
}): Promise<T> {
  try {
    const value = await runCompactionPlanningWorker({
      input: params.input,
      signal: params.signal,
    });
    if (params.isExpected(value)) {
      return value;
    }
    throw new CompactionPlanningWorkerError('unexpected compaction planning worker result', 'failed');
  } catch (error) {
    if (shouldFallbackToMainThread(error)) {
      return params.fallback();
    }
    throw error;
  }
}

export async function buildSummaryChunksWithWorker(params: {
  messages: AgentMessage[];
  maxChunkTokens: number;
  signal?: AbortSignal;
}): Promise<AgentMessage[][]> {
  if (!shouldUsePlanningWorker(params.messages.length)) {
    return buildSummaryChunks(params.messages, params.maxChunkTokens);
  }

  const value = await runWithUnavailableFallback({
    input: {
      kind: 'summaryChunks',
      messages: params.messages,
      maxChunkTokens: params.maxChunkTokens,
    },
    signal: params.signal,
    fallback: () => ({
      kind: 'summaryChunks' as const,
      chunks: buildSummaryChunks(params.messages, params.maxChunkTokens),
    }),
    isExpected: (valueCandidate): valueCandidate is { kind: 'summaryChunks'; chunks: AgentMessage[][] } =>
      valueCandidate.kind === 'summaryChunks',
  });

  return value.chunks;
}

export async function buildOversizedFallbackPlanWithWorker(params: {
  messages: AgentMessage[];
  contextWindow: number;
  signal?: AbortSignal;
}): Promise<OversizedFallbackPlan> {
  if (!shouldUsePlanningWorker(params.messages.length)) {
    return buildOversizedFallbackPlan(params.messages, params.contextWindow);
  }

  const value = await runWithUnavailableFallback({
    input: {
      kind: 'oversizedFallback',
      messages: params.messages,
      contextWindow: params.contextWindow,
    },
    signal: params.signal,
    fallback: () => ({
      kind: 'oversizedFallback' as const,
      ...buildOversizedFallbackPlan(params.messages, params.contextWindow),
    }),
    isExpected: (
      valueEntry,
    ): valueEntry is { kind: 'oversizedFallback'; smallMessages: AgentMessage[]; oversizedNotes: string[] } =>
      valueEntry.kind === 'oversizedFallback',
  });

  return {
    smallMessages: value.smallMessages,
    oversizedNotes: value.oversizedNotes,
  };
}

export async function buildStageSplitPlanWithWorker(params: {
  messages: AgentMessage[];
  maxChunkTokens: number;
  parts?: number;
  minMessagesForSplit?: number;
  signal?: AbortSignal;
}): Promise<StageSplitPlan> {
  if (!shouldUsePlanningWorker(params.messages.length)) {
    return buildStageSplitPlan(params.messages, params.maxChunkTokens, params.parts, params.minMessagesForSplit);
  }

  const value = await runWithUnavailableFallback({
    input: {
      kind: 'stageSplit',
      messages: params.messages,
      maxChunkTokens: params.maxChunkTokens,
      parts: params.parts,
      minMessagesForSplit: params.minMessagesForSplit,
    },
    signal: params.signal,
    fallback: () => ({
      kind: 'stageSplit' as const,
      ...buildStageSplitPlan(params.messages, params.maxChunkTokens, params.parts, params.minMessagesForSplit),
    }),
    isExpected: (
      valueResult,
    ): valueResult is { kind: 'stageSplit'; mode: 'single' | 'split'; chunks?: AgentMessage[][] } =>
      valueResult.kind === 'stageSplit',
  });

  return value.mode === 'split' ? { mode: 'split', chunks: value.chunks } : { mode: 'single' };
}

export async function buildHistoryPrunePlanWithWorker(params: {
  messagesToSummarize: AgentMessage[];
  turnPrefixMessages: AgentMessage[];
  tokensBefore: number;
  contextWindowTokens: number;
  maxHistoryShare: number;
  parts?: number;
  signal?: AbortSignal;
}): Promise<{
  summarizableTokens: number;
  newContentTokens: number;
  maxHistoryTokens: number;
  pruned?: HistoryPruneResult;
}> {
  if (!shouldUsePlanningWorker(params.messagesToSummarize.length + params.turnPrefixMessages.length)) {
    const summarizableTokens =
      estimateMessagesTokens(params.messagesToSummarize) + estimateMessagesTokens(params.turnPrefixMessages);
    const newContentTokens = Math.max(0, Math.floor(params.tokensBefore - summarizableTokens));
    const maxHistoryTokens = Math.floor(params.contextWindowTokens * params.maxHistoryShare);

    if (newContentTokens <= maxHistoryTokens) {
      return { summarizableTokens, newContentTokens, maxHistoryTokens };
    }

    const pruned = pruneHistoryForContextShare(params.messagesToSummarize, params.contextWindowTokens, params.maxHistoryShare, params.parts);
    return { summarizableTokens, newContentTokens, maxHistoryTokens, pruned };
  }

  const value = await runWithUnavailableFallback({
    input: {
      kind: 'historyPrune',
      messagesToSummarize: params.messagesToSummarize,
      turnPrefixMessages: params.turnPrefixMessages,
      tokensBefore: params.tokensBefore,
      contextWindowTokens: params.contextWindowTokens,
      maxHistoryShare: params.maxHistoryShare,
      parts: params.parts,
    },
    signal: params.signal,
    fallback: () => {
      const summarizableTokens =
        estimateMessagesTokens(params.messagesToSummarize) + estimateMessagesTokens(params.turnPrefixMessages);
      const newContentTokens = Math.max(0, Math.floor(params.tokensBefore - summarizableTokens));
      const maxHistoryTokens = Math.floor(params.contextWindowTokens * params.maxHistoryShare);

      if (newContentTokens <= maxHistoryTokens) {
        return {
          kind: 'historyPrune' as const,
          summarizableTokens,
          newContentTokens,
          maxHistoryTokens,
        };
      }

      const pruned = pruneHistoryForContextShare(params.messagesToSummarize, params.contextWindowTokens, params.maxHistoryShare, params.parts);
      return {
        kind: 'historyPrune' as const,
        summarizableTokens,
        newContentTokens,
        maxHistoryTokens,
        pruned,
      };
    },
    isExpected: (
      valueValue,
    ): valueValue is {
      kind: 'historyPrune';
      summarizableTokens: number;
      newContentTokens: number;
      maxHistoryTokens: number;
      pruned?: HistoryPruneResult;
    } => valueValue.kind === 'historyPrune',
  });

  return {
    summarizableTokens: value.summarizableTokens,
    newContentTokens: value.newContentTokens,
    maxHistoryTokens: value.maxHistoryTokens,
    pruned: value.pruned,
  };
}

export async function computeAdaptiveChunkRatioWithWorker(params: {
  messages: AgentMessage[];
  contextWindow: number;
  signal?: AbortSignal;
}): Promise<number> {
  if (!shouldUsePlanningWorker(params.messages.length)) {
    return computeAdaptiveChunkRatio(params.messages, params.contextWindow);
  }

  const value = await runWithUnavailableFallback({
    input: {
      kind: 'adaptiveChunkRatio',
      messages: params.messages,
      contextWindow: params.contextWindow,
    },
    signal: params.signal,
    fallback: () => ({
      kind: 'adaptiveChunkRatio' as const,
      ratio: computeAdaptiveChunkRatio(params.messages, params.contextWindow),
    }),
    isExpected: (
      valueLocal,
    ): valueLocal is { kind: 'adaptiveChunkRatio'; ratio: number } =>
      valueLocal.kind === 'adaptiveChunkRatio',
  });

  return value.ratio;
}