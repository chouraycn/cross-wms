import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type ExecFilesystemPolicyRule = {
  id: string;
  name: string;
  description: string;
  type: 'allow' | 'deny';
  pattern: string;
  scope: 'read' | 'write' | 'execute' | 'delete' | 'all';
  severity?: 'critical' | 'high' | 'medium' | 'low';
};

export type ExecFilesystemPolicy = {
  id: string;
  name: string;
  description?: string;
  rules: ExecFilesystemPolicyRule[];
  defaultAction: 'allow' | 'deny';
};

export type ExecFilesystemAction = 'read' | 'write' | 'execute' | 'delete';

export type ExecFilesystemDecision = {
  allowed: boolean;
  reason: string;
  ruleId?: string;
  policyId: string;
};

const DEFAULT_EXEC_FILESYSTEM_POLICY: ExecFilesystemPolicy = {
  id: 'default-exec-fs-policy',
  name: 'Default Exec Filesystem Policy',
  description: 'Default policy for file system operations during execution',
  rules: [
    {
      id: 'deny-root',
      name: 'Deny root access',
      description: 'Denies access to root directories',
      type: 'deny',
      pattern: '^/$',
      scope: 'all',
      severity: 'critical',
    },
    {
      id: 'deny-etc',
      name: 'Deny /etc access',
      description: 'Denies access to /etc directory',
      type: 'deny',
      pattern: '^/etc/',
      scope: 'all',
      severity: 'critical',
    },
    {
      id: 'deny-proc',
      name: 'Deny /proc access',
      description: 'Denies access to /proc filesystem',
      type: 'deny',
      pattern: '^/proc/',
      scope: 'all',
      severity: 'critical',
    },
    {
      id: 'deny-sys',
      name: 'Deny /sys access',
      description: 'Denies access to /sys filesystem',
      type: 'deny',
      pattern: '^/sys/',
      scope: 'all',
      severity: 'critical',
    },
    {
      id: 'deny-dev',
      name: 'Deny /dev access',
      description: 'Denies access to /dev directory',
      type: 'deny',
      pattern: '^/dev/',
      scope: 'all',
      severity: 'critical',
    },
    {
      id: 'deny-root-home',
      name: 'Deny /root access',
      description: 'Denies access to root home directory',
      type: 'deny',
      pattern: '^/root/',
      scope: 'all',
      severity: 'critical',
    },
    {
      id: 'deny-ssh-keys',
      name: 'Deny SSH key access',
      description: 'Denies access to SSH private keys',
      type: 'deny',
      pattern: '/\\.ssh/(id_rsa|id_ed25519|id_dsa|id_ecdsa)$',
      scope: 'all',
      severity: 'critical',
    },
    {
      id: 'deny-secret-files',
      name: 'Deny secret files',
      description: 'Denies access to common secret files',
      type: 'deny',
      pattern: '/(\\.env|\\.env\\.local|\\.git/config)$',
      scope: 'all',
      severity: 'critical',
    },
    {
      id: 'deny-cert-files',
      name: 'Deny certificate files',
      description: 'Denies access to certificate/key files',
      type: 'deny',
      pattern: '\\.(pem|key|crt|pfx|p12)$',
      scope: 'all',
      severity: 'high',
    },
  ],
  defaultAction: 'deny',
};

export function getDefaultExecFilesystemPolicy(): ExecFilesystemPolicy {
  return { ...DEFAULT_EXEC_FILESYSTEM_POLICY, rules: [...DEFAULT_EXEC_FILESYSTEM_POLICY.rules] };
}

export function evaluateExecFilesystemPolicy(
  policy: ExecFilesystemPolicy,
  filePath: string,
  action: ExecFilesystemAction,
): ExecFilesystemDecision {
  const normalizedPath = path.normalize(filePath);

  for (const rule of policy.rules) {
    if (rule.scope !== 'all' && rule.scope !== action) {
      continue;
    }

    try {
      const regex = new RegExp(rule.pattern);
      if (regex.test(normalizedPath)) {
        return {
          allowed: rule.type === 'allow',
          reason: `${rule.type === 'allow' ? 'Allowed' : 'Denied'} by rule: ${rule.name}`,
          ruleId: rule.id,
          policyId: policy.id,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    allowed: policy.defaultAction === 'allow',
    reason: `No matching rules, ${policy.defaultAction}ed by default`,
    policyId: policy.id,
  };
}

export function auditExecFilesystemPolicy(policy: ExecFilesystemPolicy): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (policy.defaultAction === 'allow') {
    findings.push({
      id: 'exec-fs-policy-default-allow',
      title: 'Exec filesystem policy defaults to allow',
      severity: 'high',
      category: 'filesystem',
      description: 'The exec filesystem policy defaults to allow all operations. This is insecure.',
      recommendation: 'Set defaultAction to "deny" and explicitly allow only necessary paths.',
      metadata: { policyId: policy.id, defaultAction: policy.defaultAction },
    });
  }

  const dangerousAllowRules = policy.rules.filter((r) => r.type === 'allow' && (r.pattern === '.*' || r.pattern === '*'));
  for (const rule of dangerousAllowRules) {
    findings.push({
      id: `exec-fs-policy-dangerous-allow-${rule.id}`,
      title: `Dangerous allow rule: ${rule.name}`,
      severity: 'critical',
      category: 'filesystem',
      description: `Rule "${rule.name}" allows all paths with pattern "${rule.pattern}".`,
      recommendation: 'Replace with more specific patterns.',
      metadata: { ruleId: rule.id, pattern: rule.pattern, scope: rule.scope },
    });
  }

  const missingDenyRules = ['deny-root', 'deny-etc', 'deny-proc', 'deny-dev'];
  for (const missing of missingDenyRules) {
    if (!policy.rules.some((r) => r.id === missing)) {
      findings.push({
        id: `exec-fs-policy-missing-${missing}`,
        title: `Missing security rule: ${missing}`,
        severity: 'high',
        category: 'filesystem',
        description: `Policy is missing the ${missing} rule which protects critical system paths.`,
        recommendation: 'Add the missing rule to the policy.',
        metadata: { policyId: policy.id, missingRule: missing },
      });
    }
  }

  logger.debug(`[Security:ExecFilesystem] Audited policy ${policy.id}, found ${findings.length} findings`);

  return findings;
}

export async function validateExecFilesystemPath(
  filePath: string,
  policy: ExecFilesystemPolicy,
  action: ExecFilesystemAction,
): Promise<ExecFilesystemDecision & { exists?: boolean; isDirectory?: boolean }> {
  const decision = evaluateExecFilesystemPolicy(policy, filePath, action);

  if (!decision.allowed) {
    return { ...decision };
  }

  try {
    const stat = await fs.stat(filePath);
    return {
      ...decision,
      exists: true,
      isDirectory: stat.isDirectory(),
    };
  } catch {
    return {
      ...decision,
      exists: false,
    };
  }
}

export function buildExecFilesystemPolicyFromConfig(config: Record<string, unknown>): ExecFilesystemPolicy {
  const policy: ExecFilesystemPolicy = {
    id: config['id'] as string || 'custom-exec-fs-policy',
    name: config['name'] as string || 'Custom Exec Filesystem Policy',
    description: config['description'] as string,
    rules: [],
    defaultAction: (config['defaultAction'] as 'allow' | 'deny') || 'deny',
  };

  const rulesConfig = config['rules'] as Record<string, unknown>[] || [];
  for (const ruleConfig of rulesConfig) {
    const ruleId = ruleConfig['id'] as string || `rule-${policy.rules.length}`;
    const rule: ExecFilesystemPolicyRule = {
      id: ruleId,
      name: ruleConfig['name'] as string || ruleId,
      description: ruleConfig['description'] as string,
      type: (ruleConfig['type'] as 'allow' | 'deny') || 'deny',
      pattern: ruleConfig['pattern'] as string || '.*',
      scope: (ruleConfig['scope'] as ExecFilesystemPolicyRule['scope']) || 'all',
      severity: ruleConfig['severity'] as ExecFilesystemPolicyRule['severity'],
    };
    policy.rules.push(rule);
  }

  return policy;
}