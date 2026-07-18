import { logger } from '../../logger.js';
import type { SecurityFinding, SecuritySummary } from './types.js';
import { runSecurityAudit } from './audit.js';
import { auditConfigSecurity } from './dangerous-config-flags.js';
import { auditPluginsTrust } from './audit-plugins-trust.js';
import { auditModelReferences } from './audit-model-refs.js';
import { auditDirectoryPermissions } from './audit-fs.js';

export type NonDeepAuditCategory = 'config' | 'plugin' | 'model' | 'filesystem' | 'environment' | 'network';

export type NonDeepAuditProgress = {
  category: NonDeepAuditCategory;
  percentage: number;
  currentTask: string;
  findingsCount: number;
};

export type NonDeepAuditResult = {
  findings: SecurityFinding[];
  summary: SecuritySummary;
  progress: NonDeepAuditProgress;
  durationMs: number;
  categoriesCompleted: number;
  totalCategories: number;
};

export type NonDeepAuditConfig = {
  skipConfig?: boolean;
  skipPlugin?: boolean;
  skipModel?: boolean;
  skipFilesystem?: boolean;
  skipEnvironment?: boolean;
  skipNetwork?: boolean;
  timeoutMs?: number;
  auditPaths?: string[];
};

const DEFAULT_CONFIG: NonDeepAuditConfig = {
  skipConfig: false,
  skipPlugin: false,
  skipModel: false,
  skipFilesystem: false,
  skipEnvironment: false,
  skipNetwork: false,
  timeoutMs: 15000,
  auditPaths: [],
};

let currentConfig = DEFAULT_CONFIG;

export function getNonDeepAuditConfig(): NonDeepAuditConfig {
  return { ...currentConfig };
}

export function setNonDeepAuditConfig(config: Partial<NonDeepAuditConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  logger.debug(`[Security:NonDeepAudit] Updated config: ${JSON.stringify(currentConfig)}`);
}

export async function runNonDeepAudit(config?: Partial<NonDeepAuditConfig>): Promise<NonDeepAuditResult> {
  const effectiveConfig = { ...currentConfig, ...(config || {}) };
  const startTime = Date.now();
  const findings: SecurityFinding[] = [];
  let categoriesCompleted = 0;
  const totalCategories = 6;

  const updateProgress = (category: NonDeepAuditCategory, percentage: number, currentTask: string): NonDeepAuditProgress => ({
    category,
    percentage,
    currentTask,
    findingsCount: findings.length,
  });

  let progress = updateProgress('config', 0, 'Starting non-deep audit');

  if (!effectiveConfig.skipConfig) {
    progress = updateProgress('config', 10, 'Auditing configuration');
    logger.debug('[Security:NonDeepAudit] Running config audit');

    try {
      const configFindings = auditConfigSecurity({});
      findings.push(...configFindings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Security:NonDeepAudit] Config audit failed: ${errorMessage}`);
      findings.push({
        id: 'non-deep-config-failed',
        title: 'Config audit failed',
        severity: 'medium',
        category: 'config',
        description: `Config audit failed: ${errorMessage}`,
        recommendation: 'Check configuration files',
        metadata: { error: errorMessage },
      });
    }
    categoriesCompleted++;
  }

  if (!effectiveConfig.skipPlugin) {
    progress = updateProgress('plugin', 25, 'Auditing plugins');
    logger.debug('[Security:NonDeepAudit] Running plugin audit');

    try {
      const pluginFindings = auditPluginsTrust([]);
      findings.push(...pluginFindings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Security:NonDeepAudit] Plugin audit failed: ${errorMessage}`);
      findings.push({
        id: 'non-deep-plugin-failed',
        title: 'Plugin audit failed',
        severity: 'medium',
        category: 'plugin',
        description: `Plugin audit failed: ${errorMessage}`,
        recommendation: 'Check plugin configuration',
        metadata: { error: errorMessage },
      });
    }
    categoriesCompleted++;
  }

  if (!effectiveConfig.skipModel) {
    progress = updateProgress('model', 40, 'Auditing model references');
    logger.debug('[Security:NonDeepAudit] Running model reference audit');

    try {
      const modelFindings = auditModelReferences({ models: [] });
      findings.push(...modelFindings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Security:NonDeepAudit] Model audit failed: ${errorMessage}`);
      findings.push({
        id: 'non-deep-model-failed',
        title: 'Model reference audit failed',
        severity: 'medium',
        category: 'config',
        description: `Model audit failed: ${errorMessage}`,
        recommendation: 'Check model configuration',
        metadata: { error: errorMessage },
      });
    }
    categoriesCompleted++;
  }

  if (!effectiveConfig.skipFilesystem) {
    progress = updateProgress('filesystem', 55, 'Auditing filesystem');
    logger.debug('[Security:NonDeepAudit] Running filesystem audit');

    try {
      const configuredPaths = effectiveConfig.auditPaths ?? [];
      const pathsToAudit: string[] = configuredPaths.length > 0 ? configuredPaths : [process.cwd()];
      for (const auditPath of pathsToAudit) {
        const fsFindings = await auditDirectoryPermissions(auditPath, { recursive: true, maxDepth: 2 });
        findings.push(...fsFindings);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Security:NonDeepAudit] Filesystem audit failed: ${errorMessage}`);
      findings.push({
        id: 'non-deep-filesystem-failed',
        title: 'Filesystem audit failed',
        severity: 'medium',
        category: 'filesystem',
        description: `Filesystem audit failed: ${errorMessage}`,
        recommendation: 'Check file permissions',
        metadata: { error: errorMessage },
      });
    }
    categoriesCompleted++;
  }

  if (!effectiveConfig.skipEnvironment) {
    progress = updateProgress('environment', 75, 'Auditing environment');
    logger.debug('[Security:NonDeepAudit] Running environment audit');

    try {
      const envVars = Object.keys(process.env).filter(
        k => k.includes('API') || k.includes('TOKEN') || k.includes('KEY') || k.includes('PASSWORD'),
      );
      const envAudit = await runSecurityAudit({ envVars });
      findings.push(...envAudit.findings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Security:NonDeepAudit] Environment audit failed: ${errorMessage}`);
    }
    categoriesCompleted++;
  }

  if (!effectiveConfig.skipNetwork) {
    progress = updateProgress('network', 90, 'Auditing network');
    logger.debug('[Security:NonDeepAudit] Running network audit');

    try {
      const networkAudit = await runSecurityAudit({ networkEndpoints: [] });
      findings.push(...networkAudit.findings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Security:NonDeepAudit] Network audit failed: ${errorMessage}`);
    }
    categoriesCompleted++;
  }

  progress = updateProgress('config', 100, 'Non-deep audit complete');

  const summary: SecuritySummary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
    total: findings.length,
  };

  const durationMs = Date.now() - startTime;

  logger.info(
    `[Security:NonDeepAudit] Completed in ${durationMs}ms: ${summary.total} findings (${summary.critical} critical, ${summary.high} high)`,
  );

  return {
    findings,
    summary,
    progress,
    durationMs,
    categoriesCompleted,
    totalCategories,
  };
}

export async function runQuickNonDeepAudit(): Promise<NonDeepAuditResult> {
  logger.debug('[Security:NonDeepAudit] Running quick non-deep audit');
  return runNonDeepAudit({
    skipEnvironment: true,
    skipNetwork: true,
    auditPaths: [],
  });
}

export function getNonDeepAuditCategoryOrder(): NonDeepAuditCategory[] {
  return ['config', 'plugin', 'model', 'filesystem', 'environment', 'network'];
}