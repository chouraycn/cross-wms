export interface ReconciliationIssue {
  id: string;
  type: 'missing_file' | 'missing_metadata' | 'inconsistent_status' | 'corrupted_file' | 'duplicate_entry';
  sessionId: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestedAction: 'create' | 'update' | 'delete' | 'repair';
}

export interface ReconciliationResult {
  success: boolean;
  totalChecked: number;
  issuesFound: number;
  issuesFixed: number;
  issuesIgnored: number;
  errors: string[];
  issues: ReconciliationIssue[];
}

export interface ReconciliationStats {
  totalSessions: number;
  consistentSessions: number;
  inconsistentSessions: number;
  missingFiles: number;
  missingMetadata: number;
  corruptedFiles: number;
  duplicateEntries: number;
  statusMismatches: number;
  lastRun: string | null;
  runCount: number;
}

export interface ReconciliationOptions {
  autoFix?: boolean;
  dryRun?: boolean;
  checkOnly?: boolean;
}