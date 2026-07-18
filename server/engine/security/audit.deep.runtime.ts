import { logger } from '../../logger.js';
import type { SecurityFinding, SecuritySummary } from './types.js';
import { auditDeepCodeSafety, scanCodeForInjectionVectors, analyzeCodeImports } from './audit-deep-code-safety.js';
import { runExtraAsyncAudit } from './audit-extra.async.js';
import { runExtraSyncAudit } from './audit-extra.sync.js';

export type DeepAuditPhase = 'code-scan' | 'import-analysis' | 'injection-check' | 'async-audit' | 'sync-audit' | 'complete';

export type DeepAuditProgress = {
  phase: DeepAuditPhase;
  percentage: number;
  currentTask: string;
  findingsCount: number;
};

export type DeepAuditResult = {
  findings: SecurityFinding[];
  summary: SecuritySummary;
  progress: DeepAuditProgress;
  durationMs: number;
  phasesCompleted: number;
  totalPhases: number;
};

export type DeepAuditConfig = {
  skipCodeScan?: boolean;
  skipImportAnalysis?: boolean;
  skipInjectionCheck?: boolean;
  skipAsyncAudit?: boolean;
  skipSyncAudit?: boolean;
  maxCodeLines?: number;
  timeoutMs?: number;
};

const DEFAULT_CONFIG: DeepAuditConfig = {
  skipCodeScan: false,
  skipImportAnalysis: false,
  skipInjectionCheck: false,
  skipAsyncAudit: false,
  skipSyncAudit: false,
  maxCodeLines: 100000,
  timeoutMs: 60000,
};

let currentConfig = DEFAULT_CONFIG;

export function getDeepAuditConfig(): DeepAuditConfig {
  return { ...currentConfig };
}

export function setDeepAuditConfig(config: Partial<DeepAuditConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  logger.debug(`[Security:DeepAudit] Updated config: ${JSON.stringify(currentConfig)}`);
}

export async function runDeepAudit(
  code?: string,
  config?: Partial<DeepAuditConfig>,
): Promise<DeepAuditResult> {
  const effectiveConfig = { ...currentConfig, ...(config || {}) };
  const startTime = Date.now();
  const findings: SecurityFinding[] = [];
  let phasesCompleted = 0;
  const totalPhases = 5;

  const updateProgress = (phase: DeepAuditPhase, percentage: number, currentTask: string): DeepAuditProgress => ({
    phase,
    percentage,
    currentTask,
    findingsCount: findings.length,
  });

  let progress = updateProgress('code-scan', 0, 'Starting deep audit');

  if (!effectiveConfig.skipCodeScan && code) {
    progress = updateProgress('code-scan', 10, 'Scanning code for dangerous patterns');
    logger.debug('[Security:DeepAudit] Running deep code safety audit');

    const codeLines = code.split('\n').length;
    if (codeLines > effectiveConfig.maxCodeLines!) {
      findings.push({
        id: 'deep-audit-code-too-large',
        title: 'Code exceeds maximum lines for deep audit',
        severity: 'info',
        category: 'config',
        description: `Code has ${codeLines} lines, max allowed is ${effectiveConfig.maxCodeLines}`,
        recommendation: 'Consider splitting code into smaller modules for audit',
        metadata: { codeLines, maxLines: effectiveConfig.maxCodeLines },
      });
    } else {
      const codeFindings = await Promise.race([
        Promise.resolve(auditDeepCodeSafety(code)),
        new Promise<SecurityFinding[]>((_, reject) =>
          setTimeout(() => reject(new Error('Code scan timed out')), effectiveConfig.timeoutMs!),
        ),
      ]);
      findings.push(...codeFindings);
    }
    phasesCompleted++;
  }

  if (!effectiveConfig.skipImportAnalysis && code) {
    progress = updateProgress('import-analysis', 30, 'Analyzing imports');
    logger.debug('[Security:DeepAudit] Running import analysis');

    const importFindings = await Promise.race([
      Promise.resolve(analyzeCodeImports(code)),
      new Promise<SecurityFinding[]>((_, reject) =>
        setTimeout(() => reject(new Error('Import analysis timed out')), effectiveConfig.timeoutMs!),
      ),
    ]);
    findings.push(...importFindings);
    phasesCompleted++;
  }

  if (!effectiveConfig.skipInjectionCheck && code) {
    progress = updateProgress('injection-check', 50, 'Checking for injection vectors');
    logger.debug('[Security:DeepAudit] Running injection check');

    const injectionFindings = await Promise.race([
      Promise.resolve(scanCodeForInjectionVectors(code)),
      new Promise<SecurityFinding[]>((_, reject) =>
        setTimeout(() => reject(new Error('Injection check timed out')), effectiveConfig.timeoutMs!),
      ),
    ]);
    findings.push(...injectionFindings);
    phasesCompleted++;
  }

  if (!effectiveConfig.skipAsyncAudit) {
    progress = updateProgress('async-audit', 70, 'Running async audits');
    logger.debug('[Security:DeepAudit] Running async extra audits');

    try {
      const asyncFindings = await runExtraAsyncAudit();
      findings.push(...asyncFindings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Security:DeepAudit] Async audit failed: ${errorMessage}`);
      findings.push({
        id: 'deep-audit-async-failed',
        title: 'Async deep audit failed',
        severity: 'medium',
        category: 'config',
        description: `Async audit phase failed: ${errorMessage}`,
        recommendation: 'Check async audit dependencies',
        metadata: { error: errorMessage },
      });
    }
    phasesCompleted++;
  }

  if (!effectiveConfig.skipSyncAudit) {
    progress = updateProgress('sync-audit', 90, 'Running sync audits');
    logger.debug('[Security:DeepAudit] Running sync extra audits');

    try {
      const syncFindings = runExtraSyncAudit();
      findings.push(...syncFindings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Security:DeepAudit] Sync audit failed: ${errorMessage}`);
      findings.push({
        id: 'deep-audit-sync-failed',
        title: 'Sync deep audit failed',
        severity: 'medium',
        category: 'config',
        description: `Sync audit phase failed: ${errorMessage}`,
        recommendation: 'Check sync audit dependencies',
        metadata: { error: errorMessage },
      });
    }
    phasesCompleted++;
  }

  progress = updateProgress('complete', 100, 'Deep audit complete');

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
    `[Security:DeepAudit] Completed in ${durationMs}ms: ${summary.total} findings (${summary.critical} critical, ${summary.high} high, ${summary.medium} medium)`,
  );

  return {
    findings,
    summary,
    progress,
    durationMs,
    phasesCompleted,
    totalPhases,
  };
}

export async function runDeepAuditOnFiles(filePaths: string[], config?: Partial<DeepAuditConfig>): Promise<DeepAuditResult> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const findings: SecurityFinding[] = [];
  const startTime = Date.now();

  logger.debug(`[Security:DeepAudit] Auditing ${filePaths.length} files`);

  for (const filePath of filePaths) {
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      const fileFindings = await runDeepAudit(code, config);
      fileFindings.findings.forEach(f => {
        f.metadata = { ...f.metadata, filePath: path.basename(filePath) };
        findings.push(f);
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`[Security:DeepAudit] Failed to read file ${filePath}: ${errorMessage}`);
      findings.push({
        id: `deep-audit-file-error-${filePath}`,
        title: `Failed to audit file: ${path.basename(filePath)}`,
        severity: 'low',
        category: 'filesystem',
        description: `Unable to read file for deep audit: ${errorMessage}`,
        recommendation: 'Check file permissions and existence',
        metadata: { filePath, error: errorMessage },
      });
    }
  }

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
    `[Security:DeepAudit] File audit completed in ${durationMs}ms: ${summary.total} findings`,
  );

  return {
    findings,
    summary,
    progress: { phase: 'complete', percentage: 100, currentTask: 'File audit complete', findingsCount: findings.length },
    durationMs,
    phasesCompleted: 1,
    totalPhases: 1,
  };
}

export function getDeepAuditPhaseOrder(): DeepAuditPhase[] {
  return ['code-scan', 'import-analysis', 'injection-check', 'async-audit', 'sync-audit', 'complete'];
}