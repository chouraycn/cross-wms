import { logger } from '../../logger.js';
import { evaluateToolPolicies, type PolicyEvaluationContext, type PolicyEvaluationResult } from './tool-policy-match.js';

export type PipelineStage = 'pre_validation' | 'policy_check' | 'post_validation' | 'final';

export interface PipelineHook {
  stage: PipelineStage;
  name: string;
  handler: (context: PolicyEvaluationContext) => PolicyEvaluationResult | Promise<PolicyEvaluationResult>;
  priority: number;
}

const hooks: PipelineHook[] = [];

export function registerPipelineHook(hook: Omit<PipelineHook, 'priority'> & { priority?: number }): void {
  const fullHook: PipelineHook = {
    ...hook,
    priority: hook.priority ?? 0,
  };
  hooks.push(fullHook);
  hooks.sort((a, b) => b.priority - a.priority);
  logger.debug(`[Agents:ToolPolicyPipeline] Registered hook: ${hook.name} (${hook.stage})`);
}

export function unregisterPipelineHook(name: string): boolean {
  const index = hooks.findIndex(h => h.name === name);
  if (index === -1) return false;
  hooks.splice(index, 1);
  logger.debug(`[Agents:ToolPolicyPipeline] Unregistered hook: ${name}`);
  return true;
}

export function listPipelineHooks(): PipelineHook[] {
  return [...hooks];
}

export function getHooksByStage(stage: PipelineStage): PipelineHook[] {
  return hooks.filter(h => h.stage === stage);
}

export async function runPolicyPipeline(context: PolicyEvaluationContext): Promise<PolicyEvaluationResult> {
  const result: PolicyEvaluationResult = {
    decision: 'allow',
    matchedPolicies: [],
    reasons: [],
  };

  const stages: PipelineStage[] = ['pre_validation', 'policy_check', 'post_validation', 'final'];

  for (const stage of stages) {
    const stageHooks = getHooksByStage(stage);
    
    for (const hook of stageHooks) {
      try {
        const hookResult = await hook.handler(context);
        
        result.matchedPolicies.push(...hookResult.matchedPolicies);
        result.reasons.push(...hookResult.reasons);
        
        if (hookResult.decision === 'deny') {
          result.decision = 'deny';
          logger.debug(`[Agents:ToolPolicyPipeline] Deny from hook: ${hook.name}`);
          return result;
        } else if (hookResult.decision === 'require_approval' && result.decision === 'allow') {
          result.decision = 'require_approval';
        }
      } catch (err) {
        logger.error(`[Agents:ToolPolicyPipeline] Hook ${hook.name} failed:`, err);
      }
    }

    if (stage === 'policy_check') {
      const policyResult = evaluateToolPolicies(context);
      result.matchedPolicies.push(...policyResult.matchedPolicies);
      result.reasons.push(...policyResult.reasons);
      
      if (policyResult.decision === 'deny') {
        result.decision = 'deny';
        return result;
      } else if (policyResult.decision === 'require_approval' && result.decision === 'allow') {
        result.decision = 'require_approval';
      }
    }
  }

  return result;
}

export function clearPipelineHooks(): void {
  hooks.length = 0;
}

logger.debug('[Agents:ToolPolicyPipeline] Module loaded');
