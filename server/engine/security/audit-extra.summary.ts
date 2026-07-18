import { logger } from '../../logger.js';
import type { SecurityFinding, SecurityLevel, SecuritySummary } from './types.js';
import { runExtraSyncAudit } from './audit-extra.sync.js';
import { runExtraAsyncAudit } from './audit-extra.async.js';

export type ExtraAuditSummary = {
  syncFindings: SecurityFinding[];
  asyncFindings: SecurityFinding[];
  allFindings: SecurityFinding[];
  syncSummary: SecuritySummary;
  asyncSummary: SecuritySummary;
  combinedSummary: SecuritySummary;
  duration: {
    sync: number;
    async: number;
    total: number;
  };
};

function calculateSummary(findings: SecurityFinding[]): SecuritySummary {
  return {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    info: findings.filter((f) => f.severity === 'info').length,
    total: findings.length,
  };
}

function sortFindingsBySeverity(findings: SecurityFinding[]): SecurityFinding[] {
  const severityOrder: SecurityLevel[] = ['critical', 'high', 'medium', 'low', 'info'];
  return [...findings].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));
}

function deduplicateFindings(findings: SecurityFinding[]): SecurityFinding[] {
  const seen = new Set<string>();
  const unique: SecurityFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.id}-${finding.title}-${finding.severity}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(finding);
    }
  }

  return unique;
}

export async function runFullExtraAudit(context?: {
  config?: Record<string, unknown>;
  rootDir?: string;
  envVars?: Record<string, string>;
  packageJson?: Record<string, unknown>;
  files?: string[];
}): Promise<ExtraAuditSummary> {
  const startTime = Date.now();

  const syncStart = Date.now();
  const syncFindings = runExtraSyncAudit({
    config: context?.config,
    envVars: context?.envVars,
    packageJson: context?.packageJson,
    files: context?.files,
  });
  const syncDuration = Date.now() - syncStart;

  const asyncStart = Date.now();
  const asyncFindings = await runExtraAsyncAudit({
    config: context?.config,
    rootDir: context?.rootDir,
  });
  const asyncDuration = Date.now() - asyncStart;

  const allFindings = deduplicateFindings([...syncFindings, ...asyncFindings]);
  const sortedFindings = sortFindingsBySeverity(allFindings);

  const summary: ExtraAuditSummary = {
    syncFindings,
    asyncFindings,
    allFindings: sortedFindings,
    syncSummary: calculateSummary(syncFindings),
    asyncSummary: calculateSummary(asyncFindings),
    combinedSummary: calculateSummary(sortedFindings),
    duration: {
      sync: syncDuration,
      async: asyncDuration,
      total: Date.now() - startTime,
    },
  };

  logger.info(
    `[Security:ExtraAudit] Completed extra audit: ${summary.combinedSummary.total} findings (${summary.combinedSummary.critical} critical, ${summary.combinedSummary.high} high) in ${summary.duration.total}ms`,
  );

  return summary;
}

export function formatExtraAuditSummary(summary: ExtraAuditSummary): string {
  const lines: string[] = [];

  lines.push('=== Extra Security Audit Summary ===');
  lines.push('');
  lines.push(`Total Findings: ${summary.combinedSummary.total}`);
  lines.push(`  Critical: ${summary.combinedSummary.critical}`);
  lines.push(`  High: ${summary.combinedSummary.high}`);
  lines.push(`  Medium: ${summary.combinedSummary.medium}`);
  lines.push(`  Low: ${summary.combinedSummary.low}`);
  lines.push(`  Info: ${summary.combinedSummary.info}`);
  lines.push('');
  lines.push('--- Breakdown ---');
  lines.push(`Sync Checks: ${summary.syncSummary.total} findings (${summary.duration.sync}ms)`);
  lines.push(`Async Checks: ${summary.asyncSummary.total} findings (${summary.duration.async}ms)`);
  lines.push(`Total Duration: ${summary.duration.total}ms`);
  lines.push('');

  if (summary.allFindings.length > 0) {
    lines.push('--- Critical Findings ---');
    const critical = summary.allFindings.filter((f) => f.severity === 'critical');
    for (const finding of critical) {
      lines.push(`  [CRITICAL] ${finding.title}`);
      lines.push(`            ${finding.description}`);
      lines.push(`            Recommendation: ${finding.recommendation}`);
    }

    lines.push('');
    lines.push('--- High Severity Findings ---');
    const high = summary.allFindings.filter((f) => f.severity === 'high');
    for (const finding of high) {
      lines.push(`  [HIGH] ${finding.title}`);
    }
  }

  return lines.join('\n');
}

export function getExtraAuditSummaryByCategory(summary: ExtraAuditSummary): Record<string, SecuritySummary> {
  const categories = new Set(summary.allFindings.map((f) => f.category));
  const result: Record<string, SecuritySummary> = {};

  for (const category of categories) {
    const categoryFindings = summary.allFindings.filter((f) => f.category === category);
    result[category] = calculateSummary(categoryFindings);
  }

  return result;
}

export function getExtraAuditPassStatus(summary: ExtraAuditSummary, options?: {
  allowCritical?: boolean;
  allowHigh?: boolean;
}): {
  passed: boolean;
  failedCategories: string[];
  reason?: string;
} {
  const { allowCritical = false, allowHigh = false } = options ?? {};
  const { combinedSummary } = summary;

  const failedCategories: string[] = [];

  if (combinedSummary.critical > 0 && !allowCritical) {
    failedCategories.push('critical');
  }

  if (combinedSummary.high > 0 && !allowHigh) {
    failedCategories.push('high');
  }

  const passed = failedCategories.length === 0;

  return {
    passed,
    failedCategories,
    reason: passed ? undefined : `Failed due to ${failedCategories.join(', ')} severity findings`,
  };
}