// 审批原生辅助：将插件审批请求转换为宿主原生的审批记录。
// openclaw 原始实现从 ../../packages/normalization-core/src/string-coerce.js、
// ../config/types.approvals.js、../infra/approval-request-account-binding.js、
// ../infra/approval-request-filters.js、../infra/exec-approval-reply.js、
// ../infra/exec-approval-session-target.js、../infra/exec-approvals.js、
// ../infra/plugin-approvals.js、../routing/session-key.js、./channel-contract.js、
// ./channel-route.js、./config-runtime.js、./reply-payload.js 导入。
// 此处提供最小可用类型与桩函数，待依赖子系统移植后接入。

/** exec 审批转发模式。 */
export type ExecApprovalForwardingMode = "session" | "targets" | "both" | "off";

/** exec 审批转发配置。 */
export type ExecApprovalForwardingConfig = {
  enabled?: boolean | "auto";
  mode?: ExecApprovalForwardingMode | null;
  agentFilter?: string[];
  sessionFilter?: string[];
  targets?: unknown[];
};

/** exec 审批会话目标。 */
export type ExecApprovalSessionTarget = {
  channel?: string;
  accountId?: string | null;
  to?: string;
  threadId?: string | number | null;
};

/** 标准渠道原生审批目标。 */
export type NativeApprovalTarget = {
  /** 渠道本地目标 ID。 */
  to: string;
  /** 可选的渠道账户 ID。 */
  accountId?: string | null;
  /** 可选的目标内线程/话题 ID。 */
  threadId?: string | number | null;
};

/** 审批种类。 */
export type ApprovalKind = "exec" | "plugin";

/** 审批请求联合类型（最小结构）。 */
export type ApprovalRequest = {
  id: string;
  request: {
    command?: string;
    agentId?: string;
    sessionKey?: string;
    turnSourceAccountId?: string;
  };
};

/** 渠道审批转发资格参数。 */
export type ChannelApprovalForwardingEligibilityParams = {
  cfg: unknown;
  accountId?: string | null;
  approvalKind: ApprovalKind;
  request: ApprovalRequest;
};

/** 渠道审批潜在路由参数。 */
export type ChannelApprovalPotentialRouteParams = {
  cfg: unknown;
  accountId?: string | null;
  approvalKind: ApprovalKind;
  nativeSessionOnly?: boolean;
};

/** 渠道审批显式目标资格参数。 */
export type ChannelApprovalExplicitTargetEligibilityParams =
  ChannelApprovalForwardingEligibilityParams & {
    target: NativeApprovalTarget;
  };

/** 比较渠道原生审批目标，使用与出站路由相同的规范化。 */
// TODO: 依赖模块未移植，暂用本地桩
export function nativeApprovalTargetsMatch(params: {
  channel?: string | null;
  left: NativeApprovalTarget;
  right: NativeApprovalTarget;
}): boolean {
  return (
    params.left.to === params.right.to &&
    (params.left.accountId ?? null) === (params.right.accountId ?? null) &&
    (params.left.threadId ?? null) === (params.right.threadId ?? null)
  );
}

/** 判断渠道原生 exec 审批路由是否替换本地文本提示。 */
// TODO: 依赖模块未移植，暂用本地桩
export function shouldSuppressLocalNativeExecApprovalPrompt(_params: {
  cfg: unknown;
  accountId?: string | null;
  payload: unknown;
  hint?: unknown;
  isTransportEnabled?: (params: { cfg: unknown; accountId?: string | null }) => boolean;
  isNativeDeliveryEnabled?: (params: { cfg: unknown; accountId?: string | null }) => boolean;
  resolveApprovalConfig?: (params: unknown) => unknown;
  requireApprovalConfigEnabled?: boolean;
  enforceForwardingMode?: boolean;
  isSessionRouteEligible?: (params: unknown) => boolean;
  hasExactTargetProof?: boolean;
  fallbackAgentIdFromSessionKey?: boolean;
}): boolean {
  return false;
}

/** 从请求形状推断审批种类（调用方已知时优先使用传入值）。 */
export function resolveApprovalKind(
  request: ApprovalRequest,
  approvalKind?: ApprovalKind,
): ApprovalKind {
  if (approvalKind) {
    return approvalKind;
  }
  return "command" in request.request ? "exec" : "plugin";
}

/** 为具有自定义目标匹配逻辑的渠道构建可复用的转发门控。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelApprovalForwardingEvaluator(_params: {
  channel: string;
  isTransportEnabled: (params: { cfg: unknown; accountId?: string | null }) => boolean;
  hasMatchingTarget: (params: {
    cfg: unknown;
    config: ExecApprovalForwardingConfig;
    accountId?: string | null;
    target?: NativeApprovalTarget;
  }) => boolean;
  hasOriginOrSessionTarget: (params: {
    cfg: unknown;
    accountId?: string | null;
    request: ApprovalRequest;
  }) => boolean;
}): {
  canAnyPotentiallyRoute: (input: {
    cfg: unknown;
    accountId?: string | null;
    nativeSessionOnly?: boolean;
  }) => boolean;
  isExplicitTargetEligible: (input: ChannelApprovalExplicitTargetEligibilityParams) => boolean;
  isPotentialRoute: (input: ChannelApprovalPotentialRouteParams) => boolean;
  isSessionEligible: (input: ChannelApprovalForwardingEligibilityParams) => boolean;
  shouldHandleRequest: (input: {
    cfg: unknown;
    accountId?: string | null;
    approvalKind?: ApprovalKind;
    request: ApprovalRequest;
  }) => boolean;
} {
  return {
    canAnyPotentiallyRoute() {
      return false;
    },
    isExplicitTargetEligible() {
      return false;
    },
    isPotentialRoute() {
      return false;
    },
    isSessionEligible() {
      return false;
    },
    shouldHandleRequest() {
      return false;
    },
  };
}

/** 创建原生审批渠道路由门控。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createNativeApprovalChannelRouteGates<TTarget extends NativeApprovalTarget>(
  _params: {
    channel: string;
    defaultForwardingMode: ExecApprovalForwardingMode;
    isTransportEnabled: (params: { cfg: unknown; accountId?: string | null }) => boolean;
    listAccountIds: (cfg: unknown) => readonly string[];
    resolveDefaultAccountId: (cfg: unknown) => string;
    normalizeForwardTarget: (target: NativeApprovalTarget) => TTarget | null;
    resolveTurnSourceTarget: (request: ApprovalRequest) => TTarget | null;
    targetsMatch?: (left: TTarget, right: TTarget) => boolean;
  },
): {
  canApprovalPotentiallyRouteToChannel: (params: {
    cfg: unknown;
    accountId?: string | null;
    approvalKind: ApprovalKind;
    nativeSessionOnly?: boolean;
  }) => boolean;
  canAnyApprovalPotentiallyRouteToChannel: (params: {
    cfg: unknown;
    accountId?: string | null;
    nativeSessionOnly?: boolean;
  }) => boolean;
  isNativeApprovalHandlerConfigured: (params: {
    cfg: unknown;
    accountId?: string | null;
  }) => boolean;
  isSessionApprovalEligible: (params: ChannelApprovalForwardingEligibilityParams) => boolean;
  isExplicitTargetEligible: (params: ChannelApprovalExplicitTargetEligibilityParams) => boolean;
  shouldHandleApprovalRequest: (params: {
    cfg: unknown;
    accountId?: string | null;
    approvalKind?: ApprovalKind;
    request: ApprovalRequest;
  }) => boolean;
} {
  return {
    canApprovalPotentiallyRouteToChannel() {
      return false;
    },
    canAnyApprovalPotentiallyRouteToChannel() {
      return false;
    },
    isNativeApprovalHandlerConfigured() {
      return false;
    },
    isSessionApprovalEligible() {
      return false;
    },
    isExplicitTargetEligible() {
      return false;
    },
    shouldHandleApprovalRequest() {
      return false;
    },
  };
}

/** 创建回退抑制器，避免原生投递后出现重复审批提示。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createNativeApprovalForwardingFallbackSuppressor<
  TTarget extends NativeApprovalTarget,
>(_params: {
  channel: string;
  normalizeForwardTarget: (target: NativeApprovalTarget) => TTarget | null;
  resolveAccountId?: (params: unknown) => string | null | undefined;
  resolveApprovalKind?: (params: unknown) => ApprovalKind;
  isSessionRouteEligible: (params: ChannelApprovalForwardingEligibilityParams) => boolean;
  isExplicitTargetEligible?: (params: ChannelApprovalExplicitTargetEligibilityParams) => boolean;
  resolveForwardingTargetForMatch?: (params: unknown) => TTarget | null;
  resolveOriginTarget: (params: unknown) => TTarget | null;
  resolveApproverDmTargets: (params: unknown) => readonly TTarget[];
  targetsMatch?: (left: TTarget, right: TTarget) => boolean;
}): (input: unknown) => boolean {
  return () => false;
}

/** 使用标准原生审批目标匹配解析请求来源目标。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelNativeOriginTargetResolver<TTarget extends NativeApprovalTarget>(
  _params: unknown,
): (input: unknown) => TTarget | null {
  return () => null;
}

/** 创建已配置审批人 DM 目标的解析器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelApproverDmTargetResolver<
  TApprover,
  TTarget extends NativeApprovalTarget = NativeApprovalTarget,
>(_params: {
  shouldHandleRequest?: (params: unknown) => boolean;
  resolveApprovers: (params: { cfg: unknown; accountId?: string | null }) => readonly TApprover[];
  mapApprover: (approver: TApprover, params: unknown) => TTarget | null | undefined;
}): (input: unknown) => TTarget[] {
  return () => [];
}
