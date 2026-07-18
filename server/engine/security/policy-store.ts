import { logger } from '../../logger.js';
import type {
  PolicyRule,
  PolicySet,
  PolicyQuery,
  PolicySummary,
  PolicyValidationResult,
  PolicyStoreOptions,
  PolicyChangeEvent,
  PolicyCategory,
  PolicyStatus,
  PolicyPriority,
} from './policy-types.js';
import { DEFAULT_POLICY_STORE_OPTIONS } from './policy-types.js';

class PolicyStore {
  private rules: Map<string, PolicyRule> = new Map();
  private sets: Map<string, PolicySet> = new Map();
  private options: PolicyStoreOptions;
  private changeListeners: Set<(event: PolicyChangeEvent) => void> = new Set();
  private version = 0;

  constructor(options?: Partial<PolicyStoreOptions>) {
    this.options = { ...DEFAULT_POLICY_STORE_OPTIONS, ...options };
    logger.debug('[Security:PolicyStore] Initialized');
  }

  getVersion(): number {
    return this.version;
  }

  addRule(rule: PolicyRule): boolean {
    if (this.rules.size >= this.options.maxPolicies!) {
      logger.warn('[Security:PolicyStore] Max policies exceeded');
      return false;
    }

    const validation = this.validateRule(rule);
    if (!validation.valid) {
      logger.warn(`[Security:PolicyStore] Invalid rule: ${validation.errors.join(', ')}`);
      return false;
    }

    const now = Date.now();
    const ruleWithTimestamps: PolicyRule = {
      ...rule,
      createdAt: rule.createdAt ?? now,
      updatedAt: now,
    };

    this.rules.set(rule.id, ruleWithTimestamps);
    this.version++;
    this.notifyChange({ type: 'created', policyId: rule.id, timestamp: now });

    logger.debug(`[Security:PolicyStore] Added rule: ${rule.id}`);
    return true;
  }

  addRules(rules: PolicyRule[]): number {
    let added = 0;
    for (const rule of rules) {
      if (this.addRule(rule)) added++;
    }
    return added;
  }

  getRule(id: string): PolicyRule | undefined {
    return this.rules.get(id);
  }

  getAllRules(): PolicyRule[] {
    return Array.from(this.rules.values());
  }

  updateRule(id: string, updates: Partial<PolicyRule>): boolean {
    const existing = this.rules.get(id);
    if (!existing) {
      logger.warn(`[Security:PolicyStore] Rule not found: ${id}`);
      return false;
    }

    const updated: PolicyRule = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    const validation = this.validateRule(updated);
    if (!validation.valid) {
      logger.warn(`[Security:PolicyStore] Invalid update: ${validation.errors.join(', ')}`);
      return false;
    }

    this.rules.set(id, updated);
    this.version++;
    this.notifyChange({ type: 'updated', policyId: id, timestamp: Date.now() });

    logger.debug(`[Security:PolicyStore] Updated rule: ${id}`);
    return true;
  }

  deleteRule(id: string): boolean {
    const existed = this.rules.has(id);
    if (existed) {
      this.rules.delete(id);
      this.version++;
      this.notifyChange({ type: 'deleted', policyId: id, timestamp: Date.now() });
      logger.debug(`[Security:PolicyStore] Deleted rule: ${id}`);
    }
    return existed;
  }

  enableRule(id: string): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;
    if (rule.status === 'active') return true;

    rule.status = 'active';
    rule.updatedAt = Date.now();
    this.version++;
    this.notifyChange({ type: 'enabled', policyId: id, timestamp: Date.now() });

    logger.debug(`[Security:PolicyStore] Enabled rule: ${id}`);
    return true;
  }

  disableRule(id: string): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;
    if (rule.status === 'disabled') return true;

    rule.status = 'disabled';
    rule.updatedAt = Date.now();
    this.version++;
    this.notifyChange({ type: 'disabled', policyId: id, timestamp: Date.now() });

    logger.debug(`[Security:PolicyStore] Disabled rule: ${id}`);
    return true;
  }

  addSet(set: PolicySet): boolean {
    const now = Date.now();
    const setWithTimestamps: PolicySet = {
      ...set,
      createdAt: set.createdAt ?? now,
      updatedAt: now,
    };

    this.sets.set(set.id, setWithTimestamps);
    this.version++;
    this.notifyChange({ type: 'created', policyId: set.id, timestamp: now });

    for (const rule of set.rules) {
      this.addRule(rule);
    }

    logger.debug(`[Security:PolicyStore] Added policy set: ${set.id}`);
    return true;
  }

  getSet(id: string): PolicySet | undefined {
    return this.sets.get(id);
  }

  getAllSets(): PolicySet[] {
    return Array.from(this.sets.values());
  }

  deleteSet(id: string): boolean {
    const set = this.sets.get(id);
    if (!set) return false;

    for (const rule of set.rules) {
      this.deleteRule(rule.id);
    }

    this.sets.delete(id);
    this.version++;
    this.notifyChange({ type: 'deleted', policyId: id, timestamp: Date.now() });

    logger.debug(`[Security:PolicyStore] Deleted policy set: ${id}`);
    return true;
  }

  queryRules(query: PolicyQuery): PolicyRule[] {
    let rules = this.getAllRules();

    if (query.category) {
      rules = rules.filter(r => r.category === query.category);
    }

    if (query.status) {
      rules = rules.filter(r => r.status === query.status);
    }

    if (query.priority !== undefined) {
      rules = rules.filter(r => r.priority === query.priority);
    }

    if (query.tags && query.tags.length > 0) {
      rules = rules.filter(r => r.tags && query.tags!.every(t => r.tags!.includes(t)));
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      rules = rules.filter(
        r =>
          r.name.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower) ||
          r.id.toLowerCase().includes(searchLower),
      );
    }

    return rules.sort((a, b) => b.priority - a.priority);
  }

  getActiveRules(): PolicyRule[] {
    return this.queryRules({ status: 'active' });
  }

  getRulesByCategory(category: PolicyCategory): PolicyRule[] {
    return this.queryRules({ category });
  }

  getRulesByPriority(priority: PolicyPriority): PolicyRule[] {
    return this.queryRules({ priority });
  }

  getSummary(): PolicySummary {
    const allRules = this.getAllRules();
    const categories: PolicyCategory[] = [
      'security',
      'compliance',
      'access_control',
      'data_protection',
      'audit',
      'network',
      'filesystem',
      'plugin',
      'model',
      'custom',
    ];

    return {
      totalPolicies: allRules.length,
      activePolicies: allRules.filter(r => r.status === 'active').length,
      disabledPolicies: allRules.filter(r => r.status === 'disabled').length,
      draftPolicies: allRules.filter(r => r.status === 'draft').length,
      policiesByCategory: Object.fromEntries(
        categories.map(cat => [cat, allRules.filter(r => r.category === cat).length]),
      ) as Record<PolicyCategory, number>,
      policiesByPriority: Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => [p, allRules.filter(r => r.priority === p).length]),
      ),
    };
  }

  validateRule(rule: PolicyRule): PolicyValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!rule.id || rule.id.length === 0) {
      errors.push('Rule ID is required');
    }

    if (!rule.name || rule.name.length === 0) {
      errors.push('Rule name is required');
    }

    if (!rule.effect || !['allow', 'deny'].includes(rule.effect)) {
      errors.push('Rule effect must be "allow" or "deny"');
    }

    if (!rule.category || !['security', 'compliance', 'access_control', 'data_protection', 'audit', 'network', 'filesystem', 'plugin', 'model', 'custom'].includes(rule.category)) {
      errors.push('Invalid rule category');
    }

    if (!rule.status || !['active', 'disabled', 'draft'].includes(rule.status)) {
      errors.push('Invalid rule status');
    }

    if (rule.priority < 0 || rule.priority > 10) {
      errors.push('Priority must be between 0 and 10');
    }

    if (rule.conditions.length === 0) {
      warnings.push('Rule has no conditions - will match all requests');
    }

    for (const condition of rule.conditions) {
      if (!condition.field) {
        errors.push('Condition field is required');
      }
      if (!condition.operator) {
        errors.push('Condition operator is required');
      }
    }

    if (rule.actions.length === 0) {
      warnings.push('Rule has no actions - will only set effect without additional actions');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  clear(): void {
    this.rules.clear();
    this.sets.clear();
    this.version++;
    logger.debug('[Security:PolicyStore] Cleared all policies');
  }

  subscribe(listener: (event: PolicyChangeEvent) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChange(event: PolicyChangeEvent): void {
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`[Security:PolicyStore] Listener error: ${errorMessage}`);
      }
    }
  }
}

const policyStore = new PolicyStore();

export function getPolicyStore(): PolicyStore {
  return policyStore;
}

export function addPolicyRule(rule: PolicyRule): boolean {
  return policyStore.addRule(rule);
}

export function addPolicyRules(rules: PolicyRule[]): number {
  return policyStore.addRules(rules);
}

export function getPolicyRule(id: string): PolicyRule | undefined {
  return policyStore.getRule(id);
}

export function getAllPolicyRules(): PolicyRule[] {
  return policyStore.getAllRules();
}

export function updatePolicyRule(id: string, updates: Partial<PolicyRule>): boolean {
  return policyStore.updateRule(id, updates);
}

export function deletePolicyRule(id: string): boolean {
  return policyStore.deleteRule(id);
}

export function enablePolicyRule(id: string): boolean {
  return policyStore.enableRule(id);
}

export function disablePolicyRule(id: string): boolean {
  return policyStore.disableRule(id);
}

export function getActivePolicyRules(): PolicyRule[] {
  return policyStore.getActiveRules();
}

export function queryPolicyRules(query: PolicyQuery): PolicyRule[] {
  return policyStore.queryRules(query);
}

export function getPolicySummary(): PolicySummary {
  return policyStore.getSummary();
}

export function validatePolicyRule(rule: PolicyRule): PolicyValidationResult {
  return policyStore.validateRule(rule);
}