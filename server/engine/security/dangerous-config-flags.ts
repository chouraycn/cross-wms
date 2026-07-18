import { z } from 'zod';
import { logger } from '../../logger.js';
import type { ConfigSecurityRating, SecurityFinding, SecurityLevel, SecurityRating } from './types.js';

type ConfigFlag = {
  key: string;
  name: string;
  description: string;
  severity: SecurityLevel;
  category: 'auth' | 'network' | 'filesystem' | 'config' | 'secrets';
  check: (config: Record<string, unknown>) => boolean;
  recommendation: string;
};

const DANGEROUS_FLAGS: ConfigFlag[] = [
  {
    key: 'auth.disabled',
    name: 'Authentication disabled',
    description: 'Authentication is completely disabled, allowing unauthenticated access',
    severity: 'critical',
    category: 'auth',
    check: (config) => {
      const gateway = config['gateway'] as Record<string, unknown> | undefined;
      const auth = gateway?.['auth'] as Record<string, unknown> | undefined;
      return auth?.['mode'] === 'none' || auth?.['enabled'] === false;
    },
    recommendation: 'Enable authentication with token or password mode.',
  },
  {
    key: 'logging.redactSecrets.disabled',
    name: 'Secret redaction disabled',
    description: 'Secret redaction in logs is disabled, potentially exposing secrets in logs',
    severity: 'medium',
    category: 'secrets',
    check: (config) => {
      const logging = config['logging'] as Record<string, unknown> | undefined;
      return logging?.['redactSecrets'] === false;
    },
    recommendation: 'Enable secret redaction in logging configuration.',
  },
  {
    key: 'cors.enabled',
    name: 'CORS enabled with broad allowlist',
    description: 'CORS is enabled with a broad or wildcard allowlist',
    severity: 'medium',
    category: 'network',
    check: (config) => {
      const server = config['server'] as Record<string, unknown> | undefined;
      const cors = server?.['cors'] as Record<string, unknown> | undefined;
      return cors?.['enabled'] === true && (cors?.['origin'] === '*' || cors?.['origin'] === true);
    },
    recommendation: 'Restrict CORS origins to trusted domains only.',
  },
  {
    key: 'plugins.autoLoad',
    name: 'Plugin auto-loading enabled',
    description: 'Plugins are automatically loaded without explicit allowlist',
    severity: 'high',
    category: 'config',
    check: (config) => {
      const plugins = config['plugins'] as Record<string, unknown> | undefined;
      return plugins?.['autoLoadEnabled'] === true;
    },
    recommendation: 'Disable plugin auto-loading and use explicit allowlist.',
  },
  {
    key: 'sandbox.disabled',
    name: 'Sandbox disabled',
    description: 'Code execution sandbox is disabled',
    severity: 'critical',
    category: 'config',
    check: (config) => {
      const sandbox = config['sandbox'] as Record<string, unknown> | undefined;
      return sandbox?.['enabled'] === false || sandbox?.['mode'] === 'off';
    },
    recommendation: 'Enable sandbox for all code execution environments.',
  },
  {
    key: 'debug.mode',
    name: 'Debug mode enabled in production',
    description: 'Debug mode is enabled, which may expose sensitive information',
    severity: 'medium',
    category: 'config',
    check: (config) => {
      const debug = config['debug'] as Record<string, unknown> | undefined;
      return debug?.['enabled'] === true;
    },
    recommendation: 'Disable debug mode in production environments.',
  },
  {
    key: 'telemetry.disabled',
    name: 'Telemetry disabled (informational)',
    description: 'Error reporting and telemetry are disabled',
    severity: 'info',
    category: 'config',
    check: (config) => {
      const privacy = config['privacy'] as Record<string, unknown> | undefined;
      return privacy?.['enableErrorReporting'] === false;
    },
    recommendation: 'Consider enabling error reporting to help improve security.',
  },
  {
    key: 'rateLimit.disabled',
    name: 'Rate limiting disabled',
    description: 'API rate limiting is disabled, potentially allowing DoS attacks',
    severity: 'high',
    category: 'network',
    check: (config) => {
      const rateLimit = config['rateLimit'] as Record<string, unknown> | undefined;
      return rateLimit?.['enabled'] === false;
    },
    recommendation: 'Enable rate limiting to prevent abuse.',
  },
  {
    key: 'https.disabled',
    name: 'HTTPS/TLS disabled',
    description: 'TLS encryption is disabled for server connections',
    severity: 'critical',
    category: 'network',
    check: (config) => {
      const tls = config['tls'] as Record<string, unknown> | undefined;
      return tls?.['enabled'] === false;
    },
    recommendation: 'Enable TLS/HTTPS for all network connections.',
  },
  {
    key: 'fileUpload.unrestricted',
    name: 'Unrestricted file upload',
    description: 'File uploads have no restrictions on file types or size',
    severity: 'high',
    category: 'filesystem',
    check: (config) => {
      const upload = config['upload'] as Record<string, unknown> | undefined;
      return upload?.['allowedTypes'] === '*' || upload?.['maxSize'] === 0;
    },
    recommendation: 'Restrict allowed file types and set reasonable file size limits.',
  },
];

export const ConfigSecuritySchema = z.object({
  checkDangerousFlags: z.boolean().default(true),
  minSecurityRating: z.enum(['safe', 'low_risk', 'medium_risk', 'high_risk', 'critical_risk']).default('medium_risk'),
});

export type ConfigSecurityOptions = z.infer<typeof ConfigSecuritySchema>;

export function collectDangerousConfigFlags(config: Record<string, unknown>): string[] {
  const dangerousFlags: string[] = [];

  for (const flag of DANGEROUS_FLAGS) {
    try {
      if (flag.check(config)) {
        dangerousFlags.push(flag.key);
      }
    } catch (err) {
      logger.debug(`[Security:ConfigFlags] Error checking flag ${flag.key}:`, err);
    }
  }

  return dangerousFlags;
}

export function auditConfigSecurity(
  config: Record<string, unknown>,
  options: Partial<ConfigSecurityOptions> = {},
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const flag of DANGEROUS_FLAGS) {
    try {
      if (flag.check(config)) {
        findings.push({
          id: `config-flag-${flag.key}`,
          title: flag.name,
          severity: flag.severity,
          category: flag.category,
          description: flag.description,
          recommendation: flag.recommendation,
          autoFixable: false,
          metadata: { flagKey: flag.key },
        });
      }
    } catch (err) {
      logger.debug(`[Security:ConfigFlags] Error checking flag ${flag.key}:`, err);
    }
  }

  logger.debug(`[Security:ConfigFlags] Found ${findings.length} dangerous config flags`);

  return findings;
}

function calculateSecurityScore(findings: SecurityFinding[]): number {
  let score = 100;
  const severityPenalties: Record<SecurityLevel, number> = {
    critical: 30,
    high: 15,
    medium: 8,
    low: 3,
    info: 1,
  };

  for (const finding of findings) {
    score -= severityPenalties[finding.severity] ?? 0;
  }

  return Math.max(0, score);
}

function scoreToRating(score: number): SecurityRating {
  if (score >= 90) return 'safe';
  if (score >= 70) return 'low_risk';
  if (score >= 50) return 'medium_risk';
  if (score >= 25) return 'high_risk';
  return 'critical_risk';
}

export function rateConfigSecurity(
  config: Record<string, unknown>,
  options: Partial<ConfigSecurityOptions> = {},
): ConfigSecurityRating {
  const findings = auditConfigSecurity(config, options);
  const dangerousFlags = collectDangerousConfigFlags(config);
  const score = calculateSecurityScore(findings);
  const rating = scoreToRating(score);

  logger.info(`[Security:ConfigFlags] Config security rating: ${rating} (score: ${score}/100)`);

  return {
    rating,
    score,
    findings,
    dangerousFlags,
  };
}

export function isConfigSafe(
  config: Record<string, unknown>,
  minRating: SecurityRating = 'medium_risk',
): boolean {
  const { rating } = rateConfigSecurity(config);
  const ratingOrder: SecurityRating[] = ['safe', 'low_risk', 'medium_risk', 'high_risk', 'critical_risk'];
  return ratingOrder.indexOf(rating) <= ratingOrder.indexOf(minRating);
}
