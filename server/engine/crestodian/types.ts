import { z } from 'zod';

export const crestodianStatusSchema = z.enum(['healthy', 'degraded', 'critical', 'unknown']);
export type CrestodianStatus = z.infer<typeof crestodianStatusSchema>;

export const crestodianSeveritySchema = z.enum(['info', 'warning', 'error', 'critical']);
export type CrestodianSeverity = z.infer<typeof crestodianSeveritySchema>;

export const crestodianOperationTypeSchema = z.enum([
  'inspect',
  'repair',
  'restart',
  'reset',
  'backup',
  'restore',
  'cleanup',
  'migrate',
  'validate',
  'diagnose',
]);
export type CrestodianOperationType = z.infer<typeof crestodianOperationTypeSchema>;

export interface CrestodianProbeResult {
  name: string;
  status: CrestodianStatus;
  message: string;
  details?: Record<string, unknown>;
  durationMs: number;
  timestamp: string;
}

export interface CrestodianOverview {
  id: string;
  generatedAt: string;
  status: CrestodianStatus;
  version: string;
  platform: string;
  uptimeMs: number;
  probes: CrestodianProbeResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    critical: number;
  };
  recentOperations: CrestodianAuditEntry[];
  activeRescues: number;
}

export interface CrestodianAuditEntry {
  id: string;
  timestamp: string;
  operation: CrestodianOperationType;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  initiator: 'system' | 'user' | 'automatic';
  message: string;
  durationMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface CrestodianRescueMessage {
  id: string;
  timestamp: string;
  severity: CrestodianSeverity;
  title: string;
  message: string;
  probeName?: string;
  suggestedAction?: string;
  acknowledged: boolean;
  autoRecoverable: boolean;
}

export interface CrestodianRescuePolicy {
  enabled: boolean;
  autoRecover: boolean;
  maxAttempts: number;
  cooldownMs: number;
  rules: Array<{
    probeName: string;
    minSeverity: CrestodianSeverity;
    action: CrestodianOperationType;
    enabled: boolean;
  }>;
}

export interface CrestodianDialogueMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface CrestodianAssistantPlan {
  operation: CrestodianOperationType;
  target?: string;
  reason: string;
  confidence: number;
  steps: string[];
  risks: string[];
}

export interface CrestodianOperationResult {
  success: boolean;
  operation: CrestodianOperationType;
  message: string;
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export type CrestodianBackend = 'tui' | 'cli' | 'api' | 'embedded';
