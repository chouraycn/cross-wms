import { logger } from '../../logger.js';
import type {
  PolicyRule,
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  PolicyEngineConfig,
  PolicyQuery,
  PolicySummary,
  PolicyValidationResult,
} from './policy-types.js';
import { DEFAULT_POLICY_ENGINE_CONFIG } from './policy-types.js';
import {
  addPolicyRule,
  addPolicyRules,
  getPolicyRule,
  getAllPolicyRules,
  updatePolicyRule,
  deletePolicyRule,
  enablePolicyRule,
  disablePolicyRule,
  getActivePolicyRules,
  queryPolicyRules,
  getPolicySummary,
  validatePolicyRule,
} from './policy-store.js';
import { evaluatePolicy, evaluatePolicyWithDebug, checkPolicyMatch } from './policy-evaluator.js';

class PolicyEngine {
  private config: PolicyEngineConfig;
  private initialized = false;
  private defaultPoliciesLoaded = false;

  constructor(config?: Partial<PolicyEngineConfig>) {
    this.config = { ...DEFAULT_POLICY_ENGINE_CONFIG, ...config };
  }

  initialize(): void {
    if (this.initialized) {
      logger.debug('[Security:PolicyEngine] Already initialized');
      return;
    }

    this.loadDefaultPolicies();
    this.initialized = true;
    logger.info('[Security:PolicyEngine] Initialized');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getConfig(): PolicyEngineConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<PolicyEngineConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug(`[Security:PolicyEngine] Updated config: ${JSON.stringify(this.config)}`);
  }

  evaluate(context: PolicyEvaluationContext): PolicyEvaluationResult {
    if (!this.initialized) {
      logger.warn('[Security:PolicyEngine] Engine not initialized, initializing now');
      this.initialize();
    }

    const result = evaluatePolicy(context, undefined, this.config.conflictResolution, this.config.defaultEffect);

    if (this.config.enableLogging) {
      logger.debug(`[Security:PolicyEngine] Evaluation result: ${result.effect}, matched ${result.matchedRules.length} rules`);
    }

    if (this.config.enableAudit) {
      this.logAuditEvent(context, result);
    }

    return result;
  }

  evaluateWithDebug(context: PolicyEvaluationContext): { result: PolicyEvaluationResult; debug: Record<string, unknown> } {
    if (!this.initialized) {
      this.initialize();
    }

    return evaluatePolicyWithDebug(context);
  }

  addRule(rule: PolicyRule): boolean {
    const success = addPolicyRule(rule);
    if (success && this.config.enableLogging) {
      logger.debug(`[Security:PolicyEngine] Added policy rule: ${rule.id}`);
    }
    return success;
  }

  addRules(rules: PolicyRule[]): number {
    const count = addPolicyRules(rules);
    if (count > 0 && this.config.enableLogging) {
      logger.debug(`[Security:PolicyEngine] Added ${count} policy rules`);
    }
    return count;
  }

  getRule(id: string): PolicyRule | undefined {
    return getPolicyRule(id);
  }

  getAllRules(): PolicyRule[] {
    return getAllPolicyRules();
  }

  updateRule(id: string, updates: Partial<PolicyRule>): boolean {
    const success = updatePolicyRule(id, updates);
    if (success && this.config.enableLogging) {
      logger.debug(`[Security:PolicyEngine] Updated policy rule: ${id}`);
    }
    return success;
  }

  deleteRule(id: string): boolean {
    const success = deletePolicyRule(id);
    if (success && this.config.enableLogging) {
      logger.debug(`[Security:PolicyEngine] Deleted policy rule: ${id}`);
    }
    return success;
  }

  enableRule(id: string): boolean {
    const success = enablePolicyRule(id);
    if (success && this.config.enableLogging) {
      logger.debug(`[Security:PolicyEngine] Enabled policy rule: ${id}`);
    }
    return success;
  }

  disableRule(id: string): boolean {
    const success = disablePolicyRule(id);
    if (success && this.config.enableLogging) {
      logger.debug(`[Security:PolicyEngine] Disabled policy rule: ${id}`);
    }
    return success;
  }

  getActiveRules(): PolicyRule[] {
    return getActivePolicyRules();
  }

  queryRules(query: PolicyQuery): PolicyRule[] {
    return queryPolicyRules(query);
  }

  getSummary(): PolicySummary {
    return getPolicySummary();
  }

  validateRule(rule: PolicyRule): PolicyValidationResult {
    return validatePolicyRule(rule);
  }

  checkMatch(context: PolicyEvaluationContext, ruleId: string): boolean {
    return checkPolicyMatch(context, ruleId);
  }

  loadDefaultPolicies(): void {
    if (this.defaultPoliciesLoaded) return;

    const defaultPolicies: PolicyRule[] = [
      {
        id: 'policy-block-eval',
        name: 'Block eval() usage',
        description: 'Blocks code execution using eval() function',
        conditions: [{ field: 'request.content', operator: 'contains', value: 'eval(' }],
        effect: 'deny',
        actions: [{ type: 'block', message: 'eval() is not allowed' }],
        priority: 10,
        category: 'security',
        status: 'active',
        tags: ['code-execution', 'dangerous'],
      },
      {
        id: 'policy-block-path-traversal',
        name: 'Block path traversal',
        description: 'Blocks path traversal attempts',
        conditions: [
          { field: 'request.path', operator: 'contains', value: '../' },
          { field: 'request.path', operator: 'contains', value: '..\\' },
        ],
        effect: 'deny',
        actions: [{ type: 'block', message: 'Path traversal is not allowed' }],
        priority: 10,
        category: 'filesystem',
        status: 'active',
        tags: ['path-traversal', 'security'],
      },
      {
        id: 'policy-allow-localhost',
        name: 'Allow localhost access',
        description: 'Allows access to localhost for development purposes',
        conditions: [{ field: 'request.host', operator: 'matches_regex', value: '^localhost$|^127\\.0\\.0\\.1$|^::1$' }],
        effect: 'allow',
        actions: [{ type: 'log', message: 'Allowed localhost access' }],
        priority: 5,
        category: 'network',
        status: 'active',
        tags: ['localhost', 'development'],
      },
      {
        id: 'policy-block-secret-exposure',
        name: 'Block secret exposure',
        description: 'Blocks messages containing potential secrets',
        conditions: [
          { field: 'request.content', operator: 'matches_regex', value: 'api[_-]?key[^\\s]*=[^\\s]*[a-zA-Z0-9]{20,}' },
          { field: 'request.content', operator: 'matches_regex', value: 'secret[^\\s]*=[^\\s]*[a-zA-Z0-9]{16,}' },
          { field: 'request.content', operator: 'matches_regex', value: 'password[^\\s]*=[^\\s]*[a-zA-Z0-9]{8,}' },
        ],
        effect: 'deny',
        actions: [{ type: 'quarantine', message: 'Potential secret exposure detected' }],
        priority: 9,
        category: 'data_protection',
        status: 'active',
        tags: ['secrets', 'data-protection'],
      },
      {
        id: 'policy-audit-dangerous-tools',
        name: 'Audit dangerous tool usage',
        description: 'Logs usage of dangerous tools',
        conditions: [{ field: 'request.tool', operator: 'in', value: ['exec', 'spawn', 'shell', 'eval'] }],
        effect: 'allow',
        actions: [{ type: 'audit', message: 'Dangerous tool usage detected' }, { type: 'log', message: 'Dangerous tool used' }],
        priority: 7,
        category: 'audit',
        status: 'active',
        tags: ['tools', 'audit'],
      },
    ];

    const added = addPolicyRules(defaultPolicies);
    this.defaultPoliciesLoaded = true;
    logger.info(`[Security:PolicyEngine] Loaded ${added} default policies`);
  }

  reset(): void {
    this.initialized = false;
    this.defaultPoliciesLoaded = false;
    logger.info('[Security:PolicyEngine] Reset');
  }

  private logAuditEvent(context: PolicyEvaluationContext, result: PolicyEvaluationResult): void {
    const auditData = {
      timestamp: Date.now(),
      context: {
        resource: context.resource,
        action: context.action,
        subject: context.subject,
      },
      result: {
        allowed: result.allowed,
        effect: result.effect,
        matchedRules: result.matchedRules,
      },
    };
    logger.debug(`[Security:PolicyEngine] Audit event: ${JSON.stringify(auditData)}`);
  }
}

const policyEngine = new PolicyEngine();

export function getPolicyEngine(): PolicyEngine {
  return policyEngine;
}

export function initializePolicyEngine(config?: Partial<PolicyEngineConfig>): void {
  if (config) {
    policyEngine.setConfig(config);
  }
  policyEngine.initialize();
}

export function evaluatePolicyRule(context: PolicyEvaluationContext): PolicyEvaluationResult {
  return policyEngine.evaluate(context);
}

export function addSecurityPolicy(rule: PolicyRule): boolean {
  return policyEngine.addRule(rule);
}

export function removeSecurityPolicy(id: string): boolean {
  return policyEngine.deleteRule(id);
}

export function getSecurityPolicy(id: string): PolicyRule | undefined {
  return policyEngine.getRule(id);
}

export function getAllSecurityPolicies(): PolicyRule[] {
  return policyEngine.getAllRules();
}

export function getActiveSecurityPolicies(): PolicyRule[] {
  return policyEngine.getActiveRules();
}

export function enableSecurityPolicy(id: string): boolean {
  return policyEngine.enableRule(id);
}

export function disableSecurityPolicy(id: string): boolean {
  return policyEngine.disableRule(id);
}

export function getPolicyEngineSummary(): PolicySummary {
  return policyEngine.getSummary();
}