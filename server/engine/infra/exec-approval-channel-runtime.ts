// 移植自 openclaw/src/infra/exec-approval-channel-runtime.ts（降级实现）
// channel-native exec 审批运行时实现。
import type { ExecApprovalChannelRuntime, ExecApprovalChannelRuntimeEventKind } from "./exec-approval-channel-runtime.types.js";
import type { ExecApprovalRequest, ExecApprovalResolved } from "./exec-approvals.js";

export type { ExecApprovalChannelRuntime, ExecApprovalChannelRuntimeEventKind };

/**
 * 创建 channel-native exec 审批运行时。
 * 降级实现：返回 noop 运行时，所有操作抛出错误或返回空。
 */
export function createExecApprovalChannelRuntime(_options?: {
  cfg?: unknown;
}): ExecApprovalChannelRuntime {
  return {
    start: async () => {},
    stop: async () => {},
    registerRequest: (_request: ExecApprovalRequest) => {},
    resolveRequest: async (_id: string, _decision: "allow-once" | "allow-always" | "deny") => {
      throw new Error("createExecApprovalChannelRuntime stub: not implemented");
    },
    getPendingRequests: () => [],
    getRequest: (_id: string) => undefined,
    on: (_event: ExecApprovalChannelRuntimeEventKind, _handler: (payload: unknown) => void) => () => {},
    off: (_event: ExecApprovalChannelRuntimeEventKind, _handler: (payload: unknown) => void) => {},
    emit: (_event: ExecApprovalChannelRuntimeEventKind, _payload: unknown) => {},
  } as unknown as ExecApprovalChannelRuntime;
}

/** 列出待处理的 exec 审批请求（降级：返回空） */
export function listPendingExecApprovalRequests(_runtime: ExecApprovalChannelRuntime): ExecApprovalRequest[] {
  return [];
}

/** 获取已决议的 exec 审批（降级：返回 undefined） */
export function getResolvedExecApproval(_runtime: ExecApprovalChannelRuntime, _id: string): ExecApprovalResolved | undefined {
  return undefined;
}
