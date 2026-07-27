import { logger } from '../../logger.js';
import {
  expandToolGroups,
  listToolPolicies,
  matchToolPattern,
  matchAgentPattern,
  normalizeToolName,
  type ToolPolicy,
} from './tool-policy.js';

export type PolicyDecision = 'allow' | 'deny' | 'require_approval';

export interface PolicyEvaluationContext {
  toolName: string;
  agentId: string;
  sessionId?: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  matchedPolicies: string[];
  reasons: string[];
}

export type SandboxToolPolicy = {
  allow?: string[];
  deny?: string[];
};

function compileGlobPatterns(params: {
  raw: string[];
  normalize: (name: string) => string;
}): string[] {
  return params.raw.map(params.normalize).filter(Boolean);
}

function matchesAnyGlobPattern(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchToolPattern(name, pattern)) {
      return true;
    }
  }
  return false;
}

function makeToolPolicyMatcher(policy: SandboxToolPolicy) {
  const deny = compileGlobPatterns({
    raw: expandToolGroups(policy.deny ?? []),
    normalize: normalizeToolName,
  });
  const allow = compileGlobPatterns({
    raw: expandToolGroups(policy.allow ?? []),
    normalize: normalizeToolName,
  });
  return (name: string) => {
    const normalized = normalizeToolName(name);
    if (matchesAnyGlobPattern(normalized, deny)) {
      return false;
    }
    if (allow.length === 0) {
      return true;
    }
    if (matchesAnyGlobPattern(normalized, allow)) {
      return true;
    }
    if (normalized === "apply_patch" && matchesAnyGlobPattern("write", allow)) {
      return true;
    }
    return false;
  };
}

export function isToolAllowedByPolicyName(name: string, policy?: SandboxToolPolicy): boolean {
  if (!policy) {
    return true;
  }
  return makeToolPolicyMatcher(policy)(name);
}

export function isToolAllowedByPolicies(
  name: string,
  policies: Array<SandboxToolPolicy | undefined>,
) {
  return policies.every((policy) => isToolAllowedByPolicyName(name, policy));
}

export function evaluateToolPolicies(context: PolicyEvaluationContext): PolicyEvaluationResult {
  const policies = listToolPolicies();
  const matchedPolicies: string[] = [];
  const reasons: string[] = [];
  let decision: PolicyDecision = 'allow';

  for (const policy of policies) {
    if (!policy.enabled) continue;

    const toolMatch = policy.toolPatterns.some(p => matchToolPattern(context.toolName, p));
    if (!toolMatch) continue;

    const agentMatch = policy.agentPatterns.length === 0 ||
      policy.agentPatterns.some(p => matchAgentPattern(context.agentId, p));
    if (!agentMatch) continue;

    matchedPolicies.push(policy.id);
    reasons.push(`Policy ${policy.name} (${policy.effect})`);

    if (policy.effect === 'deny') {
      decision = 'deny';
      break;
    } else if (policy.effect === 'require_approval' && decision === 'allow') {
      decision = 'require_approval';
    }
  }

  logger.debug(`[Agents:ToolPolicyMatch] ${context.toolName} for ${context.agentId}: ${decision}`);
  return { decision, matchedPolicies, reasons };
}

export function isToolAllowed(toolName: string, agentId: string): boolean {
  const result = evaluateToolPolicies({ toolName, agentId });
  return result.decision === 'allow';
}

export function getMatchingPolicies(toolName: string, agentId: string): ToolPolicy[] {
  const policies = listToolPolicies();
  return policies.filter(policy => {
    if (!policy.enabled) return false;
    const toolMatch = policy.toolPatterns.some(p => matchToolPattern(toolName, p));
    if (!toolMatch) return false;
    const agentMatch = policy.agentPatterns.length === 0 ||
      policy.agentPatterns.some(p => matchAgentPattern(agentId, p));
    return agentMatch;
  });
}

logger.debug('[Agents:ToolPolicyMatch] Module loaded');
