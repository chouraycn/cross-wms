import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type SystemTag = {
  key: string;
  value: string;
  category: 'system' | 'security' | 'feature' | 'configuration' | 'environment' | 'custom';
  expiresAt?: number;
  metadata?: Record<string, unknown>;
};

export type SystemTagSet = {
  tags: SystemTag[];
  version: string;
  lastUpdated: number;
};

export type TagSecurityCheckResult = {
  safe: boolean;
  reason?: string;
  risk?: 'critical' | 'high' | 'medium' | 'low';
  findings: SecurityFinding[];
};

const SECURITY_CRITICAL_TAGS: Record<string, { description: string; recommendation: string }> = {
  'security.mode': {
    description: 'Security mode tag must be present',
    recommendation: 'Set security.mode to "strict" or "moderate"',
  },
  'security.audit.enabled': {
    description: 'Security audit must be enabled',
    recommendation: 'Set security.audit.enabled to "true"',
  },
};

const SECURITY_WARNING_TAGS: Record<string, { description: string; recommendation: string }> = {
  'security.tracing.enabled': {
    description: 'Security tracing tag',
    recommendation: 'Consider enabling security tracing for production',
  },
  'security.log.level': {
    description: 'Security log level',
    recommendation: 'Set to "warn" or "error" for production',
  },
};

let systemTags: SystemTag[] = [];
let tagStoreVersion = '1.0.0';

export function getSystemTags(): SystemTag[] {
  return [...systemTags];
}

export function getSystemTag(key: string): SystemTag | undefined {
  return systemTags.find(tag => tag.key === key);
}

export function setSystemTag(tag: SystemTag): void {
  const index = systemTags.findIndex(t => t.key === tag.key);
  if (index >= 0) {
    systemTags[index] = tag;
  } else {
    systemTags.push(tag);
  }
  tagStoreVersion = `1.0.${Date.now()}`;
  logger.debug(`[Security:SystemTags] Set tag ${tag.key}=${tag.value}`);
}

export function setSystemTags(tags: SystemTag[]): void {
  systemTags = [...tags];
  tagStoreVersion = `1.0.${Date.now()}`;
  logger.debug(`[Security:SystemTags] Set ${tags.length} tags`);
}

export function removeSystemTag(key: string): boolean {
  const initialLength = systemTags.length;
  systemTags = systemTags.filter(tag => tag.key !== key);
  if (systemTags.length !== initialLength) {
    tagStoreVersion = `1.0.${Date.now()}`;
    logger.debug(`[Security:SystemTags] Removed tag ${key}`);
    return true;
  }
  return false;
}

export function clearSystemTags(): void {
  systemTags = [];
  tagStoreVersion = `1.0.${Date.now()}`;
  logger.debug('[Security:SystemTags] Cleared all tags');
}

export function getSystemTagSet(): SystemTagSet {
  return {
    tags: getSystemTags(),
    version: tagStoreVersion,
    lastUpdated: Date.now(),
  };
}

export function findTagsByCategory(category: SystemTag['category']): SystemTag[] {
  return systemTags.filter(tag => tag.category === category);
}

export function findTagsByKeyPrefix(prefix: string): SystemTag[] {
  return systemTags.filter(tag => tag.key.startsWith(prefix));
}

export function validateSystemTag(tag: SystemTag): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!tag.key || tag.key.length > 128) {
    findings.push({
      id: `tag-invalid-key-${tag.key}`,
      title: 'Invalid system tag key',
      severity: 'high',
      category: 'config',
      description: `Tag key "${tag.key}" is invalid or too long (max 128 chars)`,
      recommendation: 'Use a valid tag key with max 128 characters',
      metadata: { key: tag.key },
    });
  }

  if (!tag.value || tag.value.length > 512) {
    findings.push({
      id: `tag-invalid-value-${tag.key}`,
      title: 'Invalid system tag value',
      severity: 'medium',
      category: 'config',
      description: `Tag value for "${tag.key}" is invalid or too long (max 512 chars)`,
      recommendation: 'Use a valid tag value with max 512 characters',
      metadata: { key: tag.key },
    });
  }

  const validCategories: SystemTag['category'][] = ['system', 'security', 'feature', 'configuration', 'environment', 'custom'];
  if (!validCategories.includes(tag.category)) {
    findings.push({
      id: `tag-invalid-category-${tag.key}`,
      title: 'Invalid system tag category',
      severity: 'low',
      category: 'config',
      description: `Tag category "${tag.category}" is not valid`,
      recommendation: `Use one of: ${validCategories.join(', ')}`,
      metadata: { key: tag.key, category: tag.category },
    });
  }

  return findings;
}

export function auditSystemTags(): TagSecurityCheckResult {
  const findings: SecurityFinding[] = [];

  for (const [key, config] of Object.entries(SECURITY_CRITICAL_TAGS)) {
    const tag = getSystemTag(key);
    if (!tag || !tag.value) {
      findings.push({
        id: `tag-missing-critical-${key}`,
        title: `Missing critical security tag: ${key}`,
        severity: 'high',
        category: 'config',
        description: config.description,
        recommendation: config.recommendation,
        metadata: { tagKey: key },
      });
    } else if (key === 'security.mode' && tag.value !== 'strict' && tag.value !== 'moderate') {
      findings.push({
        id: `tag-invalid-value-${key}`,
        title: `Invalid security mode: ${tag.value}`,
        severity: 'medium',
        category: 'config',
        description: 'Security mode should be "strict" or "moderate"',
        recommendation: 'Set security.mode to "strict" for production',
        metadata: { tagKey: key, value: tag.value },
      });
    }
  }

  for (const [key, config] of Object.entries(SECURITY_WARNING_TAGS)) {
    const tag = getSystemTag(key);
    if (!tag) {
      findings.push({
        id: `tag-missing-warning-${key}`,
        title: `Missing security tag: ${key}`,
        severity: 'info',
        category: 'config',
        description: config.description,
        recommendation: config.recommendation,
        metadata: { tagKey: key },
      });
    }
  }

  const expiredTags = systemTags.filter(tag => tag.expiresAt && tag.expiresAt < Date.now());
  for (const tag of expiredTags) {
    findings.push({
      id: `tag-expired-${tag.key}`,
      title: `Expired system tag: ${tag.key}`,
      severity: 'low',
      category: 'config',
      description: `Tag "${tag.key}" has expired`,
      recommendation: 'Remove expired tags or update their expiration',
      metadata: { tagKey: tag.key, expiresAt: tag.expiresAt },
    });
  }

  const hasCriticalIssues = findings.some(f => f.severity === 'critical' || f.severity === 'high');

  return {
    safe: !hasCriticalIssues,
    reason: hasCriticalIssues ? 'Critical security tags missing or invalid' : undefined,
    risk: hasCriticalIssues ? 'high' : undefined,
    findings,
  };
}

export function buildSystemTagReport(): Record<string, unknown> {
  const tagSet = getSystemTagSet();
  const securityTags = findTagsByCategory('security');
  const auditResult = auditSystemTags();

  return {
    version: tagSet.version,
    totalTags: tagSet.tags.length,
    securityTagsCount: securityTags.length,
    securityTags: securityTags.map(t => ({ key: t.key, value: t.value })),
    audit: {
      safe: auditResult.safe,
      findingsCount: auditResult.findings.length,
      criticalFindings: auditResult.findings.filter(f => f.severity === 'critical').length,
      highFindings: auditResult.findings.filter(f => f.severity === 'high').length,
    },
  };
}