import { z } from 'zod';
import { logger } from '../../logger.js';
import type { PluginTrustLevel, PluginTrustResult, SecurityFinding } from './types.js';

export type PluginSource = 'workspace' | 'bundled' | 'npm' | 'git' | 'clawhub' | 'unknown';

export type PluginInfo = {
  id: string;
  name?: string;
  version?: string;
  source: PluginSource;
  enabled: boolean;
  hasManifest: boolean;
  permissions?: string[];
  integrity?: string;
  installPath?: string;
  author?: string;
  homepage?: string;
  repository?: string;
};

export const PluginInfoSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  source: z.enum(['workspace', 'bundled', 'npm', 'git', 'clawhub', 'unknown']),
  enabled: z.boolean().default(false),
  hasManifest: z.boolean().default(false),
  permissions: z.array(z.string()).default([]),
  integrity: z.string().optional(),
  installPath: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
});

const TRUSTED_SOURCES: PluginSource[] = ['bundled', 'workspace'];
const VERIFIED_SOURCES: PluginSource[] = ['npm', 'clawhub'];
const UNTRUSTED_SOURCES: PluginSource[] = ['git', 'unknown'];

const HIGH_RISK_PERMISSIONS = [
  'fs_write',
  'fs_delete',
  'exec',
  'shell',
  'spawn',
  'network_admin',
  'config_modify',
  'plugin_install',
];

const MEDIUM_RISK_PERMISSIONS = [
  'fs_read',
  'network',
  'web_fetch',
  'memory_write',
  'clipboard',
];

export function determinePluginTrustLevel(plugin: PluginInfo): PluginTrustLevel {
  if (TRUSTED_SOURCES.includes(plugin.source)) {
    return 'trusted';
  }

  if (VERIFIED_SOURCES.includes(plugin.source) && plugin.integrity) {
    return 'verified';
  }

  if (UNTRUSTED_SOURCES.includes(plugin.source)) {
    return 'untrusted';
  }

  return 'unknown';
}

export function evaluatePluginTrust(plugin: PluginInfo): PluginTrustResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const trustLevel = determinePluginTrustLevel(plugin);

  switch (trustLevel) {
    case 'trusted':
      reasons.push(`Source ${plugin.source} is trusted`);
      break;
    case 'verified':
      reasons.push(`Source ${plugin.source} is verified`);
      reasons.push('Integrity checksum present');
      break;
    case 'untrusted':
      warnings.push(`Source ${plugin.source} is untrusted`);
      break;
    case 'unknown':
    default:
      warnings.push('Unknown plugin source');
      break;
  }

  if (!plugin.hasManifest) {
    warnings.push('No manifest file found');
  }

  if (!plugin.version) {
    warnings.push('No version specified');
  }

  if (!plugin.integrity && plugin.source !== 'workspace' && plugin.source !== 'bundled') {
    warnings.push('No integrity checksum');
  }

  const highRiskPerms = plugin.permissions?.filter((p) => HIGH_RISK_PERMISSIONS.includes(p)) ?? [];
  const mediumRiskPerms = plugin.permissions?.filter((p) => MEDIUM_RISK_PERMISSIONS.includes(p)) ?? [];

  if (highRiskPerms.length > 0) {
    warnings.push(`High-risk permissions: ${highRiskPerms.join(', ')}`);
  }
  if (mediumRiskPerms.length > 0) {
    reasons.push(`Medium-risk permissions: ${mediumRiskPerms.join(', ')}`);
  }

  logger.debug(`[Security:PluginTrust] Plugin ${plugin.id}: trust=${trustLevel}, warnings=${warnings.length}`);

  return {
    level: trustLevel,
    reasons,
    warnings,
  };
}

export function auditPluginsTrust(
  plugins: PluginInfo[],
  options: {
    trustedSources?: PluginSource[];
    requireIntegrity?: boolean;
  } = {},
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const { trustedSources = TRUSTED_SOURCES, requireIntegrity = false } = options;

  const enabledPlugins = plugins.filter((p) => p.enabled);
  const hasPlugins = enabledPlugins.length > 0;

  const allowlistConfigured = plugins.some(
    (p) => p.source === 'workspace' || p.source === 'bundled',
  );

  if (hasPlugins && !allowlistConfigured) {
    findings.push({
      id: 'plugins-no-allowlist',
      title: 'Plugins enabled without explicit allowlist',
      severity: 'high',
      category: 'plugin',
      description: `Found ${enabledPlugins.length} enabled plugin(s) but no explicit allowlist is configured.`,
      recommendation: 'Configure an explicit plugin allowlist with only trusted plugins.',
      metadata: { enabledCount: enabledPlugins.length },
    });
  }

  for (const plugin of plugins) {
    if (!plugin.enabled) continue;

    const trust = evaluatePluginTrust(plugin);

    if (trust.level === 'untrusted') {
      findings.push({
        id: `plugin-untrusted-${plugin.id}`,
        title: `Untrusted plugin: ${plugin.id}`,
        severity: 'high',
        category: 'plugin',
        description: `Plugin ${plugin.id} from ${plugin.source} source is not trusted. ${trust.warnings.join('; ')}`,
        recommendation: 'Review the plugin carefully. Consider removing or using a trusted alternative.',
        metadata: {
          pluginId: plugin.id,
          source: plugin.source,
          trustLevel: trust.level,
          warnings: trust.warnings,
        },
      });
    }

    if (trust.level === 'unknown') {
      findings.push({
        id: `plugin-unknown-${plugin.id}`,
        title: `Unknown plugin trust: ${plugin.id}`,
        severity: 'medium',
        category: 'plugin',
        description: `Plugin ${plugin.id} has unknown trust level. ${trust.warnings.join('; ')}`,
        recommendation: 'Verify the plugin source and integrity.',
        metadata: {
          pluginId: plugin.id,
          source: plugin.source,
          trustLevel: trust.level,
          warnings: trust.warnings,
        },
      });
    }

    if (requireIntegrity && !plugin.integrity && !trustedSources.includes(plugin.source)) {
      findings.push({
        id: `plugin-no-integrity-${plugin.id}`,
        title: `Plugin missing integrity checksum: ${plugin.id}`,
        severity: 'medium',
        category: 'plugin',
        description: `Plugin ${plugin.id} does not have an integrity checksum.`,
        recommendation: 'Ensure all non-bundled plugins have integrity checksums for supply chain security.',
        metadata: { pluginId: plugin.id, source: plugin.source },
      });
    }

    const highRiskPerms = plugin.permissions?.filter((p) => HIGH_RISK_PERMISSIONS.includes(p)) ?? [];
    if (highRiskPerms.length > 0 && trust.level !== 'trusted') {
      findings.push({
        id: `plugin-high-risk-perms-${plugin.id}`,
        title: `High-risk permissions on ${plugin.id}`,
        severity: 'high',
        category: 'plugin',
        description: `Plugin ${plugin.id} has high-risk permissions: ${highRiskPerms.join(', ')}`,
        recommendation: 'Review and minimize plugin permissions. Follow principle of least privilege.',
        metadata: { pluginId: plugin.id, permissions: highRiskPerms, trustLevel: trust.level },
      });
    }
  }

  logger.debug(`[Security:PluginTrust] Audited ${plugins.length} plugins, found ${findings.length} findings`);

  return findings;
}

export function isPluginTrusted(
  plugin: PluginInfo,
  minTrustLevel: PluginTrustLevel = 'verified',
): boolean {
  const trust = evaluatePluginTrust(plugin);
  const levelOrder: PluginTrustLevel[] = ['trusted', 'verified', 'unknown', 'untrusted'];
  return levelOrder.indexOf(trust.level) <= levelOrder.indexOf(minTrustLevel);
}

export function filterTrustedPlugins(
  plugins: PluginInfo[],
  minTrustLevel: PluginTrustLevel = 'verified',
): { trusted: PluginInfo[]; untrusted: PluginInfo[] } {
  const trusted: PluginInfo[] = [];
  const untrusted: PluginInfo[] = [];

  for (const plugin of plugins) {
    if (isPluginTrusted(plugin, minTrustLevel)) {
      trusted.push(plugin);
    } else {
      untrusted.push(plugin);
    }
  }

  return { trusted, untrusted };
}
