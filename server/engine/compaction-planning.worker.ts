/**
 * Compaction Planning Worker — 工作线程实现
 *
 * 在工作线程中运行 CPU 密集的压缩规划任务
 */

import { parentPort, workerData } from 'node:worker_threads';
import {
  buildSummaryChunks,
  buildOversizedFallbackPlan,
  buildStageSplitPlan,
  buildHistoryPrunePlan,
  computeAdaptiveChunkRatio,
  estimateMessagesTokens,
  type AgentMessage,
  type OversizedFallbackPlan,
  type StageSplitPlan,
  type HistoryPruneResult,
} from './compaction-planning.js';

export type CompactionPlanningWorkerInput =
  | { kind: 'summaryChunks'; messages: AgentMessage[]; maxChunkTokens: number }
  | { kind: 'oversizedFallback'; messages: AgentMessage[]; contextWindow: number }
  | { kind: 'stageSplit'; messages: AgentMessage[]; maxChunkTokens: number; parts?: number; minMessagesForSplit?: number }
  | {
      kind: 'historyPrune';
      messagesToSummarize: AgentMessage[];
      turnPrefixMessages: AgentMessage[];
      tokensBefore: number;
      contextWindowTokens: number;
      maxHistoryShare: number;
      parts?: number;
    }
  | { kind: 'adaptiveChunkRatio'; messages: AgentMessage[]; contextWindow: number };

export type CompactionPlanningWorkerValue =
  | { kind: 'summaryChunks'; chunks: AgentMessage[][] }
  | { kind: 'oversizedFallback'; smallMessages: AgentMessage[]; oversizedNotes: string[] }
  | { kind: 'stageSplit'; mode: 'single' | 'split'; chunks?: AgentMessage[][] }
  | {
      kind: 'historyPrune';
      summarizableTokens: number;
      newContentTokens: number;
      maxHistoryTokens: number;
      pruned?: HistoryPruneResult;
    }
  | { kind: 'adaptiveChunkRatio'; ratio: number };

export type CompactionPlanningWorkerResult =
  | { status: 'ok'; value: CompactionPlanningWorkerValue }
  | { status: 'error'; error: string };

function execute(input: CompactionPlanningWorkerInput): CompactionPlanningWorkerValue {
  switch (input.kind) {
    case 'summaryChunks':
      return {
        kind: 'summaryChunks',
        chunks: buildSummaryChunks(input.messages, input.maxChunkTokens),
      };

    case 'oversizedFallback': {
      const plan = buildOversizedFallbackPlan(input.messages, input.contextWindow);
      return {
        kind: 'oversizedFallback',
        smallMessages: plan.smallMessages,
        oversizedNotes: plan.oversizedNotes,
      };
    }

    case 'stageSplit': {
      const plan = buildStageSplitPlan(input.messages, input.maxChunkTokens, input.parts, input.minMessagesForSplit);
      return {
        kind: 'stageSplit',
        mode: plan.mode,
        chunks: plan.chunks,
      };
    }

    case 'historyPrune': {
      const summarizableTokens =
        estimateMessagesTokens(input.messagesToSummarize) + estimateMessagesTokens(input.turnPrefixMessages);
      const newContentTokens = Math.max(0, Math.floor(input.tokensBefore - summarizableTokens));
      const maxHistoryTokens = Math.floor(input.contextWindowTokens * input.maxHistoryShare);

      if (newContentTokens <= maxHistoryTokens) {
        return {
          kind: 'historyPrune',
          summarizableTokens,
          newContentTokens,
          maxHistoryTokens,
        };
      }

      const pruned = buildHistoryPrunePlan(input.messagesToSummarize, input.contextWindowTokens, input.maxHistoryShare, input.parts);
      return {
        kind: 'historyPrune',
        summarizableTokens,
        newContentTokens,
        maxHistoryTokens,
        pruned,
      };
    }

    case 'adaptiveChunkRatio':
      return {
        kind: 'adaptiveChunkRatio',
        ratio: computeAdaptiveChunkRatio(input.messages, input.contextWindow),
      };

    default:
      throw new Error(`Unknown input kind: ${(input as CompactionPlanningWorkerInput).kind}`);
  }
}

if (parentPort) {
  try {
    const input = workerData as CompactionPlanningWorkerInput;
    const result = execute(input);
    parentPort.postMessage({ status: 'ok' as const, value: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort.postMessage({ status: 'error' as const, error: message });
  }
}