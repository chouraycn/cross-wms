import { z } from 'zod';
import type {
  CrestodianAssistantPlan,
  CrestodianOperationType,
  CrestodianOverview,
} from './types.js';
import {
  buildCrestodianAssistantUserPrompt,
  parseCrestodianAssistantPlanText,
  CRESTODIAN_ASSISTANT_SYSTEM_PROMPT,
} from './assistant-prompts.js';

export type { CrestodianAssistantPlan } from './types.js';
export { buildCrestodianAssistantUserPrompt, parseCrestodianAssistantPlanText };

export type CrestodianAssistantPlanner = (params: {
  input: string;
  overview: CrestodianOverview;
}) => Promise<CrestodianAssistantPlan | null>;

const KNOWN_OPERATIONS: CrestodianOperationType[] = [
  'inspect',
  'repair',
  'restart',
  'reset',
  'backup',
  'restore',
  'cleanup',
  'migrate',
  'validate',
  'diagnose',
];

const OPERATION_KEYWORDS: Record<CrestodianOperationType, string[]> = {
  inspect: ['check', 'inspect', 'status', 'overview', 'health', 'diagnose'],
  repair: ['fix', 'repair', 'mend', 'heal', 'recover'],
  restart: ['restart', 'reboot', 'reset', 'cycle'],
  reset: ['reset', 'factory', 'default', 'wipe'],
  backup: ['backup', 'save', 'snapshot', 'export'],
  restore: ['restore', 'recover', 'import', 'load'],
  cleanup: ['clean', 'purge', 'prune', 'remove', 'delete'],
  migrate: ['migrate', 'upgrade', 'update', 'convert'],
  validate: ['validate', 'verify', 'check', 'test'],
  diagnose: ['diagnose', 'debug', 'troubleshoot', 'analyze'],
};

function detectOperation(input: string): {
  operation: CrestodianOperationType;
  confidence: number;
} | null {
  const lower = input.toLowerCase();
  let bestMatch: { operation: CrestodianOperationType; score: number } | null = null;

  for (const [op, keywords] of Object.entries(OPERATION_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        score += keyword.length / lower.length;
      }
    }
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { operation: op as CrestodianOperationType, score };
    }
  }

  if (bestMatch) {
    return {
      operation: bestMatch.operation,
      confidence: Math.min(0.9, bestMatch.score * 5),
    };
  }

  return null;
}

function extractTarget(input: string): string | undefined {
  const patterns = [
    /(?:for|on|with|about|regarding)\s+(\S+)/i,
    /^(\S+)\s+(?:needs|has|is|should)/i,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function generateSteps(operation: CrestodianOperationType, target?: string): string[] {
  const steps: Record<CrestodianOperationType, string[]> = {
    inspect: [
      'Collect system overview information',
      'Run all health probes',
      'Analyze probe results',
      'Generate status report',
    ],
    repair: [
      'Identify failing components',
      'Determine root cause',
      'Apply repair actions',
      'Verify fix with probes',
    ],
    restart: [
      'Gracefully shutdown services',
      'Restart core components',
      'Verify service health',
      'Confirm normal operation',
    ],
    reset: [
      'Backup current configuration',
      'Reset to defaults',
      'Apply minimal configuration',
      'Verify reset completed',
    ],
    backup: [
      'Identify data to backup',
      'Create backup archive',
      'Verify backup integrity',
      'Store backup safely',
    ],
    restore: [
      'Select backup to restore',
      'Validate backup file',
      'Restore data from backup',
      'Verify restored data',
    ],
    cleanup: [
      'Identify cleanup targets',
      'Remove stale data',
      'Compact databases',
      'Verify cleanup results',
    ],
    migrate: [
      'Backup current state',
      'Run migration scripts',
      'Validate migrated data',
      'Confirm migration success',
    ],
    validate: [
      'Check configuration syntax',
      'Verify required permissions',
      'Test connectivity',
      'Report validation results',
    ],
    diagnose: [
      'Collect diagnostic data',
      'Analyze error patterns',
      'Run diagnostic probes',
      'Generate diagnostic report',
    ],
  };
  return steps[operation] ?? ['Perform operation', 'Verify results'];
}

function generateRisks(operation: CrestodianOperationType): string[] {
  const risks: Record<CrestodianOperationType, string[]> = {
    inspect: ['Minimal risk - read-only operation'],
    repair: ['Possible service interruption', 'Configuration changes may be required'],
    restart: ['Service downtime during restart', 'Temporary data unavailability'],
    reset: ['Data loss - ensure backup exists', 'Configuration will be lost'],
    backup: ['Minimal risk - read with storage'],
    restore: ['Data overwrite risk', 'Downtime during restore'],
    cleanup: ['Accidental data deletion', 'Service interruption'],
    migrate: ['Data corruption risk', 'Downtime during migration'],
    validate: ['Minimal risk - read-only operation'],
    diagnose: ['Minimal risk - read-only operation'],
  };
  return risks[operation] ?? ['Unknown risk'];
}

export async function planCrestodianCommand(params: {
  input: string;
  overview: CrestodianOverview;
}): Promise<CrestodianAssistantPlan | null> {
  const input = params.input.trim();
  if (!input) {
    return null;
  }

  const detected = detectOperation(input);
  if (!detected) {
    return null;
  }

  const target = extractTarget(input);
  const steps = generateSteps(detected.operation, target);
  const risks = generateRisks(detected.operation);

  return {
    operation: detected.operation,
    target,
    reason: `Detected ${detected.operation} operation from user input`,
    confidence: detected.confidence,
    steps,
    risks,
  };
}

export function formatAssistantPlan(plan: CrestodianAssistantPlan): string {
  const lines: string[] = [];
  lines.push(`Operation: ${plan.operation}`);
  if (plan.target) {
    lines.push(`Target: ${plan.target}`);
  }
  lines.push(`Confidence: ${Math.round(plan.confidence * 100)}%`);
  lines.push('');
  lines.push('Steps:');
  plan.steps.forEach((step, i) => {
    lines.push(`  ${i + 1}. ${step}`);
  });
  lines.push('');
  lines.push('Risks:');
  plan.risks.forEach((risk) => {
    lines.push(`  - ${risk}`);
  });
  return lines.join('\n');
}
