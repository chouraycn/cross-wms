// 审批客户端运行时：渠道 exec 审批客户端辅助。
// openclaw 原始实现为 barrel 重导出，依赖 ./approval-client-helpers.js。
// 此处提供最小可用类型与桩函数，待依赖模块移植后接入。

/** exec 审批客户端配置档案。 */
export type ChannelExecApprovalProfile = {
  /** 是否启用。 */
  enabled: boolean | "auto";
  /** 转发模式。 */
  mode?: string | null;
  /** agent 过滤器。 */
  agentFilter?: string[];
  /** 会话过滤器。 */
  sessionFilter?: string[];
};

/** exec 审批回复元数据。 */
export type ExecApprovalReplyMetadata = {
  approvalKind: "exec";
  approvalId: string;
  agentId?: string;
  sessionKey?: string;
};

/** 审批请求过滤器匹配参数。 */
export type MatchesApprovalRequestFiltersParams = {
  request: {
    agentId?: string;
    sessionKey?: string;
  };
  agentFilter?: string[];
  sessionFilter?: string[];
  fallbackAgentIdFromSessionKey?: boolean;
};

/** 创建渠道 exec 审批配置档案。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function createChannelExecApprovalProfile(
  _params?: Partial<ChannelExecApprovalProfile>,
): ChannelExecApprovalProfile {
  return {
    enabled: false,
    mode: "session",
    agentFilter: [],
    sessionFilter: [],
  };
}

/** 从回复负载中读取 exec 审批元数据。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function getExecApprovalReplyMetadata(_payload: unknown): ExecApprovalReplyMetadata | undefined {
  return undefined;
}

/** 从配置判断渠道 exec 审批客户端是否启用。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function isChannelExecApprovalClientEnabledFromConfig(_cfg: unknown): boolean {
  return false;
}

/** 判断目标接收者是否为 exec 审批的目标。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function isChannelExecApprovalTargetRecipient(_params: {
  cfg: unknown;
  accountId?: string | null;
  target?: unknown;
}): boolean {
  return false;
}

/** 匹配审批请求过滤器。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function matchesApprovalRequestFilters(
  params: MatchesApprovalRequestFiltersParams,
): boolean {
  const { request, agentFilter, sessionFilter } = params;
  if (agentFilter && agentFilter.length > 0) {
    const agentId = request.agentId;
    if (!agentId) return false;
    if (!agentFilter.includes(agentId)) return false;
  }
  if (sessionFilter && sessionFilter.length > 0) {
    const sessionKey = request.sessionKey;
    if (!sessionKey) return false;
    if (!sessionFilter.includes(sessionKey)) return false;
  }
  return true;
}
