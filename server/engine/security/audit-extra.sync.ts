import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type ExtraSyncAuditCheck = {
  id: string;
  name: string;
  category: 'network' | 'auth' | 'config' | 'filesystem' | 'command' | 'secrets';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  check: (context: ExtraSyncAuditContext) => SecurityFinding[];
};

export type ExtraSyncAuditContext = {
  config?: Record<string, unknown>;
  envVars?: Record<string, string>;
  packageJson?: Record<string, unknown>;
  files?: string[];
};

const SYNC_AUDIT_CHECKS: ExtraSyncAuditCheck[] = [
  {
    id: 'sync-audit-env-secrets',
    name: 'Environment Secrets Exposure',
    category: 'secrets',
    severity: 'high',
    check: (context) => {
      const findings: SecurityFinding[] = [];
      const envVars = context.envVars ?? process.env;

      const secretPatterns = [
        { keyPattern: /^API_KEY/i, label: 'API key' },
        { keyPattern: /^TOKEN/i, label: 'Token' },
        { keyPattern: /^PASSWORD/i, label: 'Password' },
        { keyPattern: /^SECRET/i, label: 'Secret' },
        { keyPattern: /^AUTH/i, label: 'Auth credential' },
        { keyPattern: /^ACCESS_KEY/i, label: 'Access key' },
        { keyPattern: /^PRIVATE_KEY/i, label: 'Private key' },
        { keyPattern: /^CREDENTIAL/i, label: 'Credential' },
      ];

      for (const [key, value] of Object.entries(envVars)) {
        for (const { keyPattern, label } of secretPatterns) {
          if (keyPattern.test(key)) {
            if (value && value.length > 0) {
              if (value.length < 8) {
                findings.push({
                  id: `sync-env-weak-${key}`,
                  title: `Weak ${label}: ${key}`,
                  severity: 'medium',
                  category: 'secrets',
                  description: `Environment variable ${key} contains a ${label} that appears weak (too short).`,
                  recommendation: 'Use longer, more secure secrets.',
                  metadata: { key, valueLength: value.length },
                });
              } else if (/^[a-zA-Z0-9]+$/.test(value)) {
                findings.push({
                  id: `sync-env-predictable-${key}`,
                  title: `Potentially predictable ${label}: ${key}`,
                  severity: 'low',
                  category: 'secrets',
                  description: `Environment variable ${key} contains a ${label} with only alphanumeric characters.`,
                  recommendation: 'Use secrets with mixed character types for better entropy.',
                  metadata: { key },
                });
              }
            }
            break;
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'sync-audit-config-strict',
    name: 'Strict Config Validation',
    category: 'config',
    severity: 'medium',
    check: (context) => {
      const findings: SecurityFinding[] = [];
      const config = context.config ?? {};

      const strictChecks = [
        {
          path: 'security.strictMode',
          check: (c: Record<string, unknown>) => !c['security'] || (c['security'] as Record<string, unknown>)['strictMode'] !== true,
          message: 'Security strict mode is not enabled',
          recommendation: 'Enable security.strictMode for enhanced security protections.',
        },
        {
          path: 'security.maxRetries',
          check: (c: Record<string, unknown>) => {
            const sec = c['security'] as Record<string, unknown> | undefined;
            const maxRetries = sec?.['maxRetries'] as number | undefined;
            return maxRetries === undefined || maxRetries > 5;
          },
          message: 'Max retries limit may be too high',
          recommendation: 'Set security.maxRetries to 5 or lower to prevent brute-force attacks.',
        },
        {
          path: 'security.timeout',
          check: (c: Record<string, unknown>) => {
            const sec = c['security'] as Record<string, unknown> | undefined;
            const timeout = sec?.['timeout'] as number | undefined;
            return timeout === undefined || timeout > 30000;
          },
          message: 'Security timeout may be too long',
          recommendation: 'Set security.timeout to 30000ms (30 seconds) or lower.',
        },
      ];

      for (const { path, check: checkFn, message, recommendation } of strictChecks) {
        if (checkFn(config)) {
          findings.push({
            id: `sync-config-${path.replace(/\./g, '-')}`,
            title: message,
            severity: 'medium',
            category: 'config',
            description: `Configuration path "${path}" does not meet security best practices. ${message}.`,
            recommendation,
            metadata: { configPath: path },
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'sync-audit-package-vulnerabilities',
    name: 'Package Vulnerability Indicators',
    category: 'config',
    severity: 'medium',
    check: (context) => {
      const findings: SecurityFinding[] = [];
      const pkg = context.packageJson;

      if (!pkg) return findings;

      const devDependencies = pkg['devDependencies'] as Record<string, string> | undefined;
      const dependencies = pkg['dependencies'] as Record<string, string> | undefined;

      const vulnerablePatterns = [
        { name: 'lodash', pattern: /^[\^~]?4\./, message: 'Old lodash version may have vulnerabilities' },
        { name: 'moment', pattern: /^[\^~]?2\./, message: 'Moment.js is deprecated and may have security issues' },
        { name: 'request', pattern: /.*/, message: 'Request library is deprecated' },
        { name: 'cheerio', pattern: /^[\^~]?1\./, message: 'Old cheerio version may have vulnerabilities' },
      ];

      const checkDeps = (deps: Record<string, string> | undefined, type: string) => {
        if (!deps) return;

        for (const { name, pattern, message } of vulnerablePatterns) {
          const version = deps[name];
          if (version && pattern.test(version)) {
            findings.push({
              id: `sync-pkg-${name}`,
              title: `${message}: ${name}@${version}`,
              severity: 'medium',
              category: 'config',
              description: `Package ${name}@${version} in ${type} may have known vulnerabilities. ${message}.`,
              recommendation: 'Update to the latest version or replace with a maintained alternative.',
              metadata: { package: name, version, type },
            });
          }
        }
      };

      checkDeps(dependencies, 'dependencies');
      checkDeps(devDependencies, 'devDependencies');

      return findings;
    },
  },
  {
    id: 'sync-audit-file-patterns',
    name: 'Suspicious File Patterns',
    category: 'filesystem',
    severity: 'medium',
    check: (context) => {
      const findings: SecurityFinding[] = [];
      const files = context.files ?? [];

      const suspiciousPatterns = [
        { pattern: /^\.env(\.local)?$/, label: 'Environment variable file', severity: 'high' as const },
        { pattern: /^config\.local\.json$/, label: 'Local config file', severity: 'medium' as const },
        { pattern: /^.*\.key$/, label: 'Key file', severity: 'high' as const },
        { pattern: /^.*\.pem$/, label: 'Certificate file', severity: 'high' as const },
        { pattern: /^.*\.private$/, label: 'Private file', severity: 'high' as const },
        { pattern: /^.*_secret\..*$/, label: 'Secret file', severity: 'high' as const },
        { pattern: /^.*_token\..*$/, label: 'Token file', severity: 'medium' as const },
      ];

      for (const file of files) {
        for (const { pattern, label, severity } of suspiciousPatterns) {
          if (pattern.test(file)) {
            findings.push({
              id: `sync-file-${file}`,
              title: `Suspicious file detected: ${file}`,
              severity,
              category: 'filesystem',
              description: `File "${file}" matches pattern for ${label}. This file may contain sensitive information.`,
              recommendation: 'Ensure sensitive files are properly secured with restricted permissions.',
              metadata: { file, pattern: label },
            });
            break;
          }
        }
      }

      return findings;
    },
  },
];

export function runExtraSyncAudit(context?: ExtraSyncAuditContext): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const check of SYNC_AUDIT_CHECKS) {
    try {
      const checkFindings = check.check(context ?? {});
      findings.push(...checkFindings);
    } catch (err) {
      logger.debug(`[Security:ExtraSync] Error running check ${check.id}:`, err);
    }
  }

  logger.debug(`[Security:ExtraSync] Completed ${SYNC_AUDIT_CHECKS.length} sync checks, found ${findings.length} findings`);

  return findings;
}

export function listExtraSyncChecks(): {
  id: string;
  name: string;
  category: ExtraSyncAuditCheck['category'];
  severity: ExtraSyncAuditCheck['severity'];
}[] {
  return SYNC_AUDIT_CHECKS.map((c) => ({ id: c.id, name: c.name, category: c.category, severity: c.severity }));
}