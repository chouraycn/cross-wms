export type PolicyConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'matches_regex'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';

export type PolicyCondition = {
  field: string;
  operator: PolicyConditionOperator;
  value: unknown;
  caseSensitive?: boolean;
};

export type PolicyEffect = 'allow' | 'deny';

export type PolicyAction = {
  type: 'log' | 'block' | 'warn' | 'redirect' | 'notify' | 'audit' | 'quarantine';
  message?: string;
  target?: string;
};

export type PolicyPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type PolicyCategory =
  | 'security'
  | 'compliance'
  | 'access_control'
  | 'data_protection'
  | 'audit'
  | 'network'
  | 'filesystem'
  | 'plugin'
  | 'model'
  | 'custom';

export type PolicyStatus = 'active' | 'disabled' | 'draft';

export type PolicyRule = {
  id: string;
  name: string;
  description?: string;
  conditions: PolicyCondition[];
  effect: PolicyEffect;
  actions: PolicyAction[];
  priority: PolicyPriority;
  category: PolicyCategory;
  status: PolicyStatus;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
};

export type PolicySet = {
  id: string;
  name: string;
  description?: string;
  rules: PolicyRule[];
  priority: PolicyPriority;
  status: PolicyStatus;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
};

export type PolicyEvaluationContext = {
  resource?: string;
  action?: string;
  subject?: string;
  environment?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  request?: Record<string, unknown>;
};

export type PolicyEvaluationResult = {
  allowed: boolean;
  effect: PolicyEffect;
  matchedRules: string[];
  actions: PolicyAction[];
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type PolicyStoreOptions = {
  maxPolicies?: number;
  persistToDisk?: boolean;
  filePath?: string;
};

export type PolicyConflictResolution = 'deny_overrides' | 'allow_overrides' | 'priority_based' | 'first_match';

export type PolicyEngineConfig = {
  conflictResolution: PolicyConflictResolution;
  defaultEffect: PolicyEffect;
  enableLogging: boolean;
  enableAudit: boolean;
};

export type PolicyValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type PolicyChangeEvent = {
  type: 'created' | 'updated' | 'deleted' | 'enabled' | 'disabled';
  policyId: string;
  timestamp: number;
  actor?: string;
};

export type PolicyQuery = {
  category?: PolicyCategory;
  status?: PolicyStatus;
  priority?: PolicyPriority;
  tags?: string[];
  search?: string;
};

export type PolicySummary = {
  totalPolicies: number;
  activePolicies: number;
  disabledPolicies: number;
  draftPolicies: number;
  policiesByCategory: Record<PolicyCategory, number>;
  policiesByPriority: Record<number, number>;
};

export const DEFAULT_POLICY_ENGINE_CONFIG: PolicyEngineConfig = {
  conflictResolution: 'deny_overrides',
  defaultEffect: 'deny',
  enableLogging: true,
  enableAudit: true,
};

export const DEFAULT_POLICY_STORE_OPTIONS: PolicyStoreOptions = {
  maxPolicies: 1000,
  persistToDisk: false,
  filePath: '',
};