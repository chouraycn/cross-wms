import { logger } from '../../logger.js';
import { isBlockedHostnameOrIp } from '../infra/ssrf.js';

export type AuditFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type AuditFinding = {
  id: string;
  title: string;
  severity: AuditFindingSeverity;
  category: 'network' | 'auth' | 'config' | 'filesystem' | 'command' | 'secrets';
  description: string;
  recommendation: string;
  autoFixable?: boolean;
  metadata?: Record<string, unknown>;
};

export type AuditContext = {
  config?: Record<string, unknown>;
  envVars?: string[];
  filePaths?: string[];
  networkEndpoints?: string[];
};

export type AuditResult = {
  findings: AuditFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  passed: boolean;
};

export async function runSecurityAudit(ctx: AuditContext = {}): Promise<AuditResult> {
  const findings: AuditFinding[] = [];

  // 1. Check environment variables for secrets exposure
  if (ctx.envVars) {
    for (const envVar of ctx.envVars) {
      const value = process.env[envVar];
      if (value && isSecretLikeValue(envVar, value)) {
        if (!envVar.includes('TOKEN') && !envVar.includes('PASSWORD') && !envVar.includes('SECRET') && !envVar.includes('KEY')) {
          findings.push({
            id: `env-${envVar.toLowerCase()}`,
            title: `Potential secret in env var ${envVar}`,
            severity: 'medium',
            category: 'secrets',
            description: `Environment variable ${envVar} appears to contain a secret value but is not named with a secret indicator.`,
            recommendation: `Rename to include SECRET, TOKEN, or KEY in the variable name.`,
          });
        }
      }
    }
  }

  // 2. Check network endpoints for SSRF risks
  if (ctx.networkEndpoints) {
    for (const endpoint of ctx.networkEndpoints) {
      try {
        const url = new URL(endpoint);
        if (isBlockedHostnameOrIp(url.hostname)) {
          findings.push({
            id: `net-${url.hostname}`,
            title: `Blocked hostname in network endpoint: ${url.hostname}`,
            severity: 'high',
            category: 'network',
            description: `Endpoint ${endpoint} resolves to a blocked hostname or private IP address.`,
            recommendation: 'Remove or replace with a public, trusted endpoint.',
          });
        }
      } catch {
        findings.push({
          id: `net-invalid-${endpoint}`,
          title: `Invalid network endpoint: ${endpoint}`,
          severity: 'low',
          category: 'network',
          description: `Endpoint ${endpoint} is not a valid URL.`,
          recommendation: 'Provide a valid URL.',
        });
      }
    }
  }

  // 3. Check config for insecure defaults
  if (ctx.config) {
    const config = ctx.config;
    const gateway = config['gateway'] as Record<string, unknown> | undefined;
    if (gateway) {
      const auth = gateway['auth'] as Record<string, unknown> | undefined;
      if (!auth || auth['mode'] === 'none' || auth['mode'] === undefined) {
        findings.push({
          id: 'config-no-auth',
          title: 'Gateway has no authentication configured',
          severity: 'high',
          category: 'auth',
          description: 'Gateway auth mode is "none" or not set. All connections are unauthenticated.',
          recommendation: 'Set gateway.auth.mode to "token" or "password" and configure credentials.',
          autoFixable: false,
        });
      }
    }

    const logging = config['logging'] as Record<string, unknown> | undefined;
    if (logging && logging['redactSecrets'] === false) {
      findings.push({
        id: 'config-no-redact',
        title: 'Secret redaction is disabled',
        severity: 'medium',
        category: 'config',
        description: 'logging.redactSecrets is false. Secrets may appear in logs.',
        recommendation: 'Set logging.redactSecrets to true.',
        autoFixable: true,
      });
    }
  }

  // 4. Check file paths for traversal risks
  if (ctx.filePaths) {
    for (const filePath of ctx.filePaths) {
      if (filePath.includes('..')) {
        findings.push({
          id: `path-traversal-${filePath}`,
          title: `Path traversal detected: ${filePath}`,
          severity: 'high',
          category: 'filesystem',
          description: `File path ${filePath} contains ".." which may allow directory traversal.`,
          recommendation: 'Use absolute paths and validate against a root directory.',
          autoFixable: false,
        });
      }
    }
  }

  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
    total: findings.length,
  };

  const passed = summary.critical === 0 && summary.high === 0;

  logger.info(`[Security:Audit] Found ${summary.total} findings (${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low)`);

  return { findings, summary, passed };
}

export function quickAudit(): Promise<AuditResult> {
  return runSecurityAudit({
    envVars: Object.keys(process.env).filter(k => k.includes('API') || k.includes('TOKEN') || k.includes('KEY')),
    networkEndpoints: [],
    filePaths: [],
  });
}

function isSecretLikeValue(name: string, value: string): boolean {
  if (value.length < 8) return false;
  if (value.match(/^[a-z_]+$/i)) return false;
  return true;
}
