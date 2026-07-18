import { logger } from '../../logger.js';
import type {
  PolicyRule,
  PolicyCondition,
  PolicyConditionOperator,
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  PolicyEffect,
  PolicyConflictResolution,
} from './policy-types.js';
import { getActivePolicyRules } from './policy-store.js';

function getFieldValue(context: PolicyEvaluationContext, field: string): unknown {
  const parts = field.split('.');
  let value: unknown = context;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return value;
}

function evaluateCondition(condition: PolicyCondition, context: PolicyEvaluationContext): boolean {
  const { field, operator, value, caseSensitive = true } = condition;
  const fieldValue = getFieldValue(context, field);

  if (fieldValue === undefined && operator !== 'exists' && operator !== 'not_exists') {
    return false;
  }

  const stringValue = String(value);
  const stringFieldValue = String(fieldValue);

  switch (operator) {
    case 'equals':
      if (!caseSensitive) {
        return stringFieldValue.toLowerCase() === stringValue.toLowerCase();
      }
      return fieldValue === value;

    case 'not_equals':
      if (!caseSensitive) {
        return stringFieldValue.toLowerCase() !== stringValue.toLowerCase();
      }
      return fieldValue !== value;

    case 'contains':
      if (!caseSensitive) {
        return stringFieldValue.toLowerCase().includes(stringValue.toLowerCase());
      }
      return stringFieldValue.includes(stringValue);

    case 'not_contains':
      if (!caseSensitive) {
        return !stringFieldValue.toLowerCase().includes(stringValue.toLowerCase());
      }
      return !stringFieldValue.includes(stringValue);

    case 'starts_with':
      if (!caseSensitive) {
        return stringFieldValue.toLowerCase().startsWith(stringValue.toLowerCase());
      }
      return stringFieldValue.startsWith(stringValue);

    case 'ends_with':
      if (!caseSensitive) {
        return stringFieldValue.toLowerCase().endsWith(stringValue.toLowerCase());
      }
      return stringFieldValue.endsWith(stringValue);

    case 'matches_regex':
      try {
        const regex = new RegExp(stringValue, caseSensitive ? '' : 'i');
        return regex.test(stringFieldValue);
      } catch {
        return false;
      }

    case 'greater_than':
      return Number(fieldValue) > Number(value);

    case 'less_than':
      return Number(fieldValue) < Number(value);

    case 'greater_than_or_equal':
      return Number(fieldValue) >= Number(value);

    case 'less_than_or_equal':
      return Number(fieldValue) <= Number(value);

    case 'in':
      if (!Array.isArray(value)) return false;
      return value.includes(fieldValue);

    case 'not_in':
      if (!Array.isArray(value)) return true;
      return !value.includes(fieldValue);

    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;

    case 'not_exists':
      return fieldValue === undefined || fieldValue === null;

    default:
      return false;
  }
}

function evaluateRule(rule: PolicyRule, context: PolicyEvaluationContext): { matched: boolean; effect: PolicyEffect; actions: PolicyRule['actions'] } {
  if (rule.status !== 'active') {
    return { matched: false, effect: 'deny', actions: [] };
  }

  if (rule.conditions.length === 0) {
    return { matched: true, effect: rule.effect, actions: rule.actions };
  }

  const allConditionsMet = rule.conditions.every(condition => evaluateCondition(condition, context));

  if (allConditionsMet) {
    logger.debug(`[Security:PolicyEvaluator] Rule matched: ${rule.id} (${rule.effect})`);
    return { matched: true, effect: rule.effect, actions: rule.actions };
  }

  return { matched: false, effect: 'deny', actions: [] };
}

function resolveConflict(
  results: { effect: PolicyEffect; priority: number; ruleId: string }[],
  resolution: PolicyConflictResolution,
  defaultEffect: PolicyEffect,
): { effect: PolicyEffect; ruleId?: string } {
  if (results.length === 0) {
    return { effect: defaultEffect };
  }

  switch (resolution) {
    case 'deny_overrides':
      if (results.some(r => r.effect === 'deny')) {
        const denyRules = results.filter(r => r.effect === 'deny');
        const highestPriorityDeny = denyRules.reduce((max, r) => (r.priority > max.priority ? r : max));
        return { effect: 'deny', ruleId: highestPriorityDeny.ruleId };
      }
      return { effect: 'allow', ruleId: results[0].ruleId };

    case 'allow_overrides':
      if (results.some(r => r.effect === 'allow')) {
        const allowRules = results.filter(r => r.effect === 'allow');
        const highestPriorityAllow = allowRules.reduce((max, r) => (r.priority > max.priority ? r : max));
        return { effect: 'allow', ruleId: highestPriorityAllow.ruleId };
      }
      return { effect: 'deny', ruleId: results[0].ruleId };

    case 'priority_based':
      const sorted = [...results].sort((a, b) => b.priority - a.priority);
      return { effect: sorted[0].effect, ruleId: sorted[0].ruleId };

    case 'first_match':
      return { effect: results[0].effect, ruleId: results[0].ruleId };

    default:
      return { effect: defaultEffect };
  }
}

export function evaluatePolicy(
  context: PolicyEvaluationContext,
  rules?: PolicyRule[],
  conflictResolution: PolicyConflictResolution = 'deny_overrides',
  defaultEffect: PolicyEffect = 'deny',
): PolicyEvaluationResult {
  const activeRules = rules ?? getActivePolicyRules();

  if (activeRules.length === 0) {
    logger.debug('[Security:PolicyEvaluator] No active rules found, returning default effect');
    return {
      allowed: defaultEffect === 'allow',
      effect: defaultEffect,
      matchedRules: [],
      actions: [],
      reason: 'No active rules',
    };
  }

  const matchedResults: { effect: PolicyEffect; priority: number; ruleId: string; actions: PolicyRule['actions'] }[] = [];

  for (const rule of activeRules) {
    const result = evaluateRule(rule, context);
    if (result.matched) {
      matchedResults.push({
        effect: result.effect,
        priority: rule.priority,
        ruleId: rule.id,
        actions: result.actions,
      });
    }
  }

  if (matchedResults.length === 0) {
    logger.debug('[Security:PolicyEvaluator] No rules matched, returning default effect');
    return {
      allowed: defaultEffect === 'allow',
      effect: defaultEffect,
      matchedRules: [],
      actions: [],
      reason: 'No rules matched',
    };
  }

  const conflictResult = resolveConflict(matchedResults, conflictResolution, defaultEffect);

  const allActions = matchedResults.flatMap(r => r.actions);
  const uniqueActions = allActions.filter(
    (action, index, self) => index === self.findIndex(a => a.type === action.type && a.message === action.message),
  );

  const matchedRuleIds = matchedResults.map(r => r.ruleId);

  logger.debug(
    `[Security:PolicyEvaluator] Policy evaluation complete: ${conflictResult.effect}, matched ${matchedRuleIds.length} rules`,
  );

  return {
    allowed: conflictResult.effect === 'allow',
    effect: conflictResult.effect,
    matchedRules: matchedRuleIds,
    actions: uniqueActions,
    reason: `Rule ${conflictResult.ruleId} applied`,
    metadata: {
      matchedRuleCount: matchedRuleIds.length,
      conflictResolution,
      defaultEffect,
    },
  };
}

export function evaluatePolicyWithDebug(
  context: PolicyEvaluationContext,
  rules?: PolicyRule[],
): { result: PolicyEvaluationResult; debug: Record<string, unknown> } {
  const activeRules = rules ?? getActivePolicyRules();
  const debugInfo: Record<string, unknown> = {
    evaluatedRules: activeRules.length,
    context: { ...context },
    ruleEvaluations: [],
  };

  const matchedResults: { effect: PolicyEffect; priority: number; ruleId: string; actions: PolicyRule['actions'] }[] = [];

  for (const rule of activeRules) {
    const ruleDebug: Record<string, unknown> = {
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      effect: rule.effect,
      status: rule.status,
      conditions: [],
      matched: false,
    };

    if (rule.status !== 'active') {
      (ruleDebug.conditions as Record<string, unknown>[]).push({ skipped: 'rule is not active' });
      (debugInfo.ruleEvaluations as Record<string, unknown>[]).push(ruleDebug);
      continue;
    }

    const allConditionsMet = rule.conditions.every((condition, idx) => {
      const conditionMet = evaluateCondition(condition, context);
      (ruleDebug.conditions as Record<string, unknown>[]).push({
        index: idx,
        field: condition.field,
        operator: condition.operator,
        expectedValue: condition.value,
        actualValue: getFieldValue(context, condition.field),
        met: conditionMet,
      });
      return conditionMet;
    });

    ruleDebug.matched = allConditionsMet;

    if (allConditionsMet) {
      matchedResults.push({
        effect: rule.effect,
        priority: rule.priority,
        ruleId: rule.id,
        actions: rule.actions,
      });
    }

    (debugInfo.ruleEvaluations as Record<string, unknown>[]).push(ruleDebug);
  }

  const conflictResult = resolveConflict(matchedResults, 'deny_overrides', 'deny');

  const allActions = matchedResults.flatMap(r => r.actions);
  const uniqueActions = allActions.filter(
    (action, index, self) => index === self.findIndex(a => a.type === action.type && a.message === action.message),
  );

  const result: PolicyEvaluationResult = {
    allowed: conflictResult.effect === 'allow',
    effect: conflictResult.effect,
    matchedRules: matchedResults.map(r => r.ruleId),
    actions: uniqueActions,
    reason: `Rule ${conflictResult.ruleId} applied`,
  };

  debugInfo.result = result;

  return { result, debug: debugInfo };
}

export function checkPolicyMatch(context: PolicyEvaluationContext, ruleId: string): boolean {
  const rules = getActivePolicyRules();
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return false;

  const result = evaluateRule(rule, context);
  return result.matched;
}