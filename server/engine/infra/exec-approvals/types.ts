export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type ApprovalLevel = 'none' | 'once' | 'session' | 'always' | 'never';

export type ExecApproval = {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  status: ApprovalStatus;
  level: ApprovalLevel;
  createdAt: number;
  expiresAt?: number;
  approvedAt?: number;
  rejectedAt?: number;
  reason?: string;
  requester?: string;
  approver?: string;
};

export type ExecApprovalRequest = {
  command: string;
  args: string[];
  cwd?: string;
  requester?: string;
  reason?: string;
};

export type ExecSafetyCheckResult = {
  safe: boolean;
  reason?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  checks: string[];
  warnings: string[];
};

export type SafeBinPolicy = {
  allowedBins: string[];
  blockedBins: string[];
  allowedPaths: string[];
  blockedPaths: string[];
  requireApprovalFor: string[];
};

export type UnixSocketMessage =
  | { type: 'approval_request'; data: ExecApprovalRequest; requestId: string }
  | { type: 'approval_response'; data: { approvalId: string; status: ApprovalStatus; reason?: string }; requestId: string }
  | { type: 'approval_query'; data: { approvalId: string }; requestId: string }
  | { type: 'approval_list'; data: { limit?: number; offset?: number }; requestId: string }
  | { type: 'error'; data: { message: string }; requestId: string };

export type UnixSocketResponse = {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
};
