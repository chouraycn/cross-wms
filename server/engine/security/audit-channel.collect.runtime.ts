import { logger } from '../../logger.js';
import type { SecurityFinding, SecuritySummary } from './types.js';
import { collectChannelSecurityFindings, auditChannelMessage } from './audit-channel.js';
import { auditChannelMetadata } from './channel-metadata.js';

export type ChannelCollectPhase = 'metadata' | 'permissions' | 'messages' | 'summary' | 'complete';

export type ChannelCollectProgress = {
  phase: ChannelCollectPhase;
  percentage: number;
  currentTask: string;
  channelsProcessed: number;
  totalChannels: number;
  findingsCount: number;
};

export type ChannelCollectResult = {
  findings: SecurityFinding[];
  summary: SecuritySummary;
  progress: ChannelCollectProgress;
  durationMs: number;
  channelsProcessed: number;
  totalChannels: number;
};

export type ChannelCollectConfig = {
  channelIds?: string[];
  skipMetadata?: boolean;
  skipPermissions?: boolean;
  skipMessages?: boolean;
  maxMessagesPerChannel?: number;
  timeoutMs?: number;
};

const DEFAULT_CONFIG: ChannelCollectConfig = {
  channelIds: [],
  skipMetadata: false,
  skipPermissions: false,
  skipMessages: false,
  maxMessagesPerChannel: 100,
  timeoutMs: 30000,
};

let currentConfig = DEFAULT_CONFIG;

export function getChannelCollectConfig(): ChannelCollectConfig {
  return { ...currentConfig };
}

export function setChannelCollectConfig(config: Partial<ChannelCollectConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  logger.debug(`[Security:ChannelCollect] Updated config: ${JSON.stringify(currentConfig)}`);
}

export async function runChannelCollectAudit(config?: Partial<ChannelCollectConfig>): Promise<ChannelCollectResult> {
  const effectiveConfig = { ...currentConfig, ...(config || {}) };
  const startTime = Date.now();
  const findings: SecurityFinding[] = [];

  const allChannels: string[] = effectiveConfig.channelIds ?? [];

  const totalChannels = allChannels.length;
  let channelsProcessed = 0;

  const updateProgress = (phase: ChannelCollectPhase, percentage: number, currentTask: string): ChannelCollectProgress => ({
    phase,
    percentage,
    currentTask,
    channelsProcessed,
    totalChannels,
    findingsCount: findings.length,
  });

  let progress = updateProgress('metadata', 0, 'Starting channel collect audit');

  if (!effectiveConfig.skipMetadata) {
    progress = updateProgress('metadata', 10, 'Auditing channel metadata');
    logger.debug('[Security:ChannelCollect] Running metadata audit');

    try {
      const metadataAudit = auditChannelMetadata();
      findings.push(...metadataAudit.findings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Security:ChannelCollect] Metadata audit failed: ${errorMessage}`);
      findings.push({
        id: 'channel-collect-metadata-failed',
        title: 'Channel metadata audit failed',
        severity: 'medium',
        category: 'channel',
        description: `Metadata audit failed: ${errorMessage}`,
        recommendation: 'Check channel metadata configuration',
        metadata: { error: errorMessage },
      });
    }
  }

  if (!effectiveConfig.skipMessages) {
    progress = updateProgress('messages', 70, 'Auditing channel messages');
    logger.debug('[Security:ChannelCollect] Running message audit');

    channelsProcessed = 0;
    for (const channelId of allChannels) {
      try {
        const messageFindings = auditChannelMessage('', { channelId, senderId: '' });
        findings.push(...messageFindings);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.warn(`[Security:ChannelCollect] Message audit failed for channel ${channelId}: ${errorMessage}`);
      }
      channelsProcessed++;
      const progressPct = Math.round((channelsProcessed / totalChannels) * 20 + 70);
      progress = updateProgress('messages', progressPct, `Processing channel ${channelsProcessed}/${totalChannels}`);
    }
  }

  progress = updateProgress('summary', 95, 'Generating summary');
  logger.debug('[Security:ChannelCollect] Generating findings summary');

  const summary: SecuritySummary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
    total: findings.length,
  };

  const durationMs = Date.now() - startTime;

  logger.info(
    `[Security:ChannelCollect] Completed in ${durationMs}ms: ${summary.total} findings, ${channelsProcessed}/${totalChannels} channels processed`,
  );

  return {
    findings,
    summary,
    progress,
    durationMs,
    channelsProcessed,
    totalChannels,
  };
}

export async function runChannelCollectForSingleChannel(channelId: string): Promise<SecurityFinding[]> {
  logger.debug(`[Security:ChannelCollect] Collecting audit for channel ${channelId}`);
  const result = await runChannelCollectAudit({ channelIds: [channelId] });
  return result.findings;
}

export function getChannelCollectPhaseOrder(): ChannelCollectPhase[] {
  return ['metadata', 'permissions', 'messages', 'summary', 'complete'];
}