/**
 * 执行审批类型定义 — 参考 OpenClaw infra/exec-approvals.types.ts
 *
 * 定义审批流程中使用的核心数据结构和枚举类型。
 */

export type ExecHost = 'sandbox' | 'gateway' | 'node';
export type ExecTarget = 'auto' | ExecHost;
export type ExecSecurity = 'deny' | 'allowlist' | 'full';
export type ExecAsk = 'off' | 'on-miss' | 'always';
export type ExecMode = 'deny' | 'allowlist' | 'ask' | 'auto' | 'full';

export type ExecApprovalDecision = 'allow' | 'allow-once' | 'deny' | 'allow-always';

export type ExecApprovalUnavailableDecision = 'allow-always' | 'allow-once';

export interface ExecAllowlistEntry {
  id?: string;
  pattern: string;
  source?: 'allow-always';
  commandText?: string;
  argPattern?: string;
  lastUsedAt?: number;
  lastUsedCommand?: string;
  lastResolvedPath?: string;
}

export interface SystemRunApprovalBinding {
  argv: string[];
  cwd: string | null;
  agentId: string | null;
  sessionKey: string | null;
  envHash: string | null;
}

export interface SystemRunApprovalFileOperand {
  argvIndex: number;
  path: string;
  sha256: string;
}

export interface SystemRunApprovalPlan {
  argv: string[];
  cwd: string | null;
  commandText: string;
  commandPreview?: string | null;
  agentId: string | null;
  sessionKey: string | null;
  mutableFileOperand?: SystemRunApprovalFileOperand | null;
}

export interface ExecApprovalCommandSpan {
  startIndex: number;
  endIndex: number;
}

export interface ExecApprovalRequestPayload {
  command: string;
  commandPreview?: string | null;
  commandArgv?: string[];
  envKeys?: string[];
  systemRunBinding?: SystemRunApprovalBinding | null;
  systemRunPlan?: SystemRunApprovalPlan | null;
  cwd?: string | null;
  nodeId?: string | null;
  host?: string | null;
  security?: string | null;
  ask?: string | null;
  warningText?: string | null;
  commandSpans?: ExecApprovalCommandSpan[];
  unavailableDecisions?: readonly ExecApprovalUnavailableDecision[];
  allowedDecisions?: readonly ExecApprovalDecision[];
  agentId?: string | null;
  resolvedPath?: string | null;
  sessionKey?: string | null;
  turnSourceChannel?: string | null;
  turnSourceTo?: string | null;
  turnSourceAccountId?: string | null;
  turnSourceThreadId?: string | number | null;
}

export interface ExecApprovalRequest {
  id: string;
  request: ExecApprovalRequestPayload;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface ExecApprovalResolved {
  id: string;
  decision: ExecApprovalDecision;
  resolvedBy?: string | null;
  ts: number;
  request?: ExecApprovalRequest['request'];
}

export interface ExecApprovalsDefaults {
  security?: ExecSecurity;
  ask?: ExecAsk;
  askFallback?: ExecSecurity;
  autoAllowSkills?: boolean;
}

export interface ExecApprovalsAgent extends ExecApprovalsDefaults {
  allowlist?: ExecAllowlistEntry[];
}

export interface ExecApprovalsFile {
  version: 1;
  socket?: {
    path?: string;
    token?: string;
  };
  defaults?: ExecApprovalsDefaults;
  agents?: Record<string, ExecApprovalsAgent>;
}

export interface ExecApprovalsSnapshot {
  path: string;
  exists: boolean;
  raw: string | null;
  file: ExecApprovalsFile;
  hash: string;
}

export interface ExecApprovalsResolved {
  path: string;
  socketPath: string;
  token: string;
  defaults: Required<ExecApprovalsDefaults>;
  agent: Required<ExecApprovalsDefaults>;
  agentSources: {
    security: string | null;
    ask: string | null;
    askFallback: string | null;
  };
  allowlist: ExecAllowlistEntry[];
  file: ExecApprovalsFile;
}

export interface ExecApprovalsDefaultOverrides {
  security?: ExecSecurity;
  ask?: ExecAsk;
  askFallback?: ExecSecurity;
  autoAllowSkills?: boolean;
  requireSocket?: boolean;
}