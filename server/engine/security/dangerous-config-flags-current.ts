import { logger } from '../../logger.js';
import type { SecurityFinding, SecurityLevel } from './types.js';

export type CurrentConfigFlag = {
  key: string;
  name: string;
  description: string;
  severity: SecurityLevel;
  category: 'auth' | 'network' | 'filesystem' | 'config' | 'secrets' | 'plugin' | 'command';
  check: (config: Record<string, unknown>) => boolean;
  recommendation: string;
  default?: unknown;
  acceptableValues?: unknown[];
};

export const CURRENT_DANGEROUS_FLAGS: CurrentConfigFlag[] = [
  {
    key: 'current.auth.mode',
    name: 'Authentication mode not configured',
    description: 'Authentication mode is not set or set to insecure value',
    severity: 'high',
    category: 'auth',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const auth = current?.['auth'] as Record<string, unknown> | undefined;
      const mode = auth?.['mode'] as string | undefined;
      return !mode || ['none', 'insecure', 'anonymous'].includes(mode);
    },
    recommendation: 'Set auth.mode to "token" or "password".',
    acceptableValues: ['token', 'password', 'oauth2', 'saml'],
  },
  {
    key: 'current.security.strict',
    name: 'Strict security mode disabled',
    description: 'Strict security checks are disabled',
    severity: 'high',
    category: 'config',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const security = current?.['security'] as Record<string, unknown> | undefined;
      return security?.['strict'] !== true;
    },
    recommendation: 'Enable strict security mode for enhanced protections.',
    default: true,
  },
  {
    key: 'current.network.externalAccess',
    name: 'Unrestricted external network access',
    description: 'External network access is not restricted',
    severity: 'high',
    category: 'network',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const network = current?.['network'] as Record<string, unknown> | undefined;
      const externalAccess = network?.['externalAccess'] as string | undefined;
      return externalAccess === 'unrestricted' || externalAccess === '*';
    },
    recommendation: 'Restrict external network access to allowed hosts.',
    acceptableValues: ['restricted', 'allowlist', 'denylist'],
  },
  {
    key: 'current.filesystem.root',
    name: 'Filesystem root is too permissive',
    description: 'Filesystem root allows access to entire filesystem',
    severity: 'high',
    category: 'filesystem',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const filesystem = current?.['filesystem'] as Record<string, unknown> | undefined;
      const root = filesystem?.['root'] as string | undefined;
      return !root || root === '/' || root === '/*';
    },
    recommendation: 'Set filesystem.root to a restricted directory.',
  },
  {
    key: 'current.plugins.allowUntrusted',
    name: 'Untrusted plugins allowed',
    description: 'Plugins from untrusted sources are allowed to run',
    severity: 'high',
    category: 'plugin',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const plugins = current?.['plugins'] as Record<string, unknown> | undefined;
      return plugins?.['allowUntrusted'] === true;
    },
    recommendation: 'Set plugins.allowUntrusted to false.',
    default: false,
  },
  {
    key: 'current.command.allowShell',
    name: 'Shell commands allowed',
    description: 'Arbitrary shell command execution is allowed',
    severity: 'critical',
    category: 'command',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const command = current?.['command'] as Record<string, unknown> | undefined;
      return command?.['allowShell'] === true;
    },
    recommendation: 'Disable shell command execution unless explicitly required.',
    default: false,
  },
  {
    key: 'current.command.allowExec',
    name: 'Exec commands allowed',
    description: 'Direct exec command execution is allowed',
    severity: 'critical',
    category: 'command',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const command = current?.['command'] as Record<string, unknown> | undefined;
      return command?.['allowExec'] === true;
    },
    recommendation: 'Disable direct exec unless explicitly required.',
    default: false,
  },
  {
    key: 'current.secrets.expose',
    name: 'Secrets exposure allowed',
    description: 'Secrets can be exposed in logs or responses',
    severity: 'high',
    category: 'secrets',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const secrets = current?.['secrets'] as Record<string, unknown> | undefined;
      return secrets?.['expose'] === true;
    },
    recommendation: 'Set secrets.expose to false.',
    default: false,
  },
  {
    key: 'current.webhook.allowAll',
    name: 'All webhook URLs allowed',
    description: 'Webhooks can be configured to any URL',
    severity: 'medium',
    category: 'network',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const webhook = current?.['webhook'] as Record<string, unknown> | undefined;
      return webhook?.['allowAll'] === true;
    },
    recommendation: 'Restrict webhook URLs to allowlist.',
    default: false,
  },
  {
    key: 'current.api.allowUnauthenticated',
    name: 'Unauthenticated API access allowed',
    description: 'API endpoints can be accessed without authentication',
    severity: 'high',
    category: 'auth',
    check: (config) => {
      const current = config['current'] as Record<string, unknown> | undefined;
      const api = current?.['api'] as Record<string, unknown> | undefined;
      return api?.['allowUnauthenticated'] === true;
    },
    recommendation: 'Disable unauthenticated API access.',
    default: false,
  },
];

export function collectCurrentDangerousConfigFlags(config: Record<string, unknown>): string[] {
  const dangerousFlags: string[] = [];

  for (const flag of CURRENT_DANGEROUS_FLAGS) {
    try {
      if (flag.check(config)) {
        dangerousFlags.push(flag.key);
      }
    } catch (err) {
      logger.debug(`[Security:CurrentConfigFlags] Error checking flag ${flag.key}:`, err);
    }
  }

  return dangerousFlags;
}

export function auditCurrentConfigSecurity(config: Record<string, unknown>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const flag of CURRENT_DANGEROUS_FLAGS) {
    try {
      if (flag.check(config)) {
        findings.push({
          id: `current-config-flag-${flag.key}`,
          title: flag.name,
          severity: flag.severity,
          category: flag.category,
          description: flag.description,
          recommendation: flag.recommendation,
          autoFixable: flag.default !== undefined,
          metadata: {
            flagKey: flag.key,
            defaultValue: flag.default,
            acceptableValues: flag.acceptableValues,
          },
        });
      }
    } catch (err) {
      logger.debug(`[Security:CurrentConfigFlags] Error checking flag ${flag.key}:`, err);
    }
  }

  logger.debug(`[Security:CurrentConfigFlags] Found ${findings.length} dangerous current config flags`);

  return findings;
}

export function getCurrentConfigFlag(key: string): CurrentConfigFlag | undefined {
  return CURRENT_DANGEROUS_FLAGS.find((f) => f.key === key);
}

export function getCurrentConfigFlagByCategory(category: CurrentConfigFlag['category']): CurrentConfigFlag[] {
  return CURRENT_DANGEROUS_FLAGS.filter((f) => f.category === category);
}

export function validateCurrentConfigFlag(key: string, value: unknown): {
  valid: boolean;
  reason?: string;
  acceptableValues?: unknown[];
} {
  const flag = getCurrentConfigFlag(key);
  if (!flag) {
    return { valid: true };
  }

  if (flag.acceptableValues && !flag.acceptableValues.includes(value)) {
    return {
      valid: false,
      reason: `Value "${String(value)}" is not acceptable for ${key}`,
      acceptableValues: flag.acceptableValues,
    };
  }

  return { valid: true };
}