export type ToolPermission = 'allow' | 'deny' | 'prompt';

export interface ToolPolicyRule {
  toolName: string | 'default';
  permission: ToolPermission;
  conditions?: {
    sessionId?: string;
    userRole?: string;
    maxCalls?: number;
  };
}

export interface AgentPolicy {
  id: string;
  name: string;
  toolRules: ToolPolicyRule[];
  maxIterations?: number;
  maxTokenBudget?: number;
  allowedModels?: string[];
  deniedModels?: string[];
}

export class PolicyEngine {
  private policies: Map<string, AgentPolicy> = new Map();

  registerPolicy(policy: AgentPolicy): void {
    this.policies.set(policy.id, policy);
  }

  getPolicy(id: string): AgentPolicy | undefined {
    return this.policies.get(id);
  }

  checkToolPermission(policy: AgentPolicy, toolName: string, context?: { sessionId?: string; userRole?: string }): ToolPermission {
    const specificRule = policy.toolRules.find(r => r.toolName === toolName);
    if (specificRule) {
      if (specificRule.conditions) {
        if (specificRule.conditions.sessionId && specificRule.conditions.sessionId !== context?.sessionId) {
          return 'deny';
        }
        if (specificRule.conditions.userRole && specificRule.conditions.userRole !== context?.userRole) {
          return 'deny';
        }
      }
      return specificRule.permission;
    }

    const defaultRule = policy.toolRules.find(r => r.toolName === 'default');
    return defaultRule?.permission ?? 'allow';
  }

  isModelAllowed(policy: AgentPolicy, modelName: string): boolean {
    if (policy.deniedModels?.includes(modelName)) return false;
    if (policy.allowedModels && !policy.allowedModels.includes(modelName)) return false;
    return true;
  }
}