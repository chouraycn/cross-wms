import { z } from 'zod';
import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type DmPolicyType = 'open' | 'allowlist' | 'deny-list' | 'disabled' | 'paired';

export type DmPolicyScope = 'global' | 'channel' | 'user';

export type DmPolicy = {
  id: string;
  type: DmPolicyType;
  scope: DmPolicyScope;
  allowlist?: string[];
  denylist?: string[];
  pairedUsers?: Record<string, string>;
  enabled: boolean;
  description?: string;
};

export const DmPolicySchema = z.object({
  id: z.string(),
  type: z.enum(['open', 'allowlist', 'deny-list', 'disabled', 'paired']),
  scope: z.enum(['global', 'channel', 'user']),
  allowlist: z.array(z.string()).optional(),
  denylist: z.array(z.string()).optional(),
  pairedUsers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional().default(true),
  description: z.string().optional(),
});

export const DmPolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  policyId: z.string(),
  policyType: z.enum(['open', 'allowlist', 'deny-list', 'disabled', 'paired']),
});

export type DmPolicyDecision = z.infer<typeof DmPolicyDecisionSchema>;

const SHARED_DM_POLICY_RULES: {
  id: string;
  name: string;
  description: string;
  check: (policy: DmPolicy) => boolean;
  recommendation: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}[] = [
  {
    id: 'dm-policy-open-global',
    name: 'Global open DM policy',
    description: 'Global DM policy is set to "open", allowing anyone to DM',
    check: (policy) => policy.type === 'open' && policy.scope === 'global',
    recommendation: 'Change global DM policy to "allowlist" for better security.',
    severity: 'critical',
  },
  {
    id: 'dm-policy-empty-allowlist',
    name: 'Empty DM allowlist',
    description: 'DM allowlist is empty while policy is set to "allowlist"',
    check: (policy) => policy.type === 'allowlist' && (!policy.allowlist || policy.allowlist.length === 0),
    recommendation: 'Add users to the allowlist or change policy type.',
    severity: 'medium',
  },
  {
    id: 'dm-policy-allowlist-denylist-conflict',
    name: 'Allowlist and denylist conflict',
    description: 'Both allowlist and denylist are configured',
    check: (policy) => (policy.allowlist?.length ?? 0) > 0 && (policy.denylist?.length ?? 0) > 0,
    recommendation: 'Use either allowlist or denylist, not both.',
    severity: 'medium',
  },
  {
    id: 'dm-policy-paired-empty',
    name: 'Empty paired users',
    description: 'Paired DM policy has no paired users configured',
    check: (policy) => policy.type === 'paired' && (!policy.pairedUsers || Object.keys(policy.pairedUsers).length === 0),
    recommendation: 'Add paired user mappings or change policy type.',
    severity: 'medium',
  },
  {
    id: 'dm-policy-disabled',
    name: 'DM policy disabled',
    description: 'DM policy is disabled',
    check: (policy) => !policy.enabled,
    recommendation: 'Enable DM policy if DMs are required.',
    severity: 'info',
  },
];

export function evaluateDmPolicy(policy: DmPolicy, userId: string): DmPolicyDecision {
  if (!policy.enabled) {
    return {
      allowed: false,
      reason: 'DM policy is disabled',
      policyId: policy.id,
      policyType: policy.type,
    };
  }

  switch (policy.type) {
    case 'open':
      return {
        allowed: true,
        reason: 'Open DM policy allows all users',
        policyId: policy.id,
        policyType: 'open',
      };

    case 'allowlist':
      if (policy.allowlist?.includes(userId)) {
        return {
          allowed: true,
          reason: 'User is in allowlist',
          policyId: policy.id,
          policyType: 'allowlist',
        };
      }
      return {
        allowed: false,
        reason: 'User is not in allowlist',
        policyId: policy.id,
        policyType: 'allowlist',
      };

    case 'deny-list':
      if (policy.denylist?.includes(userId)) {
        return {
          allowed: false,
          reason: 'User is in denylist',
          policyId: policy.id,
          policyType: 'deny-list',
        };
      }
      return {
        allowed: true,
        reason: 'User is not in denylist',
        policyId: policy.id,
        policyType: 'deny-list',
      };

    case 'paired':
      if (policy.pairedUsers?.[userId]) {
        return {
          allowed: true,
          reason: 'User has paired relationship',
          policyId: policy.id,
          policyType: 'paired',
        };
      }
      return {
        allowed: false,
        reason: 'User has no paired relationship',
        policyId: policy.id,
        policyType: 'paired',
      };

    case 'disabled':
    default:
      return {
        allowed: false,
        reason: 'DMs are disabled',
        policyId: policy.id,
        policyType: 'disabled',
      };
  }
}

export function auditDmPolicy(policy: DmPolicy): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const rule of SHARED_DM_POLICY_RULES) {
    if (rule.check(policy)) {
      findings.push({
        id: `dm-policy-${rule.id}-${policy.id}`,
        title: rule.name,
        severity: rule.severity,
        category: 'channel',
        description: `${rule.description} (Policy: ${policy.id}, Scope: ${policy.scope})`,
        recommendation: rule.recommendation,
        metadata: { policyId: policy.id, policyType: policy.type, scope: policy.scope },
      });
    }
  }

  logger.debug(`[Security:DmPolicy] Audited DM policy ${policy.id}, found ${findings.length} findings`);

  return findings;
}

export function validateDmPolicy(policy: DmPolicy): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!policy.id || policy.id.length === 0) {
    errors.push('Policy ID is required');
  }

  if (!policy.type) {
    errors.push('Policy type is required');
  }

  if (!policy.scope) {
    errors.push('Policy scope is required');
  }

  if (policy.type === 'allowlist' && (!policy.allowlist || policy.allowlist.length === 0)) {
    errors.push('Allowlist policy requires allowlist entries');
  }

  if (policy.type === 'paired' && (!policy.pairedUsers || Object.keys(policy.pairedUsers).length === 0)) {
    errors.push('Paired policy requires paired user mappings');
  }

  if (policy.allowlist && policy.denylist) {
    const conflicts = policy.allowlist.filter((u) => policy.denylist?.includes(u));
    if (conflicts.length > 0) {
      errors.push(`Users in both allowlist and denylist: ${conflicts.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function mergeDmPolicies(policies: DmPolicy[]): DmPolicy {
  const merged: DmPolicy = {
    id: 'merged-policy',
    type: 'deny-list',
    scope: 'global',
    allowlist: [],
    denylist: [],
    pairedUsers: {},
    enabled: true,
    description: 'Merged DM policy from multiple sources',
  };

  for (const policy of policies) {
    if (!policy.enabled) continue;

    if (policy.type === 'open') {
      merged.type = 'open';
      merged.allowlist = undefined;
      merged.denylist = undefined;
      merged.pairedUsers = undefined;
      break;
    }

    if (policy.type === 'disabled') {
      merged.enabled = false;
      continue;
    }

    if (policy.type === 'allowlist' && policy.allowlist) {
      merged.type = 'allowlist';
      merged.allowlist = [...new Set([...(merged.allowlist || []), ...policy.allowlist])];
      merged.denylist = undefined;
    }

    if (policy.type === 'deny-list' && policy.denylist) {
      if (merged.type !== 'allowlist') {
        merged.type = 'deny-list';
        merged.denylist = [...new Set([...(merged.denylist || []), ...policy.denylist])];
      }
    }

    if (policy.type === 'paired' && policy.pairedUsers) {
      merged.type = 'paired';
      merged.pairedUsers = { ...merged.pairedUsers, ...policy.pairedUsers };
      merged.allowlist = undefined;
      merged.denylist = undefined;
    }
  }

  return merged;
}