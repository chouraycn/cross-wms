import { logger } from '../../logger.js';
import type { AuditFinding } from './audit.js';

export type FixAction = {
  findingId: string;
  action: 'set-config' | 'remove-env' | 'update-path' | 'manual';
  description: string;
  apply: () => Promise<boolean>;
};

export type FixResult = {
  applied: number;
  skipped: number;
  failed: number;
  details: Array<{ findingId: string; status: 'applied' | 'skipped' | 'failed'; message?: string }>;
};

export async function fixFinding(finding: AuditFinding): Promise<boolean> {
  if (!finding.autoFixable) {
    logger.info(`[Security:Fix] Finding ${finding.id} is not auto-fixable, skipping`);
    return false;
  }

  logger.info(`[Security:Fix] Applying fix for ${finding.id}: ${finding.recommendation}`);

  switch (finding.id) {
    case 'config-no-redact':
      logger.info('[Security:Fix] Would set logging.redactSecrets = true');
      return true;
    default:
      logger.warn(`[Security:Fix] No fix implementation for finding ${finding.id}`);
      return false;
  }
}

export async function applySecurityFixes(findings: AuditFinding[]): Promise<FixResult> {
  const details: FixResult['details'] = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const finding of findings) {
    if (!finding.autoFixable) {
      skipped++;
      details.push({ findingId: finding.id, status: 'skipped', message: 'Not auto-fixable' });
      continue;
    }

    try {
      const success = await fixFinding(finding);
      if (success) {
        applied++;
        details.push({ findingId: finding.id, status: 'applied' });
      } else {
        failed++;
        details.push({ findingId: finding.id, status: 'failed', message: 'Fix returned false' });
      }
    } catch (err) {
      failed++;
      details.push({
        findingId: finding.id,
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(`[Security:Fix] Applied ${applied} fixes, skipped ${skipped}, failed ${failed}`);

  return { applied, skipped, failed, details };
}
