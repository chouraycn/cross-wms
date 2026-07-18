import { z } from 'zod';
export type { CrestodianRescuePolicy } from './types.js';
import type { CrestodianRescuePolicy, CrestodianSeverity, CrestodianOperationType } from './types.js';

export const rescuePolicySchema = z.object({
  enabled: z.boolean(),
  autoRecover: z.boolean(),
  maxAttempts: z.number().int().min(1).max(10),
  cooldownMs: z.number().int().min(1000),
  rules: z.array(
    z.object({
      probeName: z.string(),
      minSeverity: z.enum(['info', 'warning', 'error', 'critical']),
      action: z.enum([
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
      ]),
      enabled: z.boolean(),
    }),
  ),
});

export function getDefaultRescuePolicy(): CrestodianRescuePolicy {
  return {
    enabled: true,
    autoRecover: false,
    maxAttempts: 3,
    cooldownMs: 300000,
    rules: [
      {
        probeName: 'memory',
        minSeverity: 'warning',
        action: 'repair',
        enabled: true,
      },
      {
        probeName: 'disk',
        minSeverity: 'warning',
        action: 'cleanup',
        enabled: true,
      },
      {
        probeName: 'services',
        minSeverity: 'critical',
        action: 'restart',
        enabled: true,
      },
      {
        probeName: 'config',
        minSeverity: 'warning',
        action: 'validate',
        enabled: true,
      },
      {
        probeName: 'connectivity',
        minSeverity: 'warning',
        action: 'diagnose',
        enabled: false,
      },
    ],
  };
}

export function validateRescuePolicy(policy: unknown): policy is CrestodianRescuePolicy {
  const result = rescuePolicySchema.safeParse(policy);
  return result.success;
}

export function normalizeRescuePolicy(policy: Partial<CrestodianRescuePolicy>): CrestodianRescuePolicy {
  const defaults = getDefaultRescuePolicy();
  return {
    enabled: policy.enabled ?? defaults.enabled,
    autoRecover: policy.autoRecover ?? defaults.autoRecover,
    maxAttempts: policy.maxAttempts ?? defaults.maxAttempts,
    cooldownMs: policy.cooldownMs ?? defaults.cooldownMs,
    rules: policy.rules ?? defaults.rules,
  };
}

export function shouldTriggerRescue(params: {
  probeName: string;
  severity: CrestodianSeverity;
  policy: CrestodianRescuePolicy;
}): boolean {
  if (!params.policy.enabled) {
    return false;
  }

  const rule = params.policy.rules.find(
    (r) => r.probeName === params.probeName && r.enabled,
  );

  if (!rule) {
    return false;
  }

  const severityOrder: CrestodianSeverity[] = ['info', 'warning', 'error', 'critical'];
  const minSeverityIndex = severityOrder.indexOf(rule.minSeverity);
  const currentSeverityIndex = severityOrder.indexOf(params.severity);

  return currentSeverityIndex >= minSeverityIndex;
}

export function getRescueAction(params: {
  probeName: string;
  severity: CrestodianSeverity;
  policy: CrestodianRescuePolicy;
}): CrestodianOperationType | null {
  if (!shouldTriggerRescue(params)) {
    return null;
  }

  const rule = params.policy.rules.find(
    (r) => r.probeName === params.probeName && r.enabled,
  );

  return rule?.action ?? null;
}

export function formatRescuePolicy(policy: CrestodianRescuePolicy): string {
  const lines: string[] = [];
  lines.push('Rescue Policy:');
  lines.push(`  Enabled: ${policy.enabled ? 'yes' : 'no'}`);
  lines.push(`  Auto-recover: ${policy.autoRecover ? 'yes' : 'no'}`);
  lines.push(`  Max attempts: ${policy.maxAttempts}`);
  lines.push(`  Cooldown: ${policy.cooldownMs / 1000}s`);
  lines.push('');
  lines.push('  Rules:');
  for (const rule of policy.rules) {
    lines.push(
      `    ${rule.enabled ? '✓' : '✗'} ${rule.probeName.padEnd(15)} ${rule.minSeverity.padEnd(10)} → ${rule.action}`,
    );
  }
  return lines.join('\n');
}
