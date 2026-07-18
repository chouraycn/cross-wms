export interface BackfillSource {
  type: 'file' | 'database' | 'api' | 'json';
  path?: string;
  connectionString?: string;
  url?: string;
  data?: unknown[];
}

export interface BackfillOptions {
  source: BackfillSource;
  dryRun?: boolean;
  batchSize?: number;
  skipExisting?: boolean;
  validateData?: boolean;
}

export interface BackfillResult {
  success: boolean;
  totalProcessed: number;
  totalCreated: number;
  totalUpdated: number;
  totalSkipped: number;
  totalFailed: number;
  errors: string[];
  dryRun: boolean;
}

export interface BackfillStats {
  totalSessions: number;
  messagesPerSession: number;
  avgMessageSizeBytes: number;
  totalSizeBytes: number;
  durationMs: number;
}