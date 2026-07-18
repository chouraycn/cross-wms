import { z } from 'zod';
import { logger } from '../../logger.js';
import type { InstallPolicyDecision, InstallPolicyResult, SecurityFinding } from './types.js';

export type InstallTargetType = 'skill' | 'plugin';

export type InstallRequestKind =
  | 'skill-install'
  | 'plugin-dir'
  | 'plugin-archive'
  | 'plugin-file'
  | 'plugin-npm'
  | 'plugin-git';

export type InstallSourceKind =
  | 'archive'
  | 'bundled'
  | 'clawhub'
  | 'file'
  | 'git'
  | 'local-path'
  | 'managed'
  | 'npm'
  | 'upload'
  | 'workspace';

export type InstallAuthority = 'openclaw' | 'official' | 'third-party' | 'unknown' | 'user';

export type InstallPolicySource = {
  kind: InstallSourceKind;
  authority: InstallAuthority;
  mutable: boolean;
  network: boolean;
};

export type InstallPolicyRequest = {
  targetType: InstallTargetType;
  targetName: string;
  sourcePath: string;
  sourcePathKind: 'file' | 'directory';
  source?: InstallPolicySource;
  request: {
    kind: InstallRequestKind;
    mode: 'install' | 'update';
    requestedSpecifier?: string;
  };
  plugin?: {
    pluginId: string;
    version?: string;
  };
};

export const InstallPolicyRequestSchema = z.object({
  targetType: z.enum(['skill', 'plugin']),
  targetName: z.string(),
  sourcePath: z.string(),
  sourcePathKind: z.enum(['file', 'directory']),
  source: z
    .object({
      kind: z.enum([
        'archive',
        'bundled',
        'clawhub',
        'file',
        'git',
        'local-path',
        'managed',
        'npm',
        'upload',
        'workspace',
      ]),
      authority: z.enum(['openclaw', 'official', 'third-party', 'unknown', 'user']),
      mutable: z.boolean(),
      network: z.boolean(),
    })
    .optional(),
  request: z.object({
    kind: z.enum([
      'skill-install',
      'plugin-dir',
      'plugin-archive',
      'plugin-file',
      'plugin-npm',
      'plugin-git',
    ]),
    mode: z.enum(['install', 'update']),
    requestedSpecifier: z.string().optional(),
  }),
  plugin: z
    .object({
      pluginId: z.string(),
      version: z.string().optional(),
    })
    .optional(),
});

const HIGH_RISK_AUTHORITIES: InstallAuthority[] = ['third-party', 'unknown'];

const HIGH_RISK_SOURCES: InstallSourceKind[] = ['git', 'upload', 'file', 'archive'];

const NETWORK_SOURCES: InstallSourceKind[] = ['npm', 'git', 'clawhub'];

function evaluateSourceRisk(source: InstallPolicySource | undefined): {
  risk: 'low' | 'medium' | 'high';
  reasons: string[];
} {
  if (!source) {
    return { risk: 'high', reasons: ['No source information provided'] };
  }

  const reasons: string[] = [];
  let risk: 'low' | 'medium' | 'high' = 'low';

  if (HIGH_RISK_AUTHORITIES.includes(source.authority)) {
    reasons.push(`Untrusted authority: ${source.authority}`);
    risk = 'high';
  }

  if (HIGH_RISK_SOURCES.includes(source.kind)) {
    reasons.push(`High-risk source: ${source.kind}`);
    if (risk === 'low') risk = 'medium';
  }

  if (source.mutable) {
    reasons.push('Mutable source - content may change');
    if (risk === 'low') risk = 'medium';
  }

  if (source.network) {
    reasons.push('Network-accessible source');
  }

  return { risk, reasons };
}

export function evaluateInstallPolicy(
  request: InstallPolicyRequest,
  options: {
    allowUntrusted?: boolean;
    allowNetworkSources?: boolean;
    requireVerifiedSource?: boolean;
  } = {},
): InstallPolicyResult {
  const { allowUntrusted = false, allowNetworkSources = true, requireVerifiedSource = false } = options;

  const reasons: string[] = [];
  const findings: SecurityFinding[] = [];

  const sourceRisk = evaluateSourceRisk(request.source);

  let decision: InstallPolicyDecision = 'allow';

  if (sourceRisk.risk === 'high') {
    reasons.push(...sourceRisk.reasons);

    if (requireVerifiedSource) {
      decision = 'deny';
      reasons.push('Install blocked: requires verified source');
    } else if (!allowUntrusted) {
      decision = 'review';
      reasons.push('Manual review required for untrusted source');
    }
  }

  if (request.source?.network && !allowNetworkSources) {
    decision = 'deny';
    reasons.push('Network sources are not allowed');
  }

  if (request.targetType === 'plugin' && !request.plugin?.pluginId) {
    findings.push({
      id: 'install-missing-plugin-id',
      title: 'Missing plugin ID',
      severity: 'medium',
      category: 'plugin',
      description: 'Install request for plugin is missing plugin ID.',
      recommendation: 'Ensure plugin ID is provided in install request.',
    });
  }

  if (!request.request.requestedSpecifier && request.request.kind !== 'plugin-dir') {
    findings.push({
      id: 'install-missing-specifier',
      title: 'Missing version specifier',
      severity: 'low',
      category: 'plugin',
      description: 'Install request does not specify a version.',
      recommendation: 'Pin to specific versions for reproducibility.',
    });
  }

  if (sourceRisk.risk === 'high') {
    findings.push({
      id: `install-${request.targetName}-high-risk`,
      title: `High-risk install: ${request.targetName}`,
      severity: 'high',
      category: request.targetType === 'plugin' ? 'plugin' : 'config',
      description: sourceRisk.reasons.join('; '),
      recommendation: 'Use trusted sources or review carefully before installing.',
      metadata: {
        targetName: request.targetName,
        targetType: request.targetType,
        source: request.source,
      },
    });
  }

  if (sourceRisk.risk === 'medium') {
    findings.push({
      id: `install-${request.targetName}-medium-risk`,
      title: `Medium-risk install: ${request.targetName}`,
      severity: 'medium',
      category: request.targetType === 'plugin' ? 'plugin' : 'config',
      description: sourceRisk.reasons.join('; '),
      recommendation: 'Review the install source before proceeding.',
      metadata: {
        targetName: request.targetName,
        targetType: request.targetType,
        source: request.source,
      },
    });
  }

  logger.info(
    `[Security:InstallPolicy] ${request.targetType} ${request.targetName}: decision=${decision}`,
  );

  return { decision, reasons, findings };
}

export function isInstallAllowed(
  request: InstallPolicyRequest,
  options?: Parameters<typeof evaluateInstallPolicy>[1],
): boolean {
  const result = evaluateInstallPolicy(request, options);
  return result.decision === 'allow';
}

export function batchEvaluateInstallPolicy(
  requests: InstallPolicyRequest[],
  options?: Parameters<typeof evaluateInstallPolicy>[1],
): {
  allowed: InstallPolicyRequest[];
  denied: InstallPolicyRequest[];
  review: InstallPolicyRequest[];
  results: Map<string, InstallPolicyResult>;
} {
  const allowed: InstallPolicyRequest[] = [];
  const denied: InstallPolicyRequest[] = [];
  const review: InstallPolicyRequest[] = [];
  const results = new Map<string, InstallPolicyResult>();

  for (const request of requests) {
    const result = evaluateInstallPolicy(request, options);
    results.set(request.targetName, result);

    switch (result.decision) {
      case 'allow':
        allowed.push(request);
        break;
      case 'deny':
        denied.push(request);
        break;
      case 'review':
        review.push(request);
        break;
    }
  }

  logger.debug(
    `[Security:InstallPolicy] Batch: ${allowed.length} allowed, ${review.length} review, ${denied.length} denied`,
  );

  return { allowed, denied, review, results };
}

export function formatInstallDecision(
  result: InstallPolicyResult,
  targetName: string,
): string {
  const lines = [
    `Install decision for ${targetName}: ${result.decision.toUpperCase()}`,
  ];

  if (result.reasons.length > 0) {
    lines.push('Reasons:');
    for (const reason of result.reasons) {
      lines.push(`  - ${reason}`);
    }
  }

  if (result.findings.length > 0) {
    lines.push(`\nFindings (${result.findings.length}):`);
    for (const finding of result.findings) {
      lines.push(`  [${finding.severity}] ${finding.title}`);
    }
  }

  return lines.join('\n');
}
