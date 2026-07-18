export type SecurityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SecurityCategory =
  | 'network'
  | 'auth'
  | 'config'
  | 'filesystem'
  | 'command'
  | 'secrets'
  | 'plugin'
  | 'channel'
  | 'regex'
  | 'external'
  | 'code';

export type SecurityFinding = {
  id: string;
  title: string;
  severity: SecurityLevel;
  category: SecurityCategory;
  description: string;
  recommendation: string;
  autoFixable?: boolean;
  metadata?: Record<string, unknown>;
};

export type SecuritySummary = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
};

export type SecurityResult = {
  findings: SecurityFinding[];
  summary: SecuritySummary;
  passed: boolean;
};

export type SecurityRating = 'safe' | 'low_risk' | 'medium_risk' | 'high_risk' | 'critical_risk';

export type PathSecurityCheckResult = {
  safe: boolean;
  reason?: string;
  risk?: SecurityLevel;
  details?: string[];
};

export type PluginTrustLevel = 'trusted' | 'verified' | 'unknown' | 'untrusted';

export type PluginTrustResult = {
  level: PluginTrustLevel;
  reasons: string[];
  warnings: string[];
};

export type InstallPolicyDecision = 'allow' | 'deny' | 'review';

export type InstallPolicyResult = {
  decision: InstallPolicyDecision;
  reasons: string[];
  findings: SecurityFinding[];
};

export type ContextVisibilityMode = 'all' | 'allowlist' | 'allowlist_quote' | 'none';

export type ContextVisibilityKind = 'history' | 'thread' | 'quote' | 'forwarded';

export type ContextVisibilityDecision = {
  include: boolean;
  reason: string;
};

export type ExternalContentSource =
  | 'email'
  | 'webhook'
  | 'api'
  | 'browser'
  | 'channel_metadata'
  | 'web_search'
  | 'web_fetch'
  | 'unknown';

export type UrlSecurityCheckResult = {
  safe: boolean;
  risk: SecurityLevel;
  reasons: string[];
  category: SecurityCategory;
};

export type ConfigSecurityRating = {
  rating: SecurityRating;
  score: number;
  findings: SecurityFinding[];
  dangerousFlags: string[];
};

export type ToolSecurityClassification = 'safe' | 'caution' | 'dangerous' | 'critical';

export type ToolSecurityInfo = {
  name: string;
  classification: ToolSecurityClassification;
  description: string;
  requiresApproval: boolean;
  categories: string[];
};
