// 移植自 openclaw/src/infra/approval-handler.test-helpers.ts（降级实现）
// 审批 handler 测试辅助函数。
// 注意：cross-wms 不创建测试文件，此文件仅提供辅助函数供运行时使用。
import type { ApprovalRequest, ApprovalResolved } from "./approval-handler-runtime-types.js";

/** 构建测试审批请求（辅助函数） */
export function buildTestApprovalRequest(params: {
  id?: string;
  kind?: "exec" | "plugin";
  command?: string;
  title?: string;
  createdAtMs?: number;
  expiresAtMs?: number;
}): ApprovalRequest {
  const nowMs = params.createdAtMs ?? Date.now();
  const id = params.id ?? `test-approval-${nowMs}`;
  if (params.kind === "plugin") {
    return {
      id,
      request: {
        title: params.title ?? "Test plugin approval",
        description: "",
      },
      createdAtMs: nowMs,
      expiresAtMs: params.expiresAtMs ?? nowMs + 60_000,
    } as ApprovalRequest;
  }
  return {
    id,
    request: {
      command: params.command ?? "echo test",
    },
    createdAtMs: nowMs,
    expiresAtMs: params.expiresAtMs ?? nowMs + 60_000,
  } as ApprovalRequest;
}

/** 构建测试审批决议（辅助函数） */
export function buildTestApprovalResolved(params: {
  id: string;
  decision: "allow-once" | "allow-always" | "deny";
  resolvedAtMs?: number;
}): ApprovalResolved {
  return {
    id: params.id,
    decision: params.decision,
    ts: params.resolvedAtMs ?? Date.now(),
  } as ApprovalResolved;
}
