/**
 * 承诺心跳策略
 *
 * 管理承诺的心跳投递策略，包括心跳触发、投递选择、
 * 失败重试、退避机制等。
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../../logger.js';
import { priorityToNumber } from './config.js';
import type {
  CommitmentRecord,
  CommitmentHeartbeat,
  HeartbeatPolicyConfig,
  HeartbeatRunResult,
  CommitmentScope,
} from './types.js';

// Re-export types used in public API for ergonomic imports
export type { HeartbeatPolicyConfig, HeartbeatRunResult } from './types.js';

export type HeartbeatDeliveryResult = {
  success: boolean;
  messageId?: string;
  errorMessage?: string;
};

export type HeartbeatDeliveryFn = (params: {
  commitment: CommitmentRecord;
  scope: CommitmentScope;
  disableTools: boolean;
}) => Promise<HeartbeatDeliveryResult>;

export type HeartbeatPolicyHooks = {
  deliver?: HeartbeatDeliveryFn;
  loadCommitments?: (params: {
    agentId: string;
    sessionKey: string;
    nowMs: number;
    limit: number;
  }) => Promise<CommitmentRecord[]>;
  markAttempted?: (ids: string[], nowMs: number) => Promise<void>;
  markSent?: (ids: string[], nowMs: number) => Promise<void>;
  markFailed?: (ids: string[], nowMs: number, reason: string) => Promise<void>;
  recordHeartbeat?: (heartbeat: CommitmentHeartbeat) => Promise<void>;
  now?: () => number;
};

export type HeartbeatPolicyStats = {
  totalRuns: number;
  totalDelivered: number;
  totalFailed: number;
  totalChecked: number;
  consecutiveFailures: number;
  lastRunAtMs: number;
};

export class HeartbeatPolicy {
  private readonly config: HeartbeatPolicyConfig;
  private readonly hooks: HeartbeatPolicyHooks;
  private lastRunAtMs: number = 0;
  private consecutiveFailures: number = 0;
  private backoffUntilMs: number = 0;
  private totalRuns: number = 0;
  private totalDelivered: number = 0;
  private totalFailed: number = 0;
  private totalChecked: number = 0;

  constructor(config: HeartbeatPolicyConfig, hooks: HeartbeatPolicyHooks = {}) {
    this.config = { ...config };
    this.hooks = hooks;
  }

  getConfig(): HeartbeatPolicyConfig {
    return { ...this.config };
  }

  getLastRunAt(): number {
    return this.lastRunAtMs;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  shouldRun(nowMs: number = Date.now()): boolean {
    if (!this.config.enabled) {
      return false;
    }

    if (nowMs < this.backoffUntilMs) {
      return false;
    }

    if (this.lastRunAtMs === 0) {
      return true;
    }

    return nowMs - this.lastRunAtMs >= this.config.intervalMs;
  }

  async run(params: {
    agentId: string;
    sessionKey: string;
    channel?: string;
    to?: string;
    nowMs?: number;
  }): Promise<HeartbeatRunResult> {
    const startTime = this.hooks.now?.() ?? params.nowMs ?? Date.now();
    const { agentId, sessionKey } = params;

    if (!this.config.enabled) {
      return {
        status: 'skipped',
        commitmentsChecked: 0,
        commitmentsDelivered: 0,
        commitmentsFailed: 0,
        skippedReason: 'heartbeat_disabled',
        startedAtMs: startTime,
        endedAtMs: startTime,
      };
    }

    if (this.config.target === 'none') {
      return {
        status: 'skipped',
        commitmentsChecked: 0,
        commitmentsDelivered: 0,
        commitmentsFailed: 0,
        skippedReason: 'target_none',
        startedAtMs: startTime,
        endedAtMs: startTime,
      };
    }

    try {
      const dueCommitments = await this.loadDueCommitments(params, startTime);

      this.totalRuns++;
      this.totalChecked += dueCommitments.length;

      if (dueCommitments.length === 0) {
        this.lastRunAtMs = startTime;
        this.consecutiveFailures = 0;
        return {
          status: 'ran',
          commitmentsChecked: 0,
          commitmentsDelivered: 0,
          commitmentsFailed: 0,
          startedAtMs: startTime,
          endedAtMs: this.hooks.now?.() ?? Date.now(),
        };
      }

      const toDeliver = this.selectCommitmentsToDeliver(dueCommitments);

      if (this.hooks.markAttempted) {
        await this.hooks.markAttempted(
          toDeliver.map((c) => c.id),
          startTime,
        );
      }

      let delivered = 0;
      let failed = 0;

      for (const commitment of toDeliver) {
        const result = await this.deliverCommitment(commitment, params, startTime);
        if (result.success) {
          delivered++;
        } else {
          failed++;
        }
      }

      this.totalDelivered += delivered;
      this.totalFailed += failed;
      this.lastRunAtMs = startTime;

      if (failed > 0 && delivered === 0) {
        this.consecutiveFailures++;
        this.updateBackoff(startTime);
      } else if (delivered > 0) {
        this.consecutiveFailures = 0;
        this.backoffUntilMs = 0;
      }

      return {
        status: 'ran',
        commitmentsChecked: dueCommitments.length,
        commitmentsDelivered: delivered,
        commitmentsFailed: failed,
        startedAtMs: startTime,
        endedAtMs: this.hooks.now?.() ?? Date.now(),
      };
    } catch (err) {
      this.consecutiveFailures++;
      this.updateBackoff(startTime);
      logger.error(`[HeartbeatPolicy] Run failed: ${String(err)}`);
      return {
        status: 'error',
        commitmentsChecked: 0,
        commitmentsDelivered: 0,
        commitmentsFailed: 0,
        errorMessage: String(err),
        startedAtMs: startTime,
        endedAtMs: this.hooks.now?.() ?? Date.now(),
      };
    }
  }

  private async loadDueCommitments(
    params: { agentId: string; sessionKey: string },
    nowMs: number,
  ): Promise<CommitmentRecord[]> {
    if (this.hooks.loadCommitments) {
      return this.hooks.loadCommitments({
        agentId: params.agentId,
        sessionKey: params.sessionKey,
        nowMs,
        limit: this.config.maxPerHeartbeat * 3,
      });
    }
    return [];
  }

  private selectCommitmentsToDeliver(
    commitments: CommitmentRecord[],
  ): CommitmentRecord[] {
    const sorted = [...commitments].sort((a, b) => {
      const priorityDiff = priorityToNumber(b.priority) - priorityToNumber(a.priority);
      if (priorityDiff !== 0) return priorityDiff;

      const earliestDiff = a.dueWindow.earliestMs - b.dueWindow.earliestMs;
      if (earliestDiff !== 0) return earliestDiff;

      const confidenceDiff = b.confidence - a.confidence;
      if (confidenceDiff !== 0) return confidenceDiff;

      return a.createdAtMs - b.createdAtMs;
    });

    return sorted.slice(0, this.config.maxPerHeartbeat);
  }

  private async deliverCommitment(
    commitment: CommitmentRecord,
    params: { agentId: string; sessionKey: string; channel?: string; to?: string },
    nowMs: number,
  ): Promise<{ success: boolean }> {
    const scope: CommitmentScope = {
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      channel: params.channel || commitment.channel,
      accountId: commitment.accountId,
      to: params.to || commitment.to,
      threadId: commitment.threadId,
      senderId: commitment.senderId,
    };

    const heartbeat: CommitmentHeartbeat = {
      id: `hb_${nowMs.toString(36)}_${randomUUID().slice(0, 8)}`,
      commitmentId: commitment.id,
      heartbeatAtMs: nowMs,
      status: 'triggered',
      deliveryChannel: scope.channel,
    };

    try {
      if (!this.hooks.deliver) {
        heartbeat.status = 'skipped';
        heartbeat.skipReason = 'no_delivery_hook';
        await this.recordHeartbeat(heartbeat);
        return { success: false };
      }

      const result = await this.hooks.deliver({
        commitment,
        scope,
        disableTools: this.config.disableTools,
      });

      if (result.success) {
        heartbeat.status = 'delivered';
        heartbeat.deliveryMessageId = result.messageId;
        if (this.hooks.markSent) {
          await this.hooks.markSent([commitment.id], nowMs);
        }
      } else {
        heartbeat.status = 'failed';
        heartbeat.errorMessage = result.errorMessage;
        if (this.hooks.markFailed && result.errorMessage) {
          await this.hooks.markFailed([commitment.id], nowMs, result.errorMessage);
        }
      }

      await this.recordHeartbeat(heartbeat);
      return { success: result.success };
    } catch (err) {
      heartbeat.status = 'failed';
      heartbeat.errorMessage = String(err);
      await this.recordHeartbeat(heartbeat);
      logger.error(`[HeartbeatPolicy] Delivery failed for commitment ${commitment.id}: ${String(err)}`);
      return { success: false };
    }
  }

  private async recordHeartbeat(heartbeat: CommitmentHeartbeat): Promise<void> {
    if (this.hooks.recordHeartbeat) {
      try {
        await this.hooks.recordHeartbeat(heartbeat);
      } catch (err) {
        logger.warn(`[HeartbeatPolicy] Failed to record heartbeat: ${String(err)}`);
      }
    }
  }

  private updateBackoff(nowMs: number): void {
    if (this.consecutiveFailures <= 0) {
      this.backoffUntilMs = 0;
      return;
    }

    const backoffMs = this.config.retryIntervalMs * Math.pow(
      this.config.backoffFactor,
      Math.min(this.consecutiveFailures - 1, this.config.maxRetries),
    );

    this.backoffUntilMs = nowMs + backoffMs;
    logger.warn(
      `[HeartbeatPolicy] Backing off for ${backoffMs}ms after ${this.consecutiveFailures} consecutive failures`,
    );
  }

  resetBackoff(): void {
    this.consecutiveFailures = 0;
    this.backoffUntilMs = 0;
  }

  getBackoffUntil(): number {
    return this.backoffUntilMs;
  }

  getStats(): HeartbeatPolicyStats {
    return {
      totalRuns: this.totalRuns,
      totalDelivered: this.totalDelivered,
      totalFailed: this.totalFailed,
      totalChecked: this.totalChecked,
      consecutiveFailures: this.consecutiveFailures,
      lastRunAtMs: this.lastRunAtMs,
    };
  }

  resetStats(): void {
    this.totalRuns = 0;
    this.totalDelivered = 0;
    this.totalFailed = 0;
    this.totalChecked = 0;
    this.consecutiveFailures = 0;
    this.lastRunAtMs = 0;
    this.backoffUntilMs = 0;
  }
}

export function buildHeartbeatPolicyConfig(
  overrides?: Partial<HeartbeatPolicyConfig>,
): HeartbeatPolicyConfig {
  return {
    enabled: overrides?.enabled ?? true,
    intervalMs: overrides?.intervalMs ?? 5 * 60 * 1000,
    maxPerHeartbeat: overrides?.maxPerHeartbeat ?? 3,
    target: overrides?.target ?? 'last',
    disableTools: overrides?.disableTools ?? true,
    maxRetries: overrides?.maxRetries ?? 3,
    retryIntervalMs: overrides?.retryIntervalMs ?? 30 * 1000,
    backoffFactor: overrides?.backoffFactor ?? 2,
  };
}
