// 移植自 openclaw/src/infra/exec-approvals-test-helpers.ts（降级实现）
// exec 审批测试辅助函数。
// 注意：cross-wms 不创建测试文件，此文件仅提供类型与辅助函数供运行时使用。
import type {
  ExecApprovalRequest,
  ExecApprovalResolved,
  ExecApprovalsFile,
  ExecApprovalsSnapshot,
} from "./exec-approvals.js";

/** 构建 exec 审批请求（辅助函数） */
export function buildTestExecApprovalRequest(params: {
  id?: string;
  command: string;
  cwd?: string;
  host?: "local" | "node";
  sessionKey?: string;
  createdAtMs?: number;
  expiresAtMs?: number;
}): ExecApprovalRequest {
  const nowMs = params.createdAtMs ?? Date.now();
  return {
    id: params.id ?? `test-approval-${nowMs}`,
    request: {
      command: params.command,
      cwd: params.cwd,
      host: params.host ?? "local",
      sessionKey: params.sessionKey,
    },
    createdAtMs: nowMs,
    expiresAtMs: params.expiresAtMs ?? nowMs + 60_000,
  } as ExecApprovalRequest;
}

/** 构建 exec 审批决议（辅助函数） */
export function buildTestExecApprovalResolved(params: {
  id: string;
  decision: "allow-once" | "allow-always" | "deny";
  resolvedAtMs?: number;
}): ExecApprovalResolved {
  return {
    id: params.id,
    decision: params.decision,
    resolvedAtMs: params.resolvedAtMs ?? Date.now(),
  } as unknown as ExecApprovalResolved;
}

/** 构建 exec 审批文件（辅助函数） */
export function buildTestExecApprovalsFile(params?: {
  security?: "deny" | "allowlist" | "full";
  ask?: "off" | "on-miss" | "always";
  allowlist?: unknown[];
}): ExecApprovalsFile {
  return {
    version: 1,
    security: params?.security ?? "allowlist",
    ask: params?.ask ?? "on-miss",
    allowlist: params?.allowlist ?? [],
  } as ExecApprovalsFile;
}

/** 构建 exec 审批快照（辅助函数） */
export function buildTestExecApprovalsSnapshot(params?: {
  file?: ExecApprovalsFile;
}): ExecApprovalsSnapshot {
  return {
    file: params?.file ?? buildTestExecApprovalsFile(),
    path: "/tmp/test-exec-approvals.json",
  } as ExecApprovalsSnapshot;
}
