import { logger } from '../../../logger.js';
import type { ExecSafetyCheckResult } from './types.js';
import { isBinAllowed, requiresApproval, isPathAllowed, DEFAULT_SAFE_BIN_POLICY, type SafeBinPolicy } from './exec-safe-bin-policy.js';

const DANGEROUS_PATTERNS = [
  { pattern: /\brm\s+-rf\b/i, level: 'critical' as const, reason: 'Recursive force delete' },
  { pattern: /\bdd\s+if=.*\s+of=/i, level: 'critical' as const, reason: 'Disk write operation' },
  { pattern: /\bsudo\b/i, level: 'high' as const, reason: 'Privilege escalation' },
  { pattern: /\bsu\s+/i, level: 'high' as const, reason: 'User switching' },
  { pattern: /\bchmod\s+777\b/i, level: 'high' as const, reason: 'World-writable permissions' },
  { pattern: /\bchown\s+-R\b/i, level: 'medium' as const, reason: 'Recursive ownership change' },
  { pattern: /\|.*\b(sh|bash|zsh)\b/i, level: 'high' as const, reason: 'Pipe to shell' },
  { pattern: /\b(sh|bash|zsh)\s+-c\b/i, level: 'medium' as const, reason: 'Shell command execution' },
  { pattern: /`.*`/i, level: 'high' as const, reason: 'Command substitution' },
  { pattern: /\$\(.*\)/i, level: 'high' as const, reason: 'Command substitution' },
  { pattern: /\bwget\s+.*\|\s*(sh|bash)/i, level: 'critical' as const, reason: 'Download and execute' },
  { pattern: /\bcurl\s+.*\|\s*(sh|bash)/i, level: 'critical' as const, reason: 'Download and execute' },
  { pattern: /\beval\b/i, level: 'high' as const, reason: 'Eval command' },
  { pattern: /\bexec\b/i, level: 'medium' as const, reason: 'Exec command' },
  { pattern: /\/dev\/null/i, level: 'low' as const, reason: 'Output suppression' },
  { pattern: /&&.*\b(rm|mv|cp)\b/i, level: 'medium' as const, reason: 'Chained destructive operation' },
];

export function checkCommandSafety(
  command: string,
  args: string[],
  cwd?: string,
  policy: SafeBinPolicy = DEFAULT_SAFE_BIN_POLICY,
): ExecSafetyCheckResult {
  const checks: string[] = [];
  const warnings: string[] = [];
  let highestRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  const fullCommand = [command, ...args].join(' ');

  checks.push('command-parsed');

  if (!isBinAllowed(command, policy)) {
    warnings.push(`Binary ${command} is not in allowed list`);
    highestRiskLevel = 'high';
    checks.push('bin-blocked');
  } else {
    checks.push('bin-allowed');
  }

  if (cwd && !isPathAllowed(cwd, policy)) {
    warnings.push(`Working directory ${cwd} is in blocked path`);
    highestRiskLevel = 'high';
    checks.push('path-blocked');
  } else {
    checks.push('path-allowed');
  }

  for (const { pattern, level, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(fullCommand)) {
      warnings.push(reason);
      const levelOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
      const currentLevel = level as 'low' | 'medium' | 'high' | 'critical';
      if (levelOrder[currentLevel] > levelOrder[highestRiskLevel]) {
        highestRiskLevel = currentLevel;
      }
      checks.push(`pattern-${level}`);
    }
  }

  if (requiresApproval(command, args, policy)) {
    checks.push('requires-approval');
    if (highestRiskLevel === 'low') {
      highestRiskLevel = 'medium';
    }
  } else {
    checks.push('no-approval-required');
  }

  const safe = highestRiskLevel === 'low' || highestRiskLevel === 'medium';

  return {
    safe,
    riskLevel: highestRiskLevel,
    checks,
    warnings,
    reason: warnings.length > 0 ? warnings.join('; ') : undefined,
  };
}

export function assertCommandSafe(
  command: string,
  args: string[],
  cwd?: string,
  policy?: SafeBinPolicy,
): void {
  const result = checkCommandSafety(command, args, cwd, policy);
  if (!result.safe) {
    throw new Error(`Command rejected by safety policy: ${result.reason ?? 'unsafe command'}`);
  }
}

export function isSafeCommand(
  command: string,
  args: string[],
  cwd?: string,
  policy?: SafeBinPolicy,
): boolean {
  return checkCommandSafety(command, args, cwd, policy).safe;
}
