import { logger } from '../../logger.js';
import type { AgentPermission, AgentPermissionPolicy } from './permissions.js';

export type PermissionDecision = 'allow' | 'deny' | 'approval';

export interface PolicyEvaluationContext {
  agentId: string;
  permission: AgentPermission;
  context?: Record<string, unknown>;
  resource?: string;
}

export interface PolicyEvaluationResult {
  decision: PermissionDecision;
  reason: string;
  policySource?: string;
}

export interface PermissionPolicyEngineOptions {
  defaultPolicy?: AgentPermissionPolicy;
  enableLogging?: boolean;
}

export class PermissionPolicyEngine {
  private policies = new Map<string, AgentPermissionPolicy>();
  private defaultPolicy: AgentPermissionPolicy;
  private enableLogging: boolean;

  constructor(options?: PermissionPolicyEngineOptions) {
    this.enableLogging = options?.enableLogging ?? true;
    this.defaultPolicy = options?.defaultPolicy ?? this.createDefaultPolicy('default');
  }

  private createDefaultPolicy(agentId: string): AgentPermissionPolicy {
    return {
      agentId,
      allowed: ['file.read', 'tool.use', 'memory.read', 'memory.write'],
      denied: ['exec.shell'],
      requireApproval: ['file.write', 'network.write', 'subagent.spawn'],
    };
  }

  setPolicy(policy: AgentPermissionPolicy): void {
    this.policies.set(policy.agentId, policy);
    if (this.enableLogging) {
      logger.debug(`[PermissionPolicyEngine] Set policy for ${policy.agentId}`);
    }
  }

  getPolicy(agentId: string): AgentPermissionPolicy | undefined {
    return this.policies.get(agentId);
  }

  grantPermission(agentId: string, permission: AgentPermission): void {
    const policy = this.policies.get(agentId) ?? this.createDefaultPolicy(agentId);
    if (!policy.allowed.includes(permission)) {
      policy.allowed.push(permission);
    }
    policy.denied = policy.denied.filter((p) => p !== permission);
    policy.requireApproval = policy.requireApproval.filter((p) => p !== permission);
    this.policies.set(agentId, policy);
  }

  denyPermission(agentId: string, permission: AgentPermission): void {
    const policy = this.policies.get(agentId) ?? this.createDefaultPolicy(agentId);
    if (!policy.denied.includes(permission)) {
      policy.denied.push(permission);
    }
    policy.allowed = policy.allowed.filter((p) => p !== permission);
    policy.requireApproval = policy.requireApproval.filter((p) => p !== permission);
    this.policies.set(agentId, policy);
  }

  requireApprovalFor(agentId: string, permission: AgentPermission): void {
    const policy = this.policies.get(agentId) ?? this.createDefaultPolicy(agentId);
    if (!policy.requireApproval.includes(permission)) {
      policy.requireApproval.push(permission);
    }
    policy.allowed = policy.allowed.filter((p) => p !== permission);
    policy.denied = policy.denied.filter((p) => p !== permission);
    this.policies.set(agentId, policy);
  }

  evaluate(context: PolicyEvaluationContext): PolicyEvaluationResult {
    const { agentId, permission, resource } = context;
    const policy = this.policies.get(agentId);

    if (!policy) {
      return {
        decision: 'allow',
        reason: 'No policy found, allowing by default',
      };
    }

    if (policy.denied.includes(permission)) {
      const reason = resource
        ? `Permission "${permission}" denied for resource "${resource}"`
        : `Permission "${permission}" denied`;
      if (this.enableLogging) {
        logger.debug(`[PermissionPolicyEngine] DENY: ${reason}`);
      }
      return {
        decision: 'deny',
        reason,
        policySource: agentId,
      };
    }

    if (policy.requireApproval.includes(permission)) {
      const reason = resource
        ? `Permission "${permission}" requires approval for resource "${resource}"`
        : `Permission "${permission}" requires approval`;
      if (this.enableLogging) {
        logger.debug(`[PermissionPolicyEngine] APPROVAL_REQUIRED: ${reason}`);
      }
      return {
        decision: 'approval',
        reason,
        policySource: agentId,
      };
    }

    if (policy.allowed.includes(permission)) {
      const reason = resource
        ? `Permission "${permission}" allowed for resource "${resource}"`
        : `Permission "${permission}" allowed`;
      if (this.enableLogging) {
        logger.debug(`[PermissionPolicyEngine] ALLOW: ${reason}`);
      }
      return {
        decision: 'allow',
        reason,
        policySource: agentId,
      };
    }

    return {
      decision: 'deny',
      reason: `Permission "${permission}" not explicitly allowed`,
      policySource: agentId,
    };
  }

  checkPermission(agentId: string, permission: AgentPermission): PermissionDecision {
    return this.evaluate({ agentId, permission }).decision;
  }

  clearPolicy(agentId: string): void {
    this.policies.delete(agentId);
    if (this.enableLogging) {
      logger.debug(`[PermissionPolicyEngine] Cleared policy for ${agentId}`);
    }
  }

  getAllPolicies(): Array<{ agentId: string; policy: AgentPermissionPolicy }> {
    return Array.from(this.policies.entries()).map(([agentId, policy]) => ({
      agentId,
      policy,
    }));
  }

  getPolicySnapshot(agentId: string): AgentPermissionPolicy | undefined {
    const policy = this.policies.get(agentId);
    if (!policy) return undefined;
    return {
      ...policy,
      allowed: [...policy.allowed],
      denied: [...policy.denied],
      requireApproval: [...policy.requireApproval],
    };
  }
}

export const permissionPolicyEngine = new PermissionPolicyEngine();