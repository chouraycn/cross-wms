import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type InstalledPluginDir = {
  id: string;
  name: string;
  version: string;
  installPath: string;
  source: 'bundled' | 'workspace' | 'npm' | 'git' | 'clawhub' | 'upload' | 'unknown';
  installedAt: number;
  updatedAt: number;
  hasManifest: boolean;
  hasIntegrity: boolean;
  permissions: string[];
  dependencies: string[];
  main?: string;
  author?: string;
  homepage?: string;
};

export type PluginDirSecurityCheck = {
  safe: boolean;
  risk?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  findings: SecurityFinding[];
};

const DANGEROUS_PLUGIN_PATHS = [
  /^\/root\//,
  /^\/etc\//,
  /^\/proc\//,
  /^\/sys\//,
  /^\/dev\//,
];

const SUSPICIOUS_FILE_PATTERNS = [
  { pattern: /\.sh$/, label: 'shell script', severity: 'high' as const },
  { pattern: /\.py$/, label: 'Python script', severity: 'medium' as const },
  { pattern: /\.js$/, label: 'JavaScript file', severity: 'low' as const },
  { pattern: /\.exe$/, label: 'executable', severity: 'critical' as const },
  { pattern: /\.bat$/, label: 'batch file', severity: 'high' as const },
  { pattern: /\.cmd$/, label: 'command file', severity: 'high' as const },
];

export async function scanPluginDirectory(pluginDir: string): Promise<InstalledPluginDir | null> {
  try {
    const stat = await fs.stat(pluginDir);
    if (!stat.isDirectory()) {
      return null;
    }

    const manifestPath = path.join(pluginDir, 'manifest.json');
    const packageJsonPath = path.join(pluginDir, 'package.json');
    const integrityPath = path.join(pluginDir, '.integrity');

    let manifestContent: Record<string, unknown> | undefined;
    let packageContent: Record<string, unknown> | undefined;

    try {
      manifestContent = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch {
      try {
        packageContent = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      } catch {
        logger.debug(`[Security:PluginDir] No manifest or package.json found in ${pluginDir}`);
      }
    }

    const hasIntegrity = await fs.stat(integrityPath).then(() => true).catch(() => false);

    const id = (manifestContent?.['id'] as string) || (packageContent?.['name'] as string) || path.basename(pluginDir);
    const name = (manifestContent?.['name'] as string) || (packageContent?.['name'] as string) || id;
    const version = (manifestContent?.['version'] as string) || (packageContent?.['version'] as string) || '0.0.0';
    const source = (manifestContent?.['source'] as string) || 'unknown';
    const permissions = (manifestContent?.['permissions'] as string[]) || [];
    const dependencies = packageContent ? Object.keys(packageContent['dependencies'] as Record<string, string> || {}) : [];
    const main = (packageContent?.['main'] as string) || (manifestContent?.['main'] as string);
    const author = (packageContent?.['author'] as string) || (manifestContent?.['author'] as string);
    const homepage = (packageContent?.['homepage'] as string) || (manifestContent?.['homepage'] as string);

    return {
      id,
      name,
      version,
      installPath: pluginDir,
      source: source as InstalledPluginDir['source'],
      installedAt: stat.birthtime.getTime(),
      updatedAt: stat.mtime.getTime(),
      hasManifest: !!manifestContent,
      hasIntegrity,
      permissions,
      dependencies,
      main,
      author,
      homepage,
    };
  } catch (err) {
    logger.debug(`[Security:PluginDir] Error scanning directory ${pluginDir}:`, err);
    return null;
  }
}

export async function auditPluginDirectory(plugin: InstalledPluginDir): Promise<PluginDirSecurityCheck> {
  const findings: SecurityFinding[] = [];

  for (const pattern of DANGEROUS_PLUGIN_PATHS) {
    if (pattern.test(plugin.installPath)) {
      findings.push({
        id: `plugin-dir-dangerous-path-${plugin.id}`,
        title: `Plugin installed in dangerous directory`,
        severity: 'critical',
        category: 'filesystem',
        description: `Plugin "${plugin.name}" is installed in a dangerous directory: ${plugin.installPath}`,
        recommendation: 'Move the plugin to a safe installation directory.',
        metadata: { pluginId: plugin.id, installPath: plugin.installPath },
      });
      break;
    }
  }

  if (!plugin.hasManifest) {
    findings.push({
      id: `plugin-dir-no-manifest-${plugin.id}`,
      title: `Plugin missing manifest`,
      severity: 'medium',
      category: 'plugin',
      description: `Plugin "${plugin.name}" does not have a manifest.json file.`,
      recommendation: 'Add a manifest.json with plugin metadata and permissions.',
      metadata: { pluginId: plugin.id, installPath: plugin.installPath },
    });
  }

  if (!plugin.hasIntegrity && plugin.source !== 'bundled' && plugin.source !== 'workspace') {
    findings.push({
      id: `plugin-dir-no-integrity-${plugin.id}`,
      title: `Plugin missing integrity checksum`,
      severity: 'medium',
      category: 'plugin',
      description: `Plugin "${plugin.name}" from ${plugin.source} source does not have an integrity checksum.`,
      recommendation: 'Add integrity checksum for supply chain security.',
      metadata: { pluginId: plugin.id, source: plugin.source },
    });
  }

  if (plugin.version === '0.0.0' || !plugin.version) {
    findings.push({
      id: `plugin-dir-no-version-${plugin.id}`,
      title: `Plugin version not specified`,
      severity: 'medium',
      category: 'plugin',
      description: `Plugin "${plugin.name}" does not specify a version.`,
      recommendation: 'Specify a version for reproducibility.',
      metadata: { pluginId: plugin.id },
    });
  }

  const highRiskPerms = plugin.permissions.filter((p) => ['exec', 'shell', 'fs_write', 'fs_delete', 'spawn'].includes(p));
  if (highRiskPerms.length > 0) {
    findings.push({
      id: `plugin-dir-high-risk-perms-${plugin.id}`,
      title: `Plugin has high-risk permissions`,
      severity: 'high',
      category: 'plugin',
      description: `Plugin "${plugin.name}" has high-risk permissions: ${highRiskPerms.join(', ')}`,
      recommendation: 'Review and minimize plugin permissions.',
      metadata: { pluginId: plugin.id, permissions: highRiskPerms },
    });
  }

  try {
    const entries = await fs.readdir(plugin.installPath);
    for (const entry of entries) {
      for (const { pattern, label, severity } of SUSPICIOUS_FILE_PATTERNS) {
        if (pattern.test(entry)) {
          findings.push({
            id: `plugin-dir-suspicious-file-${plugin.id}-${entry}`,
            title: `Suspicious file in plugin directory: ${entry}`,
            severity,
            category: 'filesystem',
            description: `Found ${label} "${entry}" in plugin "${plugin.name}" directory.`,
            recommendation: 'Review the file to ensure it is safe and necessary.',
            metadata: { pluginId: plugin.id, fileName: entry, fileType: label },
          });
          break;
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  const isSafe = findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length === 0;
  const risk = findings.length > 0
    ? findings.reduce<SecurityFinding['severity']>((prev, curr) => {
        const order: SecurityFinding['severity'][] = ['info', 'low', 'medium', 'high', 'critical'];
        return order.indexOf(curr.severity) > order.indexOf(prev) ? curr.severity : prev;
      }, 'low')
    : undefined;

  logger.debug(`[Security:PluginDir] Audited plugin ${plugin.id}, safe=${isSafe}, findings=${findings.length}`);

  return { safe: isSafe, risk, findings };
}

export async function findInstalledPlugins(baseDir: string): Promise<InstalledPluginDir[]> {
  const plugins: InstalledPluginDir[] = [];

  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      const pluginPath = path.join(baseDir, entry.name);
      const plugin = await scanPluginDirectory(pluginPath);

      if (plugin) {
        plugins.push(plugin);
      }
    }
  } catch (err) {
    logger.debug(`[Security:PluginDir] Error finding plugins in ${baseDir}:`, err);
  }

  logger.debug(`[Security:PluginDir] Found ${plugins.length} plugins in ${baseDir}`);

  return plugins;
}

export async function auditAllInstalledPlugins(baseDir: string): Promise<{
  plugins: InstalledPluginDir[];
  securityChecks: Map<string, PluginDirSecurityCheck>;
  summary: {
    total: number;
    safe: number;
    unsafe: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}> {
  const plugins = await findInstalledPlugins(baseDir);
  const securityChecks = new Map<string, PluginDirSecurityCheck>();
  const summary = {
    total: plugins.length,
    safe: 0,
    unsafe: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const plugin of plugins) {
    const check = await auditPluginDirectory(plugin);
    securityChecks.set(plugin.id, check);

    if (check.safe) {
      summary.safe++;
    } else {
      summary.unsafe++;
    }

    for (const finding of check.findings) {
      if (finding.severity in summary) {
        (summary as Record<string, number>)[finding.severity]++;
      }
    }
  }

  logger.info(`[Security:PluginDir] Audited ${plugins.length} plugins: ${summary.safe} safe, ${summary.unsafe} unsafe`);

  return { plugins, securityChecks, summary };
}