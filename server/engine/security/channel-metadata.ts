import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type ChannelMetadata = {
  channelId: string;
  channelType: 'dm' | 'group' | 'thread' | 'bot' | 'system' | 'api';
  name?: string;
  description?: string;
  ownerId?: string;
  memberCount?: number;
  createdAt?: number;
  updatedAt?: number;
  isEncrypted?: boolean;
  isVerified?: boolean;
  permissions?: ChannelPermissions;
  metadata?: Record<string, unknown>;
  securityLevel?: 'low' | 'medium' | 'high' | 'critical';
};

export type ChannelPermissions = {
  canRead: boolean;
  canWrite: boolean;
  canExecute: boolean;
  canManage: boolean;
  canInvite: boolean;
  canDelete: boolean;
};

export type ChannelMetadataStore = {
  channels: Map<string, ChannelMetadata>;
  version: string;
  lastUpdated: number;
};

export type ChannelMetadataAuditResult = {
  safe: boolean;
  findings: SecurityFinding[];
  channelCount: number;
  insecureChannels: string[];
};

const channelStore = new Map<string, ChannelMetadata>();
let storeVersion = '1.0.0';

export function getChannelMetadata(channelId: string): ChannelMetadata | undefined {
  return channelStore.get(channelId);
}

export function getAllChannelMetadata(): ChannelMetadata[] {
  return Array.from(channelStore.values());
}

export function setChannelMetadata(metadata: ChannelMetadata): void {
  channelStore.set(metadata.channelId, metadata);
  storeVersion = `1.0.${Date.now()}`;
  logger.debug(`[Security:ChannelMetadata] Set metadata for channel ${metadata.channelId}`);
}

export function setAllChannelMetadata(channels: ChannelMetadata[]): void {
  channelStore.clear();
  for (const channel of channels) {
    channelStore.set(channel.channelId, channel);
  }
  storeVersion = `1.0.${Date.now()}`;
  logger.debug(`[Security:ChannelMetadata] Set ${channels.length} channels`);
}

export function removeChannelMetadata(channelId: string): boolean {
  const existed = channelStore.has(channelId);
  channelStore.delete(channelId);
  if (existed) {
    storeVersion = `1.0.${Date.now()}`;
    logger.debug(`[Security:ChannelMetadata] Removed metadata for channel ${channelId}`);
  }
  return existed;
}

export function clearChannelMetadata(): void {
  channelStore.clear();
  storeVersion = `1.0.${Date.now()}`;
  logger.debug('[Security:ChannelMetadata] Cleared all channel metadata');
}

export function getChannelMetadataStore(): ChannelMetadataStore {
  return {
    channels: new Map(channelStore),
    version: storeVersion,
    lastUpdated: Date.now(),
  };
}

export function findChannelsByType(type: ChannelMetadata['channelType']): ChannelMetadata[] {
  return Array.from(channelStore.values()).filter(c => c.channelType === type);
}

export function findChannelsBySecurityLevel(level: ChannelMetadata['securityLevel']): ChannelMetadata[] {
  return Array.from(channelStore.values()).filter(c => c.securityLevel === level);
}

export function validateChannelMetadata(metadata: ChannelMetadata): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!metadata.channelId) {
    findings.push({
      id: 'channel-metadata-missing-id',
      title: 'Missing channel ID',
      severity: 'critical',
      category: 'channel',
      description: 'Channel metadata must include a channelId',
      recommendation: 'Provide a valid channelId',
    });
  }

  const validTypes: ChannelMetadata['channelType'][] = ['dm', 'group', 'thread', 'bot', 'system', 'api'];
  if (!validTypes.includes(metadata.channelType)) {
    findings.push({
      id: `channel-metadata-invalid-type-${metadata.channelType}`,
      title: 'Invalid channel type',
      severity: 'high',
      category: 'channel',
      description: `Channel type "${metadata.channelType}" is not valid`,
      recommendation: `Use one of: ${validTypes.join(', ')}`,
      metadata: { channelId: metadata.channelId, type: metadata.channelType },
    });
  }

  if (metadata.permissions) {
    if (metadata.permissions.canExecute && !metadata.permissions.canRead) {
      findings.push({
        id: `channel-metadata-exec-without-read-${metadata.channelId}`,
        title: 'Execute permission without read',
        severity: 'medium',
        category: 'channel',
        description: 'Channel has execute permission but no read permission',
        recommendation: 'Ensure read permission is granted when execute is allowed',
        metadata: { channelId: metadata.channelId },
      });
    }

    if (metadata.permissions.canDelete && !metadata.permissions.canManage) {
      findings.push({
        id: `channel-metadata-delete-without-manage-${metadata.channelId}`,
        title: 'Delete permission without manage',
        severity: 'medium',
        category: 'channel',
        description: 'Channel has delete permission but no manage permission',
        recommendation: 'Ensure manage permission is granted when delete is allowed',
        metadata: { channelId: metadata.channelId },
      });
    }
  }

  if (metadata.securityLevel === 'critical' && !metadata.isEncrypted) {
    findings.push({
      id: `channel-metadata-critical-not-encrypted-${metadata.channelId}`,
      title: 'Critical channel not encrypted',
      severity: 'high',
      category: 'channel',
      description: 'Channel marked as critical security level but not encrypted',
      recommendation: 'Enable encryption for critical channels',
      metadata: { channelId: metadata.channelId, securityLevel: metadata.securityLevel },
    });
  }

  return findings;
}

export function auditChannelMetadata(): ChannelMetadataAuditResult {
  const findings: SecurityFinding[] = [];
  const insecureChannels: string[] = [];

  for (const [channelId, metadata] of channelStore.entries()) {
    const validationFindings = validateChannelMetadata(metadata);
    findings.push(...validationFindings);

    if (validationFindings.some(f => f.severity === 'critical' || f.severity === 'high')) {
      insecureChannels.push(channelId);
    }

    if (metadata.channelType === 'dm' && !metadata.isEncrypted) {
      findings.push({
        id: `channel-metadata-dm-not-encrypted-${channelId}`,
        title: 'DM channel not encrypted',
        severity: 'medium',
        category: 'channel',
        description: `DM channel "${metadata.name || channelId}" is not encrypted`,
        recommendation: 'Enable encryption for DM channels',
        metadata: { channelId, channelType: metadata.channelType, name: metadata.name },
      });
      insecureChannels.push(channelId);
    }

    if (metadata.memberCount !== undefined && metadata.memberCount > 100 && !metadata.isVerified) {
      findings.push({
        id: `channel-metadata-large-unverified-${channelId}`,
        title: 'Large channel not verified',
        severity: 'info',
        category: 'channel',
        description: `Channel "${metadata.name || channelId}" has ${metadata.memberCount} members but is not verified`,
        recommendation: 'Consider verifying large channels',
        metadata: { channelId, memberCount: metadata.memberCount },
      });
    }
  }

  const hasCriticalIssues = findings.some(f => f.severity === 'critical' || f.severity === 'high');

  return {
    safe: !hasCriticalIssues,
    findings,
    channelCount: channelStore.size,
    insecureChannels,
  };
}

export function buildChannelMetadataReport(): Record<string, unknown> {
  const store = getChannelMetadataStore();
  const auditResult = auditChannelMetadata();
  const dmChannels = findChannelsByType('dm');
  const groupChannels = findChannelsByType('group');
  const criticalChannels = findChannelsBySecurityLevel('critical');

  return {
    version: store.version,
    totalChannels: store.channels.size,
    dmChannels: dmChannels.length,
    groupChannels: groupChannels.length,
    criticalChannels: criticalChannels.length,
    audit: {
      safe: auditResult.safe,
      findingsCount: auditResult.findings.length,
      insecureChannels: auditResult.insecureChannels.length,
    },
  };
}

export function getChannelSecurityLevel(channelId: string): ChannelMetadata['securityLevel'] | undefined {
  const metadata = channelStore.get(channelId);
  if (!metadata) return undefined;

  if (!metadata.permissions || !metadata.permissions.canRead) {
    return 'low';
  }

  if (metadata.channelType === 'dm') {
    return metadata.isEncrypted ? 'high' : 'medium';
  }

  if (metadata.channelType === 'bot' || metadata.channelType === 'system') {
    return 'high';
  }

  if (metadata.securityLevel) {
    return metadata.securityLevel;
  }

  return 'medium';
}