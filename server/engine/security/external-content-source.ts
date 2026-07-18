import { z } from 'zod';
import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type ExternalContentSourceType =
  | 'email'
  | 'webhook'
  | 'api'
  | 'browser'
  | 'channel_metadata'
  | 'web_search'
  | 'web_fetch'
  | 'file_upload'
  | 'clipboard'
  | 'third_party_api'
  | 'unknown';

export type ExternalContentSource = {
  id: string;
  type: ExternalContentSourceType;
  name: string;
  description?: string;
  url?: string;
  allowed: boolean;
  requiresValidation: boolean;
  validationPatterns?: string[];
  allowedHosts?: string[];
  maxContentLength?: number;
  contentTypeWhitelist?: string[];
  createdAt: number;
  updatedAt: number;
};

export const ExternalContentSourceSchema = z.object({
  id: z.string(),
  type: z.enum([
    'email',
    'webhook',
    'api',
    'browser',
    'channel_metadata',
    'web_search',
    'web_fetch',
    'file_upload',
    'clipboard',
    'third_party_api',
    'unknown',
  ]),
  name: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  allowed: z.boolean().default(true),
  requiresValidation: z.boolean().default(false),
  validationPatterns: z.array(z.string()).optional(),
  allowedHosts: z.array(z.string()).optional(),
  maxContentLength: z.number().optional(),
  contentTypeWhitelist: z.array(z.string()).optional(),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
});

const DANGEROUS_SOURCE_TYPES: ExternalContentSourceType[] = ['third_party_api', 'file_upload', 'clipboard'];

const HIGH_RISK_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];

export function validateExternalContentSource(source: ExternalContentSource): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!source.id || source.id.length === 0) {
    findings.push({
      id: 'ext-source-missing-id',
      title: 'Missing external content source ID',
      severity: 'medium',
      category: 'config',
      description: 'External content source is missing an ID.',
      recommendation: 'Provide a unique ID for the external content source.',
      metadata: { sourceName: source.name, sourceType: source.type },
    });
  }

  if (!source.name || source.name.length === 0) {
    findings.push({
      id: 'ext-source-missing-name',
      title: 'Missing external content source name',
      severity: 'medium',
      category: 'config',
      description: 'External content source is missing a name.',
      recommendation: 'Provide a descriptive name for the external content source.',
      metadata: { sourceId: source.id, sourceType: source.type },
    });
  }

  if (DANGEROUS_SOURCE_TYPES.includes(source.type) && source.allowed) {
    findings.push({
      id: `ext-source-dangerous-type-${source.type}`,
      title: `Dangerous content source type allowed: ${source.type}`,
      severity: 'high',
      category: 'external',
      description: `Content source type "${source.type}" is considered dangerous and is currently allowed.`,
      recommendation: 'Review if this source type needs to be allowed. Consider adding validation patterns.',
      metadata: { sourceId: source.id, sourceName: source.name },
    });
  }

  if (source.url) {
    try {
      const url = new URL(source.url);
      if (HIGH_RISK_HOSTS.includes(url.hostname)) {
        findings.push({
          id: `ext-source-high-risk-host-${source.id}`,
          title: `High-risk host in content source URL`,
          severity: 'high',
          category: 'network',
          description: `Content source URL uses high-risk host "${url.hostname}".`,
          recommendation: 'Avoid using localhost or private IPs for external content sources.',
          metadata: { sourceId: source.id, url: source.url },
        });
      }

      if (url.protocol === 'http:') {
        findings.push({
          id: `ext-source-insecure-protocol-${source.id}`,
          title: `Insecure protocol in content source URL`,
          severity: 'medium',
          category: 'network',
          description: `Content source URL uses HTTP instead of HTTPS.`,
          recommendation: 'Use HTTPS for all external content source URLs.',
          metadata: { sourceId: source.id, url: source.url },
        });
      }
    } catch {
      findings.push({
        id: `ext-source-invalid-url-${source.id}`,
        title: `Invalid content source URL`,
        severity: 'medium',
        category: 'network',
        description: `Content source URL "${source.url}" is invalid.`,
        recommendation: 'Provide a valid URL for the content source.',
        metadata: { sourceId: source.id },
      });
    }
  }

  if (source.requiresValidation && (!source.validationPatterns || source.validationPatterns.length === 0)) {
    findings.push({
      id: `ext-source-missing-validation-${source.id}`,
      title: `Validation required but no patterns configured`,
      severity: 'high',
      category: 'config',
      description: `Content source "${source.name}" requires validation but has no validation patterns.`,
      recommendation: 'Add validation patterns to validate incoming content.',
      metadata: { sourceId: source.id, sourceName: source.name },
    });
  }

  logger.debug(`[Security:ExternalContentSource] Validated source ${source.id}, found ${findings.length} findings`);

  return findings;
}

export function isExternalContentSourceAllowed(
  source: ExternalContentSource,
  content?: string,
): { allowed: boolean; reason: string; findings?: SecurityFinding[] } {
  const findings: SecurityFinding[] = [];

  if (!source.allowed) {
    return {
      allowed: false,
      reason: 'Content source is not allowed',
      findings,
    };
  }

  if (source.requiresValidation && content) {
    if (!source.validationPatterns || source.validationPatterns.length === 0) {
      findings.push({
        id: `ext-source-no-patterns-${source.id}`,
        title: 'No validation patterns for required validation',
        severity: 'high',
        category: 'config',
        description: 'Source requires validation but no patterns are configured.',
        recommendation: 'Add validation patterns.',
        metadata: { sourceId: source.id },
      });
      return {
        allowed: false,
        reason: 'Validation required but no patterns configured',
        findings,
      };
    }

    let matched = false;
    for (const pattern of source.validationPatterns) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(content)) {
          matched = true;
          break;
        }
      } catch {
        findings.push({
          id: `ext-source-invalid-pattern-${source.id}`,
          title: 'Invalid validation pattern',
          severity: 'medium',
          category: 'config',
          description: `Validation pattern "${pattern}" is invalid.`,
          recommendation: 'Fix the validation pattern.',
          metadata: { sourceId: source.id, pattern },
        });
      }
    }

    if (!matched) {
      return {
        allowed: false,
        reason: 'Content did not match any validation patterns',
        findings,
      };
    }
  }

  if (source.maxContentLength && content && content.length > source.maxContentLength) {
    findings.push({
      id: `ext-source-too-long-${source.id}`,
      title: 'Content exceeds maximum length',
      severity: 'medium',
      category: 'config',
      description: `Content length (${content.length}) exceeds maximum allowed (${source.maxContentLength}).`,
      recommendation: 'Limit content size or increase maxContentLength.',
      metadata: { sourceId: source.id, contentLength: content.length, maxLength: source.maxContentLength },
    });
    return {
      allowed: false,
      reason: 'Content exceeds maximum length',
      findings,
    };
  }

  return {
    allowed: true,
    reason: 'Content source is allowed',
    findings,
  };
}

export function normalizeExternalContentSource(source: Partial<ExternalContentSource>): ExternalContentSource {
  return {
    id: source.id || `source-${Date.now()}`,
    type: source.type || 'unknown',
    name: source.name || source.id || 'Unknown Source',
    description: source.description,
    url: source.url,
    allowed: source.allowed ?? true,
    requiresValidation: source.requiresValidation ?? false,
    validationPatterns: source.validationPatterns,
    allowedHosts: source.allowedHosts,
    maxContentLength: source.maxContentLength,
    contentTypeWhitelist: source.contentTypeWhitelist,
    createdAt: source.createdAt ?? Date.now(),
    updatedAt: source.updatedAt ?? Date.now(),
  };
}