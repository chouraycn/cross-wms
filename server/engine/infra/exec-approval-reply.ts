// 移植自 openclaw/src/infra/exec-approval-reply.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecApprovalReplyDecision = unknown;
export type ExecApprovalUnavailableReason = unknown;
export type ExecApprovalReplyMetadata = unknown;
export type ExecApprovalActionDescriptor = unknown;
export type ExecApprovalPendingReplyParams = unknown;
export type ExecApprovalUnavailableReplyParams = unknown;
export function buildExecApprovalCommandText(...args: unknown[]): unknown {
  throw new Error("not implemented: buildExecApprovalCommandText");
}
export function buildExecApprovalActionDescriptors(...args: unknown[]): unknown {
  throw new Error("not implemented: buildExecApprovalActionDescriptors");
}
export function buildApprovalPresentationFromActionDescriptors(...args: unknown[]): unknown {
  throw new Error("not implemented: buildApprovalPresentationFromActionDescriptors");
}
export function buildApprovalPresentation(...args: unknown[]): unknown {
  throw new Error("not implemented: buildApprovalPresentation");
}
export function buildExecApprovalPresentation(...args: unknown[]): unknown {
  throw new Error("not implemented: buildExecApprovalPresentation");
}
export function buildApprovalInteractiveReplyFromActionDescriptors(...args: unknown[]): unknown {
  throw new Error("not implemented: buildApprovalInteractiveReplyFromActionDescriptors");
}
export function buildApprovalInteractiveReply(...args: unknown[]): unknown {
  throw new Error("not implemented: buildApprovalInteractiveReply");
}
export function buildExecApprovalInteractiveReply(...args: unknown[]): unknown {
  throw new Error("not implemented: buildExecApprovalInteractiveReply");
}
export function getExecApprovalApproverDmNoticeText(...args: unknown[]): unknown {
  throw new Error("not implemented: getExecApprovalApproverDmNoticeText");
}
export function parseExecApprovalCommandText(...args: unknown[]): unknown {
  throw new Error("not implemented: parseExecApprovalCommandText");
}
export function formatExecApprovalExpiresIn(...args: unknown[]): unknown {
  throw new Error("not implemented: formatExecApprovalExpiresIn");
}
export function getExecApprovalReplyMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: getExecApprovalReplyMetadata");
}
export function buildExecApprovalPendingReplyPayload(...args: unknown[]): unknown {
  throw new Error("not implemented: buildExecApprovalPendingReplyPayload");
}
export function buildExecApprovalUnavailableReplyPayload(...args: unknown[]): unknown {
  throw new Error("not implemented: buildExecApprovalUnavailableReplyPayload");
}
