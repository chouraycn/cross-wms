export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'quarantined' | 'stale';
export type ProposalType = 'create' | 'update';

export interface ProposalOrigin {
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  messageId?: string;
}

export interface ProposalScanFinding {
  level: string;
  type: string;
  description: string;
}

export interface ProposalScan {
  critical: number;
  warn: number;
  info: number;
  findings: ProposalScanFinding[];
}

export interface ProposalRollback {
  previousContentHash: string;
  previousContent: string;
  appliedAt: number;
}

export interface SkillProposal {
  id: string;
  type: ProposalType;
  skillName: string;
  skillPath: string;
  content: string;
  contentHash: string;
  currentContentHash?: string;
  status: ProposalStatus;
  origin?: ProposalOrigin;
  scan: ProposalScan;
  rollback?: ProposalRollback;
  createdAt: number;
  updatedAt: number;
  appliedAt?: number;
  rejectedAt?: number;
  reviewNote?: string;
}

export interface ProposalFilter {
  status?: ProposalStatus;
  type?: ProposalType;
  skillName?: string;
}

export interface ProposalStats {
  total: number;
  byStatus: Record<ProposalStatus, number>;
  byType: Record<ProposalType, number>;
}

export interface CreateProposalParams {
  type: ProposalType;
  skillName: string;
  skillPath?: string;
  content: string;
  origin?: ProposalOrigin;
}

export type InstallProgressType = 'progress' | 'result' | 'error' | 'warning' | 'log';

export interface InstallProgress {
  type: InstallProgressType;
  step?: string;
  stepName?: string;
  stepTotal?: number;
  stepCurrent?: number;
  progress?: number;
  message?: string;
  result?: unknown;
  error?: string;
  eta?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  skillName?: string;
  version?: string;
  warning?: string;
  logLevel?: 'info' | 'warn' | 'error';
}

export type InstallStatus = 'pending' | 'downloading' | 'extracting' | 'installing' | 'scanning' | 'completed' | 'failed' | 'cancelled';

export interface InstallResult {
  installId: string;
  success: boolean;
  skillName?: string;
  version?: string;
  error?: string;
  warnings?: string[];
}