import { z } from 'zod';
import { logger } from '../../logger.js';
import type { SecurityFinding, SecurityLevel } from './types.js';

export type CoreConfigFlag = {
  key: string;
  name: string;
  description: string;
  severity: SecurityLevel;
  category: 'auth' | 'network' | 'filesystem' | 'config' | 'secrets';
  check: (config: Record<string, unknown>) => boolean;
  recommendation: string;
  remediation?: (config: Record<string, unknown>) => Record<string, unknown>;
};

export const CoreConfigSecuritySchema = z.object({
  checkCoreFlags: z.boolean().default(true),
  enforceCritical: z.boolean().default(false),
  autoRemediate: z.boolean().default(false),
});

export type CoreConfigSecurityOptions = z.infer<typeof CoreConfigSecuritySchema>;

export const CORE_DANGEROUS_FLAGS: CoreConfigFlag[] = [
  {
    key: 'core.auth.disabled',
    name: 'Core authentication disabled',
    description: 'Core authentication mechanism is completely disabled',
    severity: 'critical',
    category: 'auth',
    check: (config) => {
      const core = config['core'] as Record<string, unknown> | undefined;
      const auth = core?.['auth'] as Record<string, unknown> | undefined;
      return auth?.['enabled'] === false;
    },
    recommendation: 'Enable core authentication immediately.',
    remediation: (config) => {
      const core = config['core'] as Record<string, unknown> || {};
      const auth = (core['auth'] as Record<string, unknown>) || {};
      return {
        ...config,
        core: {
          ...core,
          auth: { ...auth, enabled: true },
        },
      };
    },
  },
  {
    key: 'core.tls.disabled',
    name: 'Core TLS disabled',
    description: 'TLS encryption is disabled for core communications',
    severity: 'critical',
    category: 'network',
    check: (config) => {
      const core = config['core'] as Record<string, unknown> | undefined;
      const tls = core?.['tls'] as Record<string, unknown> | undefined;
      return tls?.['enabled'] === false;
    },
    recommendation: 'Enable TLS for all core communications.',
    remediation: (config) => {
      const core = config['core'] as Record<string, unknown> || {};
      const tls = (core['tls'] as Record<string, unknown>) || {};
      return {
        ...config,
        core: {
          ...core,
          tls: { ...tls, enabled: true },
        },
      };
    },
  },
  {
    key: 'core.sandbox.disabled',
    name: 'Core sandbox disabled',
    description: 'Code execution sandbox is disabled for core operations',
    severity: 'critical',
    category: 'config',
    check: (config) => {
      const core = config['core'] as Record<string, unknown> | undefined;
      const sandbox = core?.['sandbox'] as Record<string, unknown> | undefined;
      return sandbox?.['enabled'] === false;
    },
    recommendation: 'Enable sandbox for all code execution environments.',
    remediation: (config) => {
      const core = config['core'] as Record<string, unknown> || {};
      const sandbox = (core['sandbox'] as Record<string, unknown>) || {};
      return {
        ...config,
        core: {
          ...core,
          sandbox: { ...sandbox, enabled: true },
        },
      };
    },
  },
  {
    key: 'core.secrets.insecure',
    name: 'Insecure secrets storage',
    description: 'Secrets are stored in plain text or insecure manner',
    severity: 'high',
    category: 'secrets',
    check: (config) => {
      const core = config['core'] as Record<string, unknown> | undefined;
      const secrets = core?.['secrets'] as Record<string, unknown> | undefined;
      return secrets?.['encryption'] === false || secrets?.['storage'] === 'plaintext';
    },
    recommendation: 'Enable encryption for secrets storage.',
    remediation: (config) => {
      const core = config['core'] as Record<string, unknown> || {};
      const secrets = (core['secrets'] as Record<string, unknown>) || {};
      return {
        ...config,
        core: {
          ...core,
          secrets: {
            ...secrets,
            encryption: true,
            storage: 'encrypted',
          },
        },
      };
    },
  },
  {
    key: 'core.rateLimit.disabled',
    name: 'Core rate limiting disabled',
    description: 'Rate limiting is disabled for core API',
    severity: 'high',
    category: 'network',
    check: (config) => {
      const core = config['core'] as Record<string, unknown> | undefined;
      const rateLimit = core?.['rateLimit'] as Record<string, unknown> | undefined;
      return rateLimit?.['enabled'] === false;
    },
    recommendation: 'Enable rate limiting to prevent abuse.',
    remediation: (config) => {
      const core = config['core'] as Record<string, unknown> || {};
      const rateLimit = (core['rateLimit'] as Record<string, unknown>) || {};
      return {
        ...config,
        core: {
          ...core,
          rateLimit: { ...rateLimit, enabled: true },
        },
      };
    },
  },
  {
    key: 'core.cors.wildcard',
    name: 'Core CORS wildcard',
    description: 'CORS is configured with wildcard origin',
    severity: 'high',
    category: 'network',
    check: (config) => {
      const core = config['core'] as Record<string, unknown> | undefined;
      const cors = core?.['cors'] as Record<string, unknown> | undefined;
      return cors?.['origin'] === '*';
    },
    recommendation: 'Restrict CORS origins to trusted domains only.',
    remediation: (config) => {
      const core = config['core'] as Record<string, unknown> || {};
      const cors = (core['cors'] as Record<string, unknown>) || {};
      return {
        ...config,
        core: {
          ...core,
          cors: { ...cors, origin: [] },
        },
      };
    },
  },
  {
    key: 'core.debug.enabled',
    name: 'Core debug mode enabled',
    description: 'Debug mode is enabled for core services',
    severity: 'medium',
    category: 'config',
    check: (config) => {
      const core = config['core'] as Record<string, unknown> | undefined;
      const debug = core?.['debug'] as Record<string, unknown> | undefined;
      return debug?.['enabled'] === true;
    },
    recommendation: 'Disable debug mode in production environments.',
    remediation: (config) => {
      const core = config['core'] as Record<string, unknown> || {};
      const debug = (core['debug'] as Record<string, unknown>) || {};
      return {
        ...config,
        core: {
          ...core,
          debug: { ...debug, enabled: false },
        },
      };
    },
  },
  {
    key: 'core.telemetry.disabled',
    name: 'Core telemetry disabled',
    description: 'Error reporting and telemetry are disabled',
    severity: 'info',
    category: 'config',
    check: (config) => {
      const core = config['core'] as Record<string, unknown> | undefined;
      const telemetry = core?.['telemetry'] as Record<string, unknown> | undefined;
      return telemetry?.['enabled'] === false;
    },
    recommendation: 'Consider enabling error reporting to help improve security.',
  },
];

export function collectCoreDangerousConfigFlags(config: Record<string, unknown>): string[] {
  const dangerousFlags: string[] = [];

  for (const flag of CORE_DANGEROUS_FLAGS) {
    try {
      if (flag.check(config)) {
        dangerousFlags.push(flag.key);
      }
    } catch (err) {
      logger.debug(`[Security:CoreConfigFlags] Error checking flag ${flag.key}:`, err);
    }
  }

  return dangerousFlags;
}

export function auditCoreConfigSecurity(
  config: Record<string, unknown>,
  options: Partial<CoreConfigSecurityOptions> = {},
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const { checkCoreFlags = true } = options;

  if (!checkCoreFlags) {
    return findings;
  }

  for (const flag of CORE_DANGEROUS_FLAGS) {
    try {
      if (flag.check(config)) {
        findings.push({
          id: `core-config-flag-${flag.key}`,
          title: flag.name,
          severity: flag.severity,
          category: flag.category,
          description: flag.description,
          recommendation: flag.recommendation,
          autoFixable: flag.remediation !== undefined,
          metadata: { flagKey: flag.key, hasRemediation: flag.remediation !== undefined },
        });
      }
    } catch (err) {
      logger.debug(`[Security:CoreConfigFlags] Error checking flag ${flag.key}:`, err);
    }
  }

  logger.debug(`[Security:CoreConfigFlags] Found ${findings.length} dangerous core config flags`);

  return findings;
}

export function remediateCoreConfigSecurity(
  config: Record<string, unknown>,
  options: Partial<CoreConfigSecurityOptions> = {},
): {
  config: Record<string, unknown>;
  fixedFlags: string[];
  skippedFlags: string[];
} {
  const { autoRemediate = true, enforceCritical = true } = options;
  let currentConfig = { ...config };
  const fixedFlags: string[] = [];
  const skippedFlags: string[] = [];

  for (const flag of CORE_DANGEROUS_FLAGS) {
    try {
      if (flag.check(currentConfig)) {
        if (flag.remediation && (autoRemediate || (enforceCritical && flag.severity === 'critical'))) {
          currentConfig = flag.remediation(currentConfig);
          fixedFlags.push(flag.key);
        } else {
          skippedFlags.push(flag.key);
        }
      }
    } catch (err) {
      logger.debug(`[Security:CoreConfigFlags] Error remediating flag ${flag.key}:`, err);
      skippedFlags.push(flag.key);
    }
  }

  logger.info(`[Security:CoreConfigFlags] Remediated ${fixedFlags.length} core config flags`);

  return { config: currentConfig, fixedFlags, skippedFlags };
}

export function isCoreConfigSafe(config: Record<string, unknown>): boolean {
  const findings = auditCoreConfigSecurity(config);
  return findings.filter((f) => f.severity === 'critical').length === 0;
}