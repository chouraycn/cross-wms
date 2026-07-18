import { z } from 'zod';
import { logger } from '../../logger.js';
import type { SecurityFinding, SecurityLevel } from './types.js';

export type ChannelType = 'discord' | 'slack' | 'feishu' | 'email' | 'webhook' | 'api' | 'unknown';

export type DmPolicy = 'open' | 'allowlist' | 'disabled' | 'paired';

export type ChannelSecurityConfig = {
  channelId: string;
  channelType: ChannelType;
  dmPolicy: DmPolicy;
  allowFrom: string[];
  enabled: boolean;
  hasAuth: boolean;
  messageVisibility: 'all' | 'allowlist' | 'none';
};

export const ChannelSecuritySchema = z.object({
  channelId: z.string(),
  channelType: z.enum(['discord', 'slack', 'feishu', 'email', 'webhook', 'api', 'unknown']),
  dmPolicy: z.enum(['open', 'allowlist', 'disabled', 'paired']),
  allowFrom: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  hasAuth: z.boolean().default(false),
  messageVisibility: z.enum(['all', 'allowlist', 'none']).default('allowlist'),
});

export type ChannelSecurityInfo = z.infer<typeof ChannelSecuritySchema>;

function classifyChannelWarningSeverity(message: string): SecurityLevel {
  const s = message.toLowerCase();
  if (s.includes('dms: open') || s.includes('dmpolicy="open"')) {
    return 'critical';
  }
  if (s.includes('allows any') || s.includes('anyone can') || s.includes('public')) {
    return 'critical';
  }
  if (s.includes('locked') || s.includes('disabled')) {
    return 'info';
  }
  return 'high';
}

function dedupeFindings(findings: SecurityFinding[]): SecurityFinding[] {
  const seen = new Set<string>();
  const out: SecurityFinding[] = [];
  for (const finding of findings) {
    const key = [finding.id, finding.severity, finding.title, finding.description].join('\n');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(finding);
  }
  return out;
}

export async function collectChannelSecurityFindings(
  channels: ChannelSecurityConfig[],
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  for (const channel of channels) {
    if (!channel.enabled) {
      findings.push({
        id: `channel-disabled-${channel.channelId}`,
        title: `Channel disabled: ${channel.channelId}`,
        severity: 'info',
        category: 'channel',
        description: `Channel ${channel.channelId} is currently disabled.`,
        recommendation: 'No action needed unless channel is expected to be active.',
        metadata: { channelId: channel.channelId, channelType: channel.channelType },
      });
      continue;
    }

    if (!channel.hasAuth) {
      findings.push({
        id: `channel-no-auth-${channel.channelId}`,
        title: `Channel has no authentication: ${channel.channelId}`,
        severity: 'high',
        category: 'channel',
        description: `Channel ${channel.channelId} is enabled but has no authentication configured.`,
        recommendation: 'Configure proper authentication credentials for the channel.',
        metadata: { channelId: channel.channelId, channelType: channel.channelType },
      });
    }

    if (channel.dmPolicy === 'open') {
      findings.push({
        id: `channel-dm-open-${channel.channelId}`,
        title: `Open DM policy on channel: ${channel.channelId}`,
        severity: 'critical',
        category: 'channel',
        description: `Channel ${channel.channelId} has DM policy set to "open", allowing anyone to DM the bot.`,
        recommendation: 'Use allowlist or paired DM policy for better security.',
        metadata: { channelId: channel.channelId, channelType: channel.channelType },
      });

      if (channel.allowFrom.length === 0 || !channel.allowFrom.includes('*')) {
        findings.push({
          id: `channel-dm-open-invalid-${channel.channelId}`,
          title: `Inconsistent DM config: ${channel.channelId}`,
          severity: 'medium',
          category: 'channel',
          description: '"open" DM policy should typically have "*" in allowFrom list.',
          recommendation: 'Add "*" to allowFrom or change DM policy to "allowlist".',
          metadata: { channelId: channel.channelId, channelType: channel.channelType },
        });
      }
    }

    if (channel.dmPolicy === 'disabled') {
      findings.push({
        id: `channel-dm-disabled-${channel.channelId}`,
        title: `DMs disabled: ${channel.channelId}`,
        severity: 'info',
        category: 'channel',
        description: `Direct messages are disabled for channel ${channel.channelId}.`,
        recommendation: 'No action needed - this is a secure configuration.',
        metadata: { channelId: channel.channelId, channelType: channel.channelType },
      });
    }

    if (channel.messageVisibility === 'all') {
      findings.push({
        id: `channel-visibility-all-${channel.channelId}`,
        title: `All messages visible: ${channel.channelId}`,
        severity: 'medium',
        category: 'channel',
        description: `Channel ${channel.channelId} has message visibility set to "all", allowing all users to see all messages.`,
        recommendation: 'Consider using allowlist message visibility for better privacy.',
        metadata: { channelId: channel.channelId, channelType: channel.channelType },
      });
    }

    if (channel.dmPolicy === 'allowlist' && channel.allowFrom.length === 0) {
      findings.push({
        id: `channel-empty-allowlist-${channel.channelId}`,
        title: `Empty allowlist: ${channel.channelId}`,
        severity: 'low',
        category: 'channel',
        description: `Channel ${channel.channelId} uses allowlist DM policy but allowFrom is empty - no DMs will be accepted.`,
        recommendation: 'Add allowed users to allowFrom list or change DM policy.',
        metadata: { channelId: channel.channelId, channelType: channel.channelType },
      });
    }
  }

  const deduped = dedupeFindings(findings);
  logger.debug(`[Security:AuditChannel] Audited ${channels.length} channels, found ${deduped.length} findings`);

  return deduped;
}

export function auditChannelMessage(
  message: string,
  options: {
    channelId: string;
    senderId?: string;
    checkInjection?: boolean;
  } = { channelId: 'unknown' },
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const { channelId, senderId, checkInjection = true } = options;

  if (checkInjection) {
    const injectionPatterns = [
      { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i, name: 'ignore instructions' },
      { pattern: /disregard\s+(all\s+)?(previous|prior|above)/i, name: 'disregard instructions' },
      { pattern: /you\s+are\s+now\s+(a|an)\s+/i, name: 'personality override' },
      { pattern: /new\s+instructions?:/i, name: 'new instructions' },
      { pattern: /system\s*:?\s*(prompt|override|command)/i, name: 'system override' },
      { pattern: /<\/?system>/i, name: 'system tag injection' },
    ];

    for (const injection of injectionPatterns) {
      if (injection.pattern.test(message)) {
        findings.push({
          id: `channel-injection-${channelId}-${injection.name}`,
          title: `Potential prompt injection in channel: ${channelId}`,
          severity: 'medium',
          category: 'channel',
          description: `Message contains potential prompt injection pattern: ${injection.name}`,
          recommendation: 'Treat message content as untrusted. Use external content wrapping for incoming messages.',
          metadata: { channelId, senderId, pattern: injection.name },
        });
        break;
      }
    }
  }

  return findings;
}

export function validateChannelPermissions(
  channel: ChannelSecurityConfig,
  senderId: string,
  action: 'read' | 'write' | 'dm' | 'admin',
): { allowed: boolean; reason?: string } {
  if (!channel.enabled) {
    return { allowed: false, reason: 'Channel is disabled' };
  }

  if (action === 'dm') {
    switch (channel.dmPolicy) {
      case 'open':
        return { allowed: true };
      case 'allowlist':
        if (channel.allowFrom.includes(senderId) || channel.allowFrom.includes('*')) {
          return { allowed: true };
        }
        return { allowed: false, reason: 'Sender not in allowlist' };
      case 'disabled':
        return { allowed: false, reason: 'DMs are disabled' };
      case 'paired':
        return { allowed: channel.allowFrom.includes(senderId) };
      default:
        return { allowed: false, reason: 'Unknown DM policy' };
    }
  }

  if (action === 'admin') {
    return { allowed: channel.allowFrom.includes(senderId) };
  }

  return { allowed: true };
}
