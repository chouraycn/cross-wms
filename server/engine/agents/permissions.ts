import { logger } from '../../logger.js';

export type AgentPermission =
  | 'file.read'
  | 'file.write'
  | 'network.read'
  | 'network.write'
  | 'exec.shell'
  | 'tool.use'
  | 'memory.read'
  | 'memory.write'
  | 'subagent.spawn';

export interface AgentPermissionPolicy {
  agentId: string;
  allowed: AgentPermission[];
  denied: AgentPermission[];
  requireApproval: AgentPermission[];
}

const policyStore = new Map<string, AgentPermissionPolicy>();

export function setAgentPermissionPolicy(policy: AgentPermissionPolicy): void {
  policyStore.set(policy.agentId, policy);
  logger.debug(`[Agents:Permissions] Set policy for ${policy.agentId}`);
}

export function getAgentPermissionPolicy(agentId: string): AgentPermissionPolicy | undefined {
  return policyStore.get(agentId);
}

export function grantPermission(agentId: string, permission: AgentPermission): void {
  const policy = policyStore.get(agentId) ?? defaultPolicy(agentId);
  if (!policy.allowed.includes(permission)) {
    policy.allowed.push(permission);
  }
  policy.denied = policy.denied.filter((p) => p !== permission);
  policyStore.set(agentId, policy);
}

export function denyPermission(agentId: string, permission: AgentPermission): void {
  const policy = policyStore.get(agentId) ?? defaultPolicy(agentId);
  if (!policy.denied.includes(permission)) {
    policy.denied.push(permission);
  }
  policy.allowed = policy.allowed.filter((p) => p !== permission);
  policyStore.set(agentId, policy);
}

export function requireApprovalFor(agentId: string, permission: AgentPermission): void {
  const policy = policyStore.get(agentId) ?? defaultPolicy(agentId);
  if (!policy.requireApproval.includes(permission)) {
    policy.requireApproval.push(permission);
  }
  policyStore.set(agentId, policy);
}

export function checkPermission(agentId: string, permission: AgentPermission): 'allow' | 'deny' | 'approval' {
  const policy = policyStore.get(agentId);
  if (!policy) return 'allow';
  if (policy.denied.includes(permission)) return 'deny';
  if (policy.requireApproval.includes(permission)) return 'approval';
  if (policy.allowed.includes(permission)) return 'allow';
  return 'deny';
}

function defaultPolicy(agentId: string): AgentPermissionPolicy {
  return {
    agentId,
    allowed: ['file.read', 'tool.use', 'memory.read', 'memory.write'],
    denied: ['exec.shell'],
    requireApproval: ['file.write', 'network.write', 'subagent.spawn'],
  };
}

export function clearAgentPermissions(agentId: string): void {
  policyStore.delete(agentId);
}
