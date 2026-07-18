/**
 * 承诺完整链路集成
 *
 * 整合承诺提取、存储、运行时、心跳策略等各模块，
 * 提供端到端的承诺管理能力。
 */

import { logger } from '../../logger.js';
import {
  resolveCommitmentsConfig,
  type CommitmentsConfigInput,
  type ResolvedCommitmentsConfig,
} from './config.js';
import {
  createCommitmentRuntime,
  type CommitmentRuntime,
  type CommitmentRuntimeHooks,
  type CommitmentExtractionEnqueueInput,
} from './runtime.js';
import {
  HeartbeatPolicy,
  buildHeartbeatPolicyConfig,
  type HeartbeatPolicyConfig,
  type HeartbeatRunResult,
  type HeartbeatPolicyHooks,
} from './heartbeat-policy.js';
import {
  CommitmentModelSelector,
  type CommitmentModelConfig,
  type ModelSelectionResult,
  type ModelSelectionContext,
} from './model-selection.runtime.js';
import {
  CommitmentStoreWriter,
  type StoreWriterOptions,
} from './store-writer.js';
import type {
  CommitmentRecord,
  CommitmentScope,
  CommitmentStatus,
  CommitmentFilter,
  CommitmentStats,
  CommitmentHeartbeat,
  CommitmentCandidate,
  PaginatedResult,
} from './types.js';
import {
  listCommitments,
  getCommitmentStats,
  type ListCommitmentsParams,
} from './store.js';

export type FullChainOptions = {
  config?: CommitmentsConfigInput;
  storePath?: string;
  runtimeHooks?: CommitmentRuntimeHooks;
  heartbeatConfig?: Partial<HeartbeatPolicyConfig>;
  heartbeatHooks?: HeartbeatPolicyHooks;
  modelConfig?: Partial<CommitmentModelConfig>;
  storeWriterOptions?: StoreWriterOptions;
};

export type FullChainStats = {
  runtime: {
    queueLength: number;
    draining: boolean;
  };
  store: {
    total: number;
    pending: number;
    sent: number;
    completed: number;
    dismissed: number;
    expired: number;
    failed: number;
    byKind: Record<string, number>;
    byPriority: Record<string, number>;
  };
  modelSelection: {
    totalSelections: number;
    cacheSize: number;
  };
  heartbeat: {
    lastRunAt?: number;
    totalDelivered: number;
    totalFailed: number;
  };
};

export class CommitmentsFullChain {
  private readonly config: ResolvedCommitmentsConfig;
  private readonly runtime: CommitmentRuntime;
  private readonly heartbeatPolicy: HeartbeatPolicy;
  private readonly modelSelector: CommitmentModelSelector;
  private storeWriter: CommitmentStoreWriter | null = null;
  private readonly storePath?: string;
  private heartbeatStats = {
    lastRunAt: undefined as number | undefined,
    totalDelivered: 0,
    totalFailed: 0,
  };
  private isInitialized = false;
  private isShutdown = false;

  constructor(options: FullChainOptions = {}) {
    this.config = resolveCommitmentsConfig(options.config);
    this.storePath = options.storePath;

    this.runtime = createCommitmentRuntime({
      config: options.config,
      hooks: options.runtimeHooks,
      storePath: options.storePath,
    });

    this.modelSelector = new CommitmentModelSelector(options.modelConfig);

    this.heartbeatPolicy = new HeartbeatPolicy(
      buildHeartbeatPolicyConfig({
        maxPerHeartbeat: this.config.maxPerDay,
        ...options.heartbeatConfig,
      }),
      options.heartbeatHooks,
    );

    if (options.storeWriterOptions) {
      this.storeWriter = new CommitmentStoreWriter({
        ...options.storeWriterOptions,
        storePath: options.storePath,
      });
    }

    this.isInitialized = true;
    logger.info(`[Commitments FullChain] Initialized (enabled: ${this.config.enabled})`);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
    logger.info(`[Commitments FullChain] Initialized`);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getConfig(): ResolvedCommitmentsConfig {
    return this.config;
  }

  getRuntime(): CommitmentRuntime {
    return this.runtime;
  }

  getHeartbeatPolicy(): HeartbeatPolicy {
    return this.heartbeatPolicy;
  }

  getModelSelector(): CommitmentModelSelector {
    return this.modelSelector;
  }

  getStoreWriter(): CommitmentStoreWriter | undefined {
    return this.storeWriter ?? undefined;
  }

  enqueueExtraction(input: CommitmentExtractionEnqueueInput): boolean {
    if (this.isShutdown) return false;
    return this.runtime.queueExtraction(input);
  }

  async processExtractionBatch(): Promise<number> {
    if (this.isShutdown) return 0;
    return this.runtime.processExtractionBatch();
  }

  selectModel(context: ModelSelectionContext = {}): ModelSelectionResult {
    return this.modelSelector.selectModel(context);
  }

  async runHeartbeat(params: {
    agentId: string;
    sessionKey: string;
    nowMs?: number;
  }): Promise<HeartbeatRunResult> {
    if (this.isShutdown) {
      const now = Date.now();
      return {
        status: 'skipped',
        commitmentsChecked: 0,
        commitmentsDelivered: 0,
        commitmentsFailed: 0,
        skippedReason: 'shutdown',
        startedAtMs: now,
        endedAtMs: now,
      };
    }

    const result = await this.heartbeatPolicy.run({
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      nowMs: params.nowMs,
    });

    this.heartbeatStats.lastRunAt = Date.now();
    this.heartbeatStats.totalDelivered += result.commitmentsDelivered;
    this.heartbeatStats.totalFailed += result.commitmentsFailed;

    return result;
  }

  async getCommitment(id: string): Promise<CommitmentRecord | null> {
    return this.runtime.getCommitment(id, this.storePath);
  }

  async listCommitments(params: Omit<ListCommitmentsParams, 'storePath'> = {}): Promise<PaginatedResult<CommitmentRecord>> {
    return listCommitments({
      ...params,
      storePath: this.storePath,
    });
  }

  async updateCommitmentStatus(
    id: string,
    status: CommitmentStatus,
    options?: { failureReason?: string; nowMs?: number },
  ): Promise<boolean> {
    if (this.isShutdown) return false;
    return this.runtime.updateCommitmentStatus(id, status, {
      storePath: this.storePath,
      ...options,
    });
  }

  async markSent(id: string): Promise<boolean> {
    return this.runtime.markSent(id, { storePath: this.storePath });
  }

  async markDismissed(id: string): Promise<boolean> {
    return this.runtime.markDismissed(id, { storePath: this.storePath });
  }

  async markExpired(id: string): Promise<boolean> {
    return this.runtime.markExpired(id, { storePath: this.storePath });
  }

  async markFailed(id: string, reason: string): Promise<boolean> {
    return this.runtime.markFailed(id, reason, { storePath: this.storePath });
  }

  async verifyAndComplete(params: {
    id: string;
    context?: Record<string, unknown>;
    nowMs?: number;
  }): Promise<{ completed: boolean; reason?: string }> {
    if (this.isShutdown) return { completed: false, reason: 'shutdown' };
    return this.runtime.verifyAndComplete({
      ...params,
      storePath: this.storePath,
    });
  }

  async incrementAttempts(id: string): Promise<boolean> {
    return this.runtime.incrementAttempts(id, { storePath: this.storePath });
  }

  async addHeartbeat(heartbeat: Omit<CommitmentHeartbeat, 'id'>): Promise<CommitmentHeartbeat> {
    return this.runtime.addHeartbeat(heartbeat, this.storePath);
  }

  getStats(): FullChainStats {
    const modelStats = this.modelSelector.getStats();

    return {
      runtime: {
        queueLength: this.runtime.queueLength,
        draining: this.runtime.draining,
      },
      store: {
        total: 0,
        pending: 0,
        sent: 0,
        completed: 0,
        dismissed: 0,
        expired: 0,
        failed: 0,
        byKind: {},
        byPriority: {},
      },
      modelSelection: {
        totalSelections: modelStats.totalSelections,
        cacheSize: this.modelSelector.getCacheSize(),
      },
      heartbeat: { ...this.heartbeatStats },
    };
  }

  async getStoreStats(): Promise<CommitmentStats> {
    return getCommitmentStats({ storePath: this.storePath });
  }

  async flushStore(): Promise<void> {
    if (this.storeWriter) {
      await this.storeWriter.flush();
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShutdown) return;
    this.isShutdown = true;

    this.runtime.resetForTests();

    if (this.storeWriter) {
      await this.storeWriter.shutdown();
      this.storeWriter = null;
    }

    logger.info(`[Commitments FullChain] Shutdown complete`);
  }

  isShutdownStatus(): boolean {
    return this.isShutdown;
  }

  resetForTests(): void {
    this.runtime.resetForTests();
    this.modelSelector.reset();
    this.heartbeatStats = {
      lastRunAt: undefined,
      totalDelivered: 0,
      totalFailed: 0,
    };
    this.isShutdown = false;
    this.isInitialized = true;
  }
}

export type CommitmentsFullChainOptions = FullChainOptions;

let defaultInstance: CommitmentsFullChain | null = null;

export function getCommitmentsFullChain(options?: FullChainOptions): CommitmentsFullChain {
  if (!defaultInstance) {
    defaultInstance = new CommitmentsFullChain(options);
  }
  return defaultInstance;
}

export function resetCommitmentsFullChainForTests(): void {
  if (defaultInstance) {
    defaultInstance.resetForTests();
  }
  defaultInstance = null;
}
