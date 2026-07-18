import { z } from 'zod';
import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type ConfigRegexPattern = {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  flags?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'network' | 'auth' | 'config' | 'filesystem' | 'command' | 'secrets';
  recommendation: string;
  validationFn?: (match: RegExpExecArray) => boolean;
};

export const ConfigRegexSchema = z.object({
  patterns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      pattern: z.string(),
      flags: z.string().optional(),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      category: z.enum(['network', 'auth', 'config', 'filesystem', 'command', 'secrets']),
      recommendation: z.string(),
    }),
  ),
});

export type ConfigRegexOptions = {
  ignoreCase?: boolean;
  multiline?: boolean;
  global?: boolean;
};

export const CONFIG_REGEX_PATTERNS: ConfigRegexPattern[] = [
  {
    id: 'config-regex-secret-exposure',
    name: 'Secret exposure in config',
    description: 'Potential secret or credential exposed in config value',
    pattern: /(api[_-]?key|secret|password|token)\s*[=:]\s*['"][^'"]{10,}['"]/gi,
    severity: 'critical',
    category: 'secrets',
    recommendation: 'Remove or encrypt sensitive values in configuration files.',
  },
  {
    id: 'config-regex-private-key',
    name: 'Private key in config',
    description: 'Private key content found in config',
    pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/gi,
    severity: 'critical',
    category: 'secrets',
    recommendation: 'Remove private keys from configuration. Use environment variables or secure vault.',
  },
  {
    id: 'config-regex-insecure-url',
    name: 'Insecure HTTP URL',
    description: 'HTTP URL found instead of HTTPS',
    pattern: /https?:\/\/[\w.-]+(:\d+)?/gi,
    severity: 'high',
    category: 'network',
    recommendation: 'Use HTTPS URLs for all network connections.',
    validationFn: (match) => !match[0].startsWith('https://'),
  },
  {
    id: 'config-regex-localhost',
    name: 'Localhost URL',
    description: 'Localhost or 127.0.0.1 URL found',
    pattern: /(localhost|127\.0\.0\.1|0\.0\.0\.0)/gi,
    severity: 'medium',
    category: 'network',
    recommendation: 'Review if localhost connections are intended. May indicate SSRF risk.',
  },
  {
    id: 'config-regex-ssh-key',
    name: 'SSH private key path',
    description: 'Path to SSH private key',
    pattern: /(~\/|\.ssh\/)(id_rsa|id_ed25519|id_dsa|id_ecdsa)(\.pub)?/gi,
    severity: 'high',
    category: 'filesystem',
    recommendation: 'Avoid hardcoding SSH key paths in configuration.',
  },
  {
    id: 'config-regex-env-file',
    name: '.env file reference',
    description: 'Reference to .env file',
    pattern: /\.env(\.local)?/gi,
    severity: 'medium',
    category: 'filesystem',
    recommendation: 'Ensure .env files are properly secured and not committed to version control.',
  },
  {
    id: 'config-regex-exec-command',
    name: 'Exec command pattern',
    description: 'Potential command execution pattern',
    pattern: /(exec|spawn|shell)\s*[:=]\s*['"`][^'"]+['"]/gi,
    severity: 'high',
    category: 'command',
    recommendation: 'Avoid hardcoding commands in configuration. Use parameterized execution.',
  },
  {
    id: 'config-regex-base64-data',
    name: 'Base64 encoded data',
    description: 'Base64 encoded content that may contain secrets',
    pattern: /data:\s*[a-zA-Z]+\/[a-zA-Z+.-]+;\s*base64,\s*[A-Za-z0-9+/=]{20,}/gi,
    severity: 'medium',
    category: 'secrets',
    recommendation: 'Avoid embedding large base64 data in configuration.',
  },
  {
    id: 'config-regex-cors-wildcard',
    name: 'CORS wildcard',
    description: 'CORS origin set to wildcard',
    pattern: /cors\s*[:=]\s*['"]\*['"]/gi,
    severity: 'high',
    category: 'network',
    recommendation: 'Restrict CORS origins to specific domains.',
  },
  {
    id: 'config-regex-debug-mode',
    name: 'Debug mode enabled',
    description: 'Debug or development mode enabled',
    pattern: /(debug|development)\s*[:=]\s*(true|1|yes)/gi,
    severity: 'medium',
    category: 'config',
    recommendation: 'Disable debug mode in production.',
  },
];

export function validateConfigWithRegex(configContent: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const pattern of CONFIG_REGEX_PATTERNS) {
    try {
      const regex = new RegExp(pattern.pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(configContent)) !== null) {
        if (pattern.validationFn && !pattern.validationFn(match)) {
          continue;
        }

        const before = configContent.substring(0, match.index);
        const line = before.split('\n').length;
        const column = before.split('\n').pop()?.length ?? 0;

        findings.push({
          id: `${pattern.id}-${line}-${column}`,
          title: pattern.name,
          severity: pattern.severity,
          category: pattern.category,
          description: `${pattern.description} at line ${line}, column ${column}.`,
          recommendation: pattern.recommendation,
          metadata: {
            patternId: pattern.id,
            line,
            column,
            matchedValue: match[0],
            groups: match.slice(1),
          },
        });
      }
    } catch (err) {
      logger.debug(`[Security:ConfigRegex] Error with pattern ${pattern.id}:`, err);
    }
  }

  logger.debug(`[Security:ConfigRegex] Validated config, found ${findings.length} findings`);

  return findings;
}

export function validateConfigValue(
  key: string,
  value: unknown,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const stringValue = String(value);

  for (const pattern of CONFIG_REGEX_PATTERNS) {
    try {
      const regex = new RegExp(pattern.pattern.source, pattern.flags);
      const match = regex.exec(stringValue);

      if (match && (!pattern.validationFn || pattern.validationFn(match))) {
        findings.push({
          id: `${pattern.id}-${key}`,
          title: `${pattern.name} in ${key}`,
          severity: pattern.severity,
          category: pattern.category,
          description: `Found ${pattern.description} in config key "${key}".`,
          recommendation: pattern.recommendation,
          metadata: {
            patternId: pattern.id,
            configKey: key,
            matchedValue: match[0],
          },
        });
      }
    } catch (err) {
      logger.debug(`[Security:ConfigRegex] Error validating key ${key} with pattern ${pattern.id}:`, err);
    }
  }

  return findings;
}

export function getConfigRegexPattern(id: string): ConfigRegexPattern | undefined {
  return CONFIG_REGEX_PATTERNS.find((p) => p.id === id);
}

export function getConfigRegexPatternsByCategory(
  category: ConfigRegexPattern['category'],
): ConfigRegexPattern[] {
  return CONFIG_REGEX_PATTERNS.filter((p) => p.category === category);
}

export function addCustomConfigRegexPattern(pattern: ConfigRegexPattern): void {
  const existingIndex = CONFIG_REGEX_PATTERNS.findIndex((p) => p.id === pattern.id);
  if (existingIndex >= 0) {
    CONFIG_REGEX_PATTERNS[existingIndex] = pattern;
  } else {
    CONFIG_REGEX_PATTERNS.push(pattern);
  }
  logger.debug(`[Security:ConfigRegex] Added custom pattern: ${pattern.id}`);
}

export function removeConfigRegexPattern(id: string): boolean {
  const index = CONFIG_REGEX_PATTERNS.findIndex((p) => p.id === id);
  if (index >= 0) {
    CONFIG_REGEX_PATTERNS.splice(index, 1);
    logger.debug(`[Security:ConfigRegex] Removed pattern: ${id}`);
    return true;
  }
  return false;
}