// 审批处理器运行时：审批处理器适配器与审批视图文本辅助。
// openclaw 原始实现从 ../infra/approval-handler-runtime.js、./approval-gateway-runtime.js、
// ../../packages/normalization-core/src/string-coerce.js、../infra/approval-view-model.types.js、
// ../infra/exec-approvals.js、../infra/plugin-approvals.js、./approval-renderers.js 导入。
// 此处提供最小可用类型与桩函数，待依赖子系统移植后接入。

/** 审批动作视图。 */
export type ApprovalActionView = {
  kind: string;
  label?: string;
  value?: string;
};

/** 审批元数据视图。 */
export type ApprovalMetadataView = {
  approvalId: string;
  approvalKind: "exec" | "plugin";
  agentId?: string;
  sessionKey?: string;
};

/** 审批视图模型。 */
export type ApprovalViewModel = {
  kind: "pending" | "resolved" | "expired";
  approvalKind: "exec" | "plugin";
  approvalId: string;
  actions?: ApprovalActionView[];
  metadata?: ApprovalMetadataView;
};

/** exec 审批过期视图。 */
export type ExecApprovalExpiredView = ApprovalViewModel & {
  kind: "expired";
  approvalKind: "exec";
};

/** exec 审批待处理视图。 */
export type ExecApprovalPendingView = ApprovalViewModel & {
  kind: "pending";
  approvalKind: "exec";
};

/** exec 审批已解决视图。 */
export type ExecApprovalResolvedView = ApprovalViewModel & {
  kind: "resolved";
  approvalKind: "exec";
};

/** 渠道审批原生命令运行时最终动作。 */
export type ChannelApprovalNativeFinalAction = {
  kind: "approve" | "deny" | "expired" | "unknown";
  text?: string;
};

/** 渠道审批原生命令运行时可用性适配器。 */
export type ChannelApprovalNativeAvailabilityAdapter = {
  isAvailable(params: { cfg: unknown; accountId?: string | null }): boolean;
};

/** 渠道审批原生命令运行时交互适配器。 */
export type ChannelApprovalNativeInteractionAdapter = {
  resolveFinalAction(params: unknown): ChannelApprovalNativeFinalAction | undefined;
};

/** 渠道审批原生命令运行时观察适配器。 */
export type ChannelApprovalNativeObserveAdapter = {
  onApprovalEvent(_event: unknown): void;
};

/** 渠道审批原生命令运行时呈现适配器。 */
export type ChannelApprovalNativePresentationAdapter = {
  renderPending(params: unknown): unknown;
  renderResolved(params: unknown): unknown;
  renderExpired(params: unknown): unknown;
};

/** 渠道审批原生命令运行时传输适配器。 */
export type ChannelApprovalNativeTransportAdapter = {
  send(params: unknown): Promise<unknown>;
};

/** 渠道审批原生命令运行时适配器。 */
export type ChannelApprovalNativeRuntimeAdapter = ChannelApprovalNativeAvailabilityAdapter &
  ChannelApprovalNativeInteractionAdapter &
  ChannelApprovalNativeObserveAdapter &
  ChannelApprovalNativePresentationAdapter &
  ChannelApprovalNativeTransportAdapter;

/** 渠道审批原生命令运行时规格。 */
export type ChannelApprovalNativeRuntimeSpec = {
  channel: string;
  adapter?: ChannelApprovalNativeRuntimeAdapter;
};

/** 渠道审批处理器。 */
export type ChannelApprovalHandler = {
  handleApprovalRequest(params: unknown): Promise<unknown>;
  handleApprovalResolution(params: unknown): Promise<unknown>;
  handleApprovalExpiration(params: unknown): Promise<unknown>;
};

/** 渠道审批处理器适配器。 */
export type ChannelApprovalHandlerAdapter = {
  createHandler(params: unknown): ChannelApprovalHandler;
};

/** 渠道审批能力处理器上下文。 */
export type ChannelApprovalCapabilityHandlerContext = {
  cfg: unknown;
  accountId?: string | null;
  channel: string;
};

/** 过期审批视图。 */
export type ExpiredApprovalView = ApprovalViewModel & {
  kind: "expired";
};

/** 待处理审批视图。 */
export type PendingApprovalView = ApprovalViewModel & {
  kind: "pending";
};

/** 插件审批过期视图。 */
export type PluginApprovalExpiredView = ExpiredApprovalView & {
  approvalKind: "plugin";
};

/** 插件审批待处理视图。 */
export type PluginApprovalPendingView = PendingApprovalView & {
  approvalKind: "plugin";
};

/** 插件审批已解决视图。 */
export type PluginApprovalResolvedView = ApprovalViewModel & {
  kind: "resolved";
  approvalKind: "plugin";
};

/** 已解决审批视图。 */
export type ResolvedApprovalView = ApprovalViewModel & {
  kind: "resolved";
};

/** 渠道审批原生命令运行时上下文能力标识。 */
export const CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY =
  "channel-approval-native-runtime";

/** exec 审批请求（最小结构）。 */
export type ExecApprovalRequest = {
  id: string;
  request: {
    command?: string;
    agentId?: string;
    sessionKey?: string;
    turnSourceAccountId?: string;
  };
};

/** exec 审批已解决（最小结构）。 */
export type ExecApprovalResolved = {
  decision: "approve" | "deny";
  resolvedBy?: string;
};

/** 插件审批请求（最小结构）。 */
export type PluginApprovalRequest = {
  id: string;
  request: {
    agentId?: string;
    sessionKey?: string;
    turnSourceAccountId?: string;
  };
};

/** 插件审批已解决（最小结构）。 */
export type PluginApprovalResolved = {
  decision: "approve" | "deny";
  resolvedBy?: string;
};

/** 审批请求联合类型。 */
export type ApprovalRequest = ExecApprovalRequest | PluginApprovalRequest;

/** 审批已解决联合类型。 */
export type ApprovalResolved = ExecApprovalResolved | PluginApprovalResolved;

/** 创建渠道审批处理器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelApprovalHandler(_params: unknown): ChannelApprovalHandler {
  return {
    async handleApprovalRequest() {
      return undefined;
    },
    async handleApprovalResolution() {
      return undefined;
    },
    async handleApprovalExpiration() {
      return undefined;
    },
  };
}

/** 创建渠道审批原生命令运行时适配器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelApprovalNativeRuntimeAdapter(
  _params: unknown,
): ChannelApprovalNativeRuntimeAdapter {
  return {
    isAvailable() {
      return false;
    },
    resolveFinalAction() {
      return undefined;
    },
    onApprovalEvent() {
      // 待依赖模块移植后接入
    },
    renderPending() {
      return undefined;
    },
    renderResolved() {
      return undefined;
    },
    renderExpired() {
      return undefined;
    },
    async send() {
      return undefined;
    },
  };
}

/** 从能力创建渠道审批处理器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelApprovalHandlerFromCapability(
  _params: unknown,
): ChannelApprovalHandler | undefined {
  return undefined;
}

/** 创建延迟加载的渠道审批原生命令运行时适配器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createLazyChannelApprovalNativeRuntimeAdapter(
  _params: unknown,
): ChannelApprovalNativeRuntimeAdapter {
  return createChannelApprovalNativeRuntimeAdapter(_params);
}

/** 通过网关解析审批。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function resolveApprovalOverGateway(_params: unknown): Promise<unknown> {
  return undefined;
}

/** 构建渠道可见的已解决审批文本（exec 与 plugin 审批）。 */
// TODO: 依赖模块未移植，暂用本地桩
export function buildChannelApprovalResolvedText(params: {
  request: ApprovalRequest;
  resolved: ApprovalResolved;
  view: ResolvedApprovalView;
}): string {
  if (params.view.approvalKind === "plugin") {
    return `✅ Plugin approval ${params.resolved.decision}. ID: ${params.request.id}`;
  }
  const resolvedByText = params.resolved.resolvedBy
    ? ` Resolved by ${params.resolved.resolvedBy}.`
    : "";
  return `✅ Exec approval ${params.resolved.decision}.${resolvedByText} ID: ${params.request.id}`;
}

/** 构建渠道可见的审批过期文本（exec 与 plugin 审批）。 */
// TODO: 依赖模块未移植，暂用本地桩
export function buildChannelApprovalExpiredText(params: {
  request: ApprovalRequest;
  view: ExpiredApprovalView;
}): string {
  if (params.view.approvalKind === "plugin") {
    return `⏱️ Plugin approval expired. ID: ${params.request.id}`;
  }
  return `⏱️ Exec approval expired. ID: ${params.request.id}`;
}

/** 按计划/上下文/回退顺序解析审批路由的账户 ID。 */
export function resolvePreparedApprovalAccountId(params: {
  plannedAccountId?: string | null;
  contextAccountId?: string | null;
  fallbackAccountId?: string | null;
}): string | undefined {
  const normalize = (value?: string | null): string | undefined =>
    value?.trim() || undefined;
  return (
    normalize(params.plannedAccountId) ??
    normalize(params.contextAccountId) ??
    normalize(params.fallbackAccountId)
  );
}
