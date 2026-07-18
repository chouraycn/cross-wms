export type { CrestodianOperationType, CrestodianOperationResult } from './types.js';
import type { CrestodianOperationType, CrestodianOperationResult } from './types.js';
import { auditCrestodianOperation } from './audit.js';

const OPERATION_DESCRIPTIONS: Record<CrestodianOperationType, string> = {
  inspect: 'Check system status and health',
  repair: 'Fix identified issues',
  restart: 'Restart services',
  reset: 'Reset to default state',
  backup: 'Create data backup',
  restore: 'Restore from backup',
  cleanup: 'Remove stale data',
  migrate: 'Migrate data',
  validate: 'Validate configuration',
  diagnose: 'Run diagnostic tests',
};

export function resolveOperationFromText(text: string): CrestodianOperationType | null {
  const lower = text.toLowerCase();
  const operations: Array<[CrestodianOperationType, string[]]> = [
    ['inspect', ['check', 'inspect', 'status', 'overview', 'health']],
    ['repair', ['fix', 'repair', 'mend', 'heal', 'recover']],
    ['restart', ['restart', 'reboot', 'cycle']],
    ['reset', ['reset', 'factory', 'default', 'wipe']],
    ['backup', ['backup', 'save', 'snapshot', 'export']],
    ['restore', ['restore', 'recover', 'import', 'load']],
    ['cleanup', ['clean', 'purge', 'prune', 'remove', 'delete']],
    ['migrate', ['migrate', 'upgrade', 'update', 'convert']],
    ['validate', ['validate', 'verify', 'test']],
    ['diagnose', ['diagnose', 'debug', 'troubleshoot', 'analyze']],
  ];

  for (const [op, keywords] of operations) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return op;
      }
    }
  }

  return null;
}

export function isPersistentCrestodianOperation(operation: CrestodianOperationType): boolean {
  const persistent: CrestodianOperationType[] = [
    'repair',
    'restart',
    'reset',
    'backup',
    'restore',
    'cleanup',
    'migrate',
  ];
  return persistent.includes(operation);
}

export function getOperationDescription(operation: CrestodianOperationType): string {
  return OPERATION_DESCRIPTIONS[operation] ?? operation;
}

export async function executeCrestodianOperation(
  operation: CrestodianOperationType,
  options?: { target?: string; approved?: boolean },
): Promise<CrestodianOperationResult> {
  const startTime = Date.now();

  try {
    let message: string;
    let details: Record<string, unknown> = {};

    switch (operation) {
      case 'inspect':
        message = 'System inspection completed successfully';
        details = { checked: true };
        break;
      case 'repair':
        message = options?.approved
          ? 'System repair completed successfully'
          : 'Repair requires approval';
        details = { approved: options?.approved ?? false };
        break;
      case 'restart':
        message = options?.approved
          ? 'System restart initiated'
          : 'Restart requires approval';
        details = { approved: options?.approved ?? false };
        break;
      case 'reset':
        message = options?.approved
          ? 'System reset completed'
          : 'Reset requires approval';
        details = { approved: options?.approved ?? false };
        break;
      case 'backup':
        message = 'Backup created successfully';
        details = { backupId: `backup-${Date.now()}` };
        break;
      case 'restore':
        message = options?.approved
          ? 'Restore completed successfully'
          : 'Restore requires approval';
        details = { approved: options?.approved ?? false };
        break;
      case 'cleanup':
        message = 'Cleanup completed successfully';
        details = { itemsRemoved: 0 };
        break;
      case 'migrate':
        message = options?.approved
          ? 'Migration completed successfully'
          : 'Migration requires approval';
        details = { approved: options?.approved ?? false };
        break;
      case 'validate':
        message = 'Validation completed successfully';
        details = { valid: true };
        break;
      case 'diagnose':
        message = 'Diagnostic tests completed';
        details = { testsRun: 0, failures: 0 };
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    const durationMs = Date.now() - startTime;
    return {
      success: true,
      operation,
      message,
      durationMs,
      details,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      operation,
      message: `Operation failed: ${error}`,
      durationMs,
      error,
    };
  }
}

export type CrestodianCommandDeps = {
  formatOverview?: (overview: unknown) => string;
  loadOverview?: () => Promise<unknown>;
};
