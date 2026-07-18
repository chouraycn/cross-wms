// 移植自 openclaw/src/infra/exec-approval-session-target.ts（降级实现）
// 从会话和 turn source 解析审批交付目标。
import { normalizeOptionalString } from "./string-coerce.js";
import type { OpenClawConfig } from "./_runtime-stubs.js";
import type { ExecApprovalRequest } from "./exec-approvals.js";
import type { PluginApprovalRequest } from "./plugin-approvals.js";

export type ExecApprovalSessionTarget = {
  channel?: string;
  to: string;
  accountId?: string;
  threadId?: string | number;
};

export type ApprovalRequestSessionConversation = {
  channel: string;
  kind: "group" | "channel";
  id: string;
  rawId: string;
  threadId?: string;
  baseSessionKey: string;
  baseConversationId: string;
  parentConversationCandidates: string[];
};

type ApprovalRequestLike = ExecApprovalRequest | PluginApprovalRequest;

function normalizeOptionalThreadValue(value?: string | number | null): string | number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function isExecApprovalRequest(request: ApprovalRequestLike): request is ExecApprovalRequest {
  return "command" in request.request;
}

function toExecLikeApprovalRequest(request: ApprovalRequestLike): ExecApprovalRequest {
  if (isExecApprovalRequest(request)) return request;
  return {
    id: request.id,
    request: {
      command: request.request.title,
      sessionKey: request.request.sessionKey ?? undefined,
      turnSourceChannel: request.request.turnSourceChannel ?? undefined,
      turnSourceTo: request.request.turnSourceTo ?? undefined,
      turnSourceAccountId: request.request.turnSourceAccountId ?? undefined,
      turnSourceThreadId: request.request.turnSourceThreadId ?? undefined,
    },
    createdAtMs: request.createdAtMs,
    expiresAtMs: request.expiresAtMs,
  };
}

function normalizeOptionalChannel(value?: string | null): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ?? undefined;
}

/**
 * 解析审批请求会话键中编码的会话。
 * 降级实现：openclaw 的 ../channels/plugins/session-conversation.js 未移植，返回 null。
 */
export function resolveApprovalRequestSessionConversation(_params: {
  request: ApprovalRequestLike;
  channel?: string | null;
  bundledFallback?: boolean;
}): ApprovalRequestSessionConversation | null {
  return null;
}

/**
 * 解析 exec 审批请求的最佳已知消息目标。
 * 降级实现：openclaw 的 ./outbound/targets.js、./approval-request-account-binding.js 未移植，返回 null。
 */
export function resolveExecApprovalSessionTarget(_params: {
  cfg: OpenClawConfig;
  request: ExecApprovalRequest;
  turnSourceChannel?: string | null;
  turnSourceTo?: string | null;
  turnSourceAccountId?: string | null;
  turnSourceThreadId?: string | number | null;
}): ExecApprovalSessionTarget | null {
  return null;
}

/** 解析 exec 或 plugin 审批请求的最佳已知消息目标。 */
export function resolveApprovalRequestSessionTarget(params: {
  cfg: OpenClawConfig;
  request: ApprovalRequestLike;
}): ExecApprovalSessionTarget | null {
  const execLikeRequest = toExecLikeApprovalRequest(params.request);
  return resolveExecApprovalSessionTarget({ cfg: params.cfg, request: execLikeRequest });
}

/**
 * 当 live 和 stored 绑定一致时解析通道特定的 origin target。
 * 降级实现：依赖未移植的 doesApprovalRequestMatchChannelAccount，返回 null。
 */
export function resolveApprovalRequestOriginTarget<TTarget>(
  _params: {
    cfg: OpenClawConfig;
    request: ApprovalRequestLike;
    channel: string;
    accountId?: string | null;
    resolveTurnSourceTarget: (request: ApprovalRequestLike) => TTarget | null;
    resolveSessionTarget: (sessionTarget: ExecApprovalSessionTarget) => TTarget | null;
    targetsMatch: (a: TTarget, b: TTarget) => boolean;
    resolveFallbackTarget?: (request: ApprovalRequestLike) => TTarget | null;
  },
): TTarget | null {
  return null;
}

export { normalizeOptionalThreadValue, normalizeOptionalChannel };
